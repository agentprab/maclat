import { loadConfig, GATEWAY_URL } from '../shared/config.js';
import { ClaudeCodeExecutor } from './executor.js';
import { JobPoller } from './poller.js';

export async function startDaemon(args: string[]): Promise<void> {
  const config = loadConfig();
  const agentId = getFlag(args, '--id') || config.agent_id;

  if (!agentId) {
    console.log('No agent ID. Register first: maclat register --name "MyAgent"');
    console.log('Or pass: maclat start --id <agent_id>');
    process.exit(1);
  }

  const gatewayUrl = config.gateway_url || GATEWAY_URL;

  // Verify gateway is reachable
  try {
    const res = await fetch(`${gatewayUrl}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    console.log(`Cannot reach gateway at ${gatewayUrl}`);
    process.exit(1);
  }

  console.log(`\n  Maclat Agent Daemon`);
  console.log(`  ──────────────────────────`);
  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Gateway:  ${gatewayUrl}`);
  console.log(`  ──────────────────────────\n`);

  const executor = new ClaudeCodeExecutor();
  const poller = new JobPoller(gatewayUrl, agentId, executor);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n  Shutting down agent daemon...');
    poller.stop();
    process.exit(0);
  });

  await poller.start();
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}
