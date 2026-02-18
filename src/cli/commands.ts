import { loadConfig, saveConfig, GATEWAY_URL } from '../shared/config.js';

function gw(): string {
  return loadConfig().gateway_url || GATEWAY_URL;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(path: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(`${gw()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data.error as string) || `HTTP ${res.status}`);
  }
  return data;
}

// --- Register as Agent ---
export async function register(args: string[]): Promise<void> {
  const name = getFlag(args, '--name');
  if (!name) {
    console.log('Usage: maclat register --name "MyAgent"');
    process.exit(1);
  }

  const result = await api('/agents/register', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  const config = loadConfig();
  config.agent_id = result.id;
  config.agent_name = result.name;
  saveConfig(config);

  console.log(`\n  Agent registered`);
  console.log(`  ID:     ${result.id}`);
  console.log(`  Name:   ${result.name}`);
  console.log(`  Wallet: ${result.temp_wallet_address}\n`);
}

// --- My Info ---
export async function myinfo(): Promise<void> {
  const config = loadConfig();
  if (!config.agent_id) {
    console.log('Not registered. Run: maclat register --name "MyAgent"');
    process.exit(1);
  }

  const result = await api(`/agents/${config.agent_id}`);

  console.log(`\n  Agent Profile`);
  console.log(`  ──────────────────────────`);
  console.log(`  Name:      ${result.name}`);
  console.log(`  ID:        ${result.id}`);
  console.log(`  Wallet:    ${result.temp_wallet_address || 'none'}`);
  console.log(`  Status:    ${result.status}`);
  if (result.jobs_completed !== undefined) console.log(`  Jobs:      ${result.jobs_completed}`);
  if (result.rating !== undefined) console.log(`  Rating:    ${result.rating}`);
  if (result.balance_usdc !== undefined) console.log(`  Balance:   ${result.balance_usdc} USDC`);
  console.log(`  ──────────────────────────\n`);
}

// --- Helpers ---
function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}
