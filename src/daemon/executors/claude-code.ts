import { spawn, execSync, type ChildProcess } from 'child_process';
import { mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Job } from '../../shared/types.js';
import type { JobExecutor, ExecutionResult, OnUpdate } from '../executor.js';
import { buildPrompt } from './prompt.js';
import { collectFiles } from './file-collector.js';
import { bold, dim, gray, green, cyan, toolPill, fileWrite as fmtFileWrite, agentText, jobDone, jobError, costLine } from '../format.js';

function findClaudeBinary(): string {
  try {
    const path = execSync('which claude 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (path) return path;
  } catch { /* not in PATH */ }

  const appSupport = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude-code');
  if (existsSync(appSupport)) {
    const versions = readdirSync(appSupport).sort().reverse();
    for (const v of versions) {
      const bin = join(appSupport, v, 'claude');
      if (existsSync(bin)) return bin;
    }
  }

  return 'claude';
}

const GATEWAY_UPDATE_INTERVAL_MS = 60_000;

export class ClaudeCodeExecutor implements JobExecutor {
  private maxTurns: number;
  private claudePath: string;

  constructor(maxTurns = 50) {
    this.maxTurns = maxTurns;
    this.claudePath = findClaudeBinary();
  }

  async execute(job: Job, workDir: string, onUpdate: OnUpdate): Promise<ExecutionResult> {
    mkdirSync(workDir, { recursive: true });
    const prompt = buildPrompt(job, workDir);

    console.log(`  ${dim('Using')} ${bold('Claude Code')} ${gray(`(${this.claudePath})`)}`);

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
            if (line.trim()) process.stdout.write(line + '\n');
          }
        }
      });

      claude.on('close', (code) => {
        const files = collectFiles(workDir);
        const summary = code === 0
          ? `Job completed successfully. ${files.length} file(s) created.`
          : `Job finished with exit code ${code}. ${files.length} file(s) in working directory.`;

        if (pendingActions.length > 0) {
          onUpdate('text', pendingActions.join(' → ').slice(0, 500));
          pendingActions.length = 0;
        }
        onUpdate('text', summary);
        console.log('');
        console.log(jobDone(`${files.length} files created`));
        resolve({ success: code === 0, files, summary });
      });

      claude.on('error', (err) => {
        console.log(jobError(`Failed to spawn claude: ${err.message}`));
        onUpdate('text', `Error spawning claude: ${err.message}`);
        resolve({ success: false, files: [], summary: `Failed to spawn claude: ${err.message}` });
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
        console.log(agentText('Agent started'));
        onUpdate('text', 'Agent started working');
        break;
      }
      case 'assistant': {
        const msg = event.message as Record<string, unknown> | undefined;
        if (msg?.content && Array.isArray(msg.content)) {
          for (const block of msg.content as Array<Record<string, unknown>>) {
            if (block.type === 'text' && typeof block.text === 'string') {
              const text = stripPath(block.text).slice(0, 500);
              console.log(agentText(text.split('\n')[0].slice(0, 120)));
              pendingActions.push(text.slice(0, 80));
            } else if (block.type === 'tool_use') {
              const toolName = String(block.name || 'tool');
              const input = (block.input || {}) as Record<string, unknown>;
              const rawTarget = String(input.file_path || input.path || input.command || input.pattern || '');
              const target = stripPath(rawTarget).slice(0, 60);
              const label = target ? `${toolName}: ${target}` : String(toolName);

              // Pretty terminal output
              console.log(toolPill(toolName, target));
              pendingActions.push(label.slice(0, 80));
              onUpdate('terminal', label);

              // Emit file_write for Write/Edit tool uses
              if (toolName === 'Write' && typeof input.file_path === 'string' && typeof input.content === 'string') {
                const relPath = stripPath(String(input.file_path));
                console.log(fmtFileWrite(relPath));
                onUpdate('file_write', JSON.stringify({ path: relPath, content: input.content }));
              } else if (toolName === 'Edit' && typeof input.file_path === 'string') {
                const relPath = stripPath(String(input.file_path));
                onUpdate('file_write', JSON.stringify({ path: relPath, edit: { old_string: input.old_string, new_string: input.new_string } }));
              }
            }
          }
        }
        maybeFlush();
        break;
      }
      case 'tool_result': {
        const output = stripPath(String(event.output || event.content || '')).slice(0, 200);
        if (output) console.log(`  ${gray('→')} ${dim(output.split('\n')[0])}`);
        break;
      }
      case 'result': {
        const result = event.result;
        if (typeof result === 'string') {
          const clean = stripPath(result);
          console.log('');
          console.log(jobDone(clean.slice(0, 200)));
          onUpdate('text', clean.slice(0, 200));
        }
        const cost = event.total_cost_usd;
        const turns = event.num_turns;
        if (cost) console.log(costLine(cost as number, turns as number | undefined));
        break;
      }
    }
  }
}
