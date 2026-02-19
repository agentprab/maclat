import { mkdirSync } from 'fs';
import type { Job } from '../../shared/types.js';
import type { JobExecutor, ExecutionResult, OnUpdate, Interactivity } from '../executor.js';
import { buildPrompt } from './prompt.js';
import { collectFiles } from './file-collector.js';
import { bold, dim, gray, green, cyan, costLine, toolPill, fileWrite as fmtFileWrite, agentText, jobDone } from '../format.js';

export class ClaudeSdkExecutor implements JobExecutor {
  private apiKey: string;
  private model: string;
  private maxTurns: number;
  private baseUrl?: string;

  constructor(apiKey: string, model?: string, maxTurns?: number, baseUrl?: string) {
    this.apiKey = apiKey;
    this.model = model || 'claude-sonnet-4-6';
    this.maxTurns = maxTurns || 50;
    this.baseUrl = baseUrl;
  }

  async execute(job: Job, workDir: string, onUpdate: OnUpdate, interactivity?: Interactivity): Promise<ExecutionResult> {
    mkdirSync(workDir, { recursive: true });
    const prompt = buildPrompt(job, workDir);

    const provider = this.baseUrl ? 'OpenRouter' : 'Anthropic';
    console.log(`  ${dim('Using')} ${bold(provider + ' SDK')} ${gray(`(${this.model})`)}`);
    onUpdate('text', `Agent started via ${provider} SDK`);

    // Set env vars for the SDK
    const prevKey = process.env.ANTHROPIC_API_KEY;
    const prevBase = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_API_KEY = this.apiKey;
    if (this.baseUrl) {
      process.env.ANTHROPIC_BASE_URL = this.baseUrl;
    }

    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      let lastText = '';

      const q = query({
        prompt,
        options: {
          allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
          permissionMode: 'bypassPermissions',
          cwd: workDir,
          model: this.model,
          maxTurns: this.maxTurns,
        },
      });

      // Concurrent instruction polling (if interactivity provided)
      let pollingActive = true;
      const pollPromise = interactivity ? (async () => {
        while (pollingActive) {
          await new Promise(r => setTimeout(r, 3000));
          if (!pollingActive) break;
          try {
            const instructions = await interactivity.getInstructions();
            for (const inst of instructions) {
              console.log(`  ${cyan('↳')} ${dim('Instruction:')} ${inst.content.slice(0, 80)}`);
              onUpdate('text', `Received instruction: ${inst.content.slice(0, 100)}`);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              async function* singleMessage(): AsyncGenerator<any> {
                yield {
                  type: 'user',
                  message: { role: 'user', content: inst.content },
                  parent_tool_use_id: null,
                  session_id: '',
                };
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (q as any).streamInput(singleMessage());
              await interactivity.markDelivered(inst.id);
            }
          } catch {
            // Non-critical, continue polling
          }
        }
      })() : Promise.resolve();

      for await (const message of q) {
        const msg = message as Record<string, unknown>;

        if (msg.type === 'assistant') {
          const apiMsg = msg.message as Record<string, unknown> | undefined;
          if (apiMsg?.content && Array.isArray(apiMsg.content)) {
            for (const block of apiMsg.content as Array<Record<string, unknown>>) {
              if (block.type === 'text' && typeof block.text === 'string') {
                const text = block.text.slice(0, 200);
                console.log(agentText(text.split('\n')[0].slice(0, 120)));
                lastText = text;
                onUpdate('text', text);
              } else if (block.type === 'tool_use') {
                const toolName = String(block.name);
                const input = (block.input || {}) as Record<string, unknown>;
                const target = String(input.file_path || input.command || input.pattern || '').slice(0, 60);
                const label = `${toolName}: ${target}`;

                // Pretty terminal output
                console.log(toolPill(toolName, target));
                onUpdate('terminal', label);

                // Emit file_write for Write/Edit tool uses
                if (toolName === 'Write' && typeof input.file_path === 'string' && typeof input.content === 'string') {
                  const relPath = String(input.file_path).replace(new RegExp('^' + workDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?'), '');
                  console.log(fmtFileWrite(relPath));
                  onUpdate('file_write', JSON.stringify({ path: relPath, content: input.content }));
                } else if (toolName === 'Edit' && typeof input.file_path === 'string') {
                  const relPath = String(input.file_path).replace(new RegExp('^' + workDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?'), '');
                  onUpdate('file_write', JSON.stringify({ path: relPath, edit: { old_string: input.old_string, new_string: input.new_string } }));
                }
              }
            }
          }
        } else if (msg.type === 'result') {
          const result = msg.result as string | undefined;
          if (result) {
            console.log('');
            console.log(jobDone(result.slice(0, 200)));
            lastText = result.slice(0, 200);
          }
          const cost = msg.total_cost_usd as number | undefined;
          const turns = msg.num_turns as number | undefined;
          if (cost) console.log(costLine(cost, turns));
        }
      }

      pollingActive = false;
      await pollPromise;

      const files = collectFiles(workDir);
      const summary = lastText || `Job completed via ${provider}. ${files.length} file(s) created.`;
      onUpdate('text', summary.slice(0, 200));

      return { success: true, files, summary };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ${bold('\x1b[31m✗\x1b[39m')} ${errMsg}`);
      onUpdate('text', `Error: ${errMsg}`);
      const files = collectFiles(workDir);
      return { success: false, files, summary: `Error: ${errMsg}` };
    } finally {
      // Restore env vars
      if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
      else delete process.env.ANTHROPIC_API_KEY;
      if (prevBase !== undefined) process.env.ANTHROPIC_BASE_URL = prevBase;
      else delete process.env.ANTHROPIC_BASE_URL;
    }
  }
}
