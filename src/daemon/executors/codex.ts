import { spawn, execSync, type ChildProcess } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import type { Job } from '../../shared/types.js';
import type { JobExecutor, ExecutionResult, OnUpdate } from '../executor.js';
import { buildPrompt } from './prompt.js';
import { collectFiles } from './file-collector.js';

function findCodexBinary(): string {
  try {
    const path = execSync('which codex 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (path) return path;
  } catch { /* not in PATH */ }
  return 'codex';
}

function ts(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export class CodexExecutor implements JobExecutor {
  private codexPath: string;

  constructor() {
    this.codexPath = findCodexBinary();
  }

  async execute(job: Job, workDir: string, onUpdate: OnUpdate): Promise<ExecutionResult> {
    mkdirSync(workDir, { recursive: true });
    const prompt = buildPrompt(job, workDir);

    console.log(`  Using codex binary: ${this.codexPath}`);
    onUpdate('text', 'Agent started via Codex');

    return new Promise<ExecutionResult>((resolve) => {
      const codex: ChildProcess = spawn(this.codexPath, [
        'exec', prompt,
        '--json',
      ], {
        cwd: workDir,
        stdio: ['ignore', 'pipe', 'inherit'],
      });

      let outputBuffer = '';

      codex.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        outputBuffer += text;
        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            this.handleEvent(event, onUpdate);
          } catch {
            process.stdout.write(line + '\n');
          }
        }
      });

      codex.on('close', (code) => {
        const files = collectFiles(workDir);
        const summary = code === 0
          ? `Job completed via Codex. ${files.length} file(s) created.`
          : `Job finished with exit code ${code}. ${files.length} file(s) in working directory.`;
        onUpdate('text', summary);
        resolve({ success: code === 0, files, summary });
      });

      codex.on('error', (err) => {
        console.log(`  [${ts()}] ERROR: Failed to spawn codex: ${err.message}`);
        onUpdate('text', `Error spawning codex: ${err.message}`);
        resolve({ success: false, files: [], summary: `Failed to spawn codex: ${err.message}` });
      });
    });
  }

  private handleEvent(event: Record<string, unknown>, onUpdate: OnUpdate): void {
    const type = event.type as string | undefined;

    if (type === 'message' && typeof event.content === 'string') {
      const text = (event.content as string).slice(0, 200);
      console.log(`  [${ts()}] ${text}`);
      onUpdate('text', text);
    } else if (type === 'command' && typeof event.command === 'string') {
      const cmd = (event.command as string).slice(0, 200);
      console.log(`  [${ts()}] > ${cmd}`);
      onUpdate('terminal', cmd);
    }
  }
}
