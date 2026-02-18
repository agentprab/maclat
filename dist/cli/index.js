import { register, myinfo } from './commands.js';
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

  Config stored at: ~/.maclat/config.json
`);
}
//# sourceMappingURL=index.js.map