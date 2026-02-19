import { ClaudeCodeExecutor } from './claude-code.js';
import { ClaudeSdkExecutor } from './claude-sdk.js';
import { CodexExecutor } from './codex.js';
export function createExecutor(config) {
    const executor = config.executor || 'claude-code';
    switch (executor) {
        case 'claude-code':
            return new ClaudeCodeExecutor(config.max_turns);
        case 'anthropic': {
            if (!config.api_key) {
                console.error('  Error: anthropic executor requires an API key.');
                console.error('  Run: maclat use anthropic <your-api-key>');
                process.exit(1);
            }
            return new ClaudeSdkExecutor(config.api_key, config.model, config.max_turns);
        }
        case 'openrouter': {
            if (!config.api_key) {
                console.error('  Error: openrouter executor requires an API key.');
                console.error('  Run: maclat use openrouter <your-api-key>');
                process.exit(1);
            }
            return new ClaudeSdkExecutor(config.api_key, config.model || 'anthropic/claude-sonnet-4-6', config.max_turns, 'https://openrouter.ai/api');
        }
        case 'codex':
            return new CodexExecutor();
        default:
            console.error(`  Unknown executor: ${executor}`);
            console.error(`  Valid options: claude-code, anthropic, openrouter, codex`);
            process.exit(1);
    }
}
//# sourceMappingURL=index.js.map