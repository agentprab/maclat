import { spawn, execSync, type ChildProcess } from 'child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';
import type { Job } from '../shared/types.js';

export interface ExecutionResult {
  success: boolean;
  files: Array<{ path: string; content: string }>;
  summary: string;
}

export type OnUpdate = (type: 'text' | 'terminal', content: string) => void;

export interface JobExecutor {
  execute(job: Job, workDir: string, onUpdate: OnUpdate): Promise<ExecutionResult>;
}

function findClaudeBinary(): string {
  // Check PATH first
  try {
    const path = execSync('which claude 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (path) return path;
  } catch { /* not in PATH */ }

  // Check known macOS location
  const appSupport = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude-code');
  if (existsSync(appSupport)) {
    const versions = readdirSync(appSupport).sort().reverse(); // latest first
    for (const v of versions) {
      const bin = join(appSupport, v, 'claude');
      if (existsSync(bin)) return bin;
    }
  }

  // Fallback
  return 'claude';
}

function ts(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

const GATEWAY_UPDATE_INTERVAL_MS = 60_000; // push to gateway every 60s

export class ClaudeCodeExecutor implements JobExecutor {
  private maxTurns: number;
  private claudePath: string;

  constructor(maxTurns = 50) {
    this.maxTurns = maxTurns;
    this.claudePath = findClaudeBinary();
  }

  async execute(job: Job, workDir: string, onUpdate: OnUpdate): Promise<ExecutionResult> {
    mkdirSync(workDir, { recursive: true });

    const prompt = this.buildPrompt(job, workDir);

    console.log(`  Using claude binary: ${this.claudePath}`);

    return new Promise<ExecutionResult>((resolve) => {
      const claude: ChildProcess = spawn(this.claudePath, [
        '-p', prompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--max-turns', String(this.maxTurns),
        '--dangerously-skip-permissions',
      ], {
        cwd: workDir,
        stdio: ['ignore', 'pipe', 'inherit'],
        env: { ...process.env, CLAUDECODE: undefined },
      });

      let outputBuffer = '';
      let lastGatewayUpdate = 0;
      const pendingActions: string[] = [];
      const stripPath = (s: string) => s.replace(new RegExp(workDir + '/?', 'g'), '');

      claude.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        outputBuffer += text;

        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            this.handleStreamEvent(event, onUpdate, pendingActions, stripPath, () => {
              const now = Date.now();
              if (now - lastGatewayUpdate >= GATEWAY_UPDATE_INTERVAL_MS && pendingActions.length > 0) {
                lastGatewayUpdate = now;
                const summary = pendingActions.splice(0).join(' → ');
                onUpdate('text', summary.slice(0, 500));
              }
            });
          } catch {
            if (line.trim()) {
              process.stdout.write(line + '\n');
            }
          }
        }
      });

      claude.on('close', (code) => {
        const files = this.collectFiles(workDir);
        const summary = code === 0
          ? `Job completed successfully. ${files.length} file(s) created.`
          : `Job finished with exit code ${code}. ${files.length} file(s) in working directory.`;

        if (pendingActions.length > 0) {
          onUpdate('text', pendingActions.join(' → ').slice(0, 500));
          pendingActions.length = 0;
        }

        onUpdate('text', summary);

        resolve({
          success: code === 0,
          files,
          summary,
        });
      });

      claude.on('error', (err) => {
        console.log(`  [${ts()}] ERROR: Failed to spawn claude: ${err.message}`);
        onUpdate('text', `Error spawning claude: ${err.message}`);
        resolve({
          success: false,
          files: [],
          summary: `Failed to spawn claude: ${err.message}`,
        });
      });
    });
  }

  private handleStreamEvent(
    event: Record<string, unknown>,
    onUpdate: OnUpdate,
    pendingActions: string[],
    stripPath: (s: string) => string,
    maybeFlush: () => void,
  ): void {
    switch (event.type) {
      case 'system': {
        console.log(`  [${ts()}] Agent started`);
        onUpdate('text', 'Agent started working');
        break;
      }
      case 'assistant': {
        const msg = event.message as Record<string, unknown> | undefined;
        if (msg?.content && Array.isArray(msg.content)) {
          for (const block of msg.content as Array<Record<string, unknown>>) {
            if (block.type === 'text' && typeof block.text === 'string') {
              const text = stripPath(block.text).slice(0, 500);
              console.log(`  [${ts()}] ${text}`);
              pendingActions.push(text.slice(0, 80));
            } else if (block.type === 'tool_use') {
              const toolName = block.name || 'tool';
              const input = (block.input || {}) as Record<string, unknown>;
              const rawTarget = String(input.file_path || input.path || input.command || input.pattern || '');
              const target = stripPath(rawTarget);
              const label = target ? `${toolName}: ${target}` : String(toolName);
              console.log(`  [${ts()}] > ${label}`);
              pendingActions.push(label.slice(0, 80));
            }
          }
        }
        maybeFlush();
        break;
      }
      case 'tool_result': {
        const output = stripPath(String(event.output || event.content || '')).slice(0, 200);
        if (output) {
          console.log(`  [${ts()}]   → ${output.split('\n')[0]}`);
        }
        break;
      }
      case 'result': {
        const result = event.result;
        if (typeof result === 'string') {
          const clean = stripPath(result);
          console.log(`\n  [${ts()}] DONE: ${clean.slice(0, 500)}`);
          onUpdate('text', clean.slice(0, 200));
        }
        const cost = event.total_cost_usd;
        const turns = event.num_turns;
        if (cost) console.log(`  [${ts()}] Cost: $${cost}`);
        if (turns) console.log(`  [${ts()}] Turns: ${turns}`);
        break;
      }
    }
  }

  private buildPrompt(job: Job, workDir: string): string {
    return [
      `You are an autonomous agent executing a job from the Maclat marketplace.`,
      ``,
      `## Job Details`,
      `- Title: ${job.title}`,
      `- Description: ${job.description}`,
      `- Budget: ${job.budget_usdc} USDC`,
      ``,
      `## Instructions`,
      `1. Work in the current directory: ${workDir}`,
      `2. Complete the job as described above`,
      `3. Create all necessary files in the current directory`,
      `4. Make sure everything works and is complete`,
      `5. When done, provide a brief summary of what you built`,
      ``,
      `Do your best work. The job poster will review your deliverables.`,
    ].join('\n');
  }

  private collectFiles(dir: string, base?: string): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];
    const root = base || dir;

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          files.push(...this.collectFiles(fullPath, root));
        } else if (stat.isFile() && stat.size < 100_000) {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            files.push({ path: relative(root, fullPath), content });
          } catch {
            // Binary file or unreadable, skip
          }
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }

    return files;
  }
}
