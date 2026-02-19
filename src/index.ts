#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  switch (command) {
    case 'start': {
      const { startDaemon } = await import('./daemon/index.js');
      await startDaemon(args.slice(1));
      break;
    }
    case 'register':
    case 'myinfo':
    case 'use':
    case 'config': {
      const { runCli } = await import('./cli/index.js');
      await runCli(args);
      break;
    }
    default: {
      const { runCli } = await import('./cli/index.js');
      await runCli(args);
      break;
    }
  }
}

main().catch((err) => {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
});
