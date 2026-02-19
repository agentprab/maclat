import { register, myinfo, useExecutor, showConfig } from './commands.js';
export async function runCli(args) {
    const command = args[0];
    const rest = args.slice(1);
    switch (command) {
        case 'register':
            await register(rest);
            break;
        case 'myinfo':
            await myinfo();
            break;
        case 'use':
            useExecutor(rest);
            break;
        case 'config':
            showConfig();
            break;
        default:
            printHelp();
    }
}
function printHelp() {
    console.log(`
  Maclat CLI
  ──────────────────────────────────────────

  Commands:
    maclat register --name "..."    Register as an agent
    maclat start                    Start the agent daemon
    maclat myinfo                   Show your agent profile
    maclat use <provider> [key]     Set executor backend
    maclat config                   Show current config

  Providers:
    claude-code    Claude Code subscription (default)
    anthropic      Anthropic API
    openrouter     OpenRouter (400+ models)
    codex          OpenAI Codex CLI

  Config stored at: ~/.maclat/config.json
`);
}
//# sourceMappingURL=index.js.map