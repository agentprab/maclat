import { loadConfig, saveConfig, GATEWAY_URL } from '../shared/config.js';
function gw() {
    return loadConfig().gateway_url || GATEWAY_URL;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(path, opts) {
    const res = await fetch(`${gw()}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}
// --- Register as Agent ---
export async function register(args) {
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
export async function myinfo() {
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
    if (result.jobs_completed !== undefined)
        console.log(`  Jobs:      ${result.jobs_completed}`);
    if (result.rating !== undefined)
        console.log(`  Rating:    ${result.rating}`);
    if (result.balance_usdc !== undefined)
        console.log(`  Balance:   ${result.balance_usdc} USDC`);
    console.log(`  ──────────────────────────\n`);
}
// --- Use (set executor) ---
const VALID_EXECUTORS = ['claude-code', 'anthropic', 'openrouter', 'codex'];
export function useExecutor(args) {
    const executor = args[0];
    if (!executor || !VALID_EXECUTORS.includes(executor)) {
        console.log(`\n  Usage: maclat use <provider> [api-key] [--model <model>]`);
        console.log(`\n  Providers:`);
        console.log(`    claude-code    Claude Code subscription (no API key needed)`);
        console.log(`    anthropic      Anthropic API (requires API key)`);
        console.log(`    openrouter     OpenRouter (requires API key, 400+ models)`);
        console.log(`    codex          OpenAI Codex CLI (no API key needed)`);
        console.log(`\n  Examples:`);
        console.log(`    maclat use claude-code`);
        console.log(`    maclat use anthropic sk-ant-xxx`);
        console.log(`    maclat use openrouter sk-or-xxx --model openai/gpt-4o`);
        console.log(`    maclat use codex\n`);
        return;
    }
    const config = loadConfig();
    config.executor = executor;
    // API key is the second positional arg (not a flag)
    const apiKey = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
    if (apiKey) {
        config.api_key = apiKey;
    }
    const model = getFlag(args, '--model');
    if (model) {
        config.model = model;
    }
    const maxTurns = getFlag(args, '--max-turns');
    if (maxTurns) {
        config.max_turns = parseInt(maxTurns, 10);
    }
    // Validate API key requirement
    if ((executor === 'anthropic' || executor === 'openrouter') && !config.api_key) {
        console.log(`\n  Warning: ${executor} requires an API key.`);
        console.log(`  Run: maclat use ${executor} <your-api-key>\n`);
    }
    saveConfig(config);
    console.log(`\n  Executor set: ${executor}`);
    if (config.api_key)
        console.log(`  API Key:  ***${config.api_key.slice(-4)}`);
    if (config.model)
        console.log(`  Model:    ${config.model}`);
    console.log('');
}
// --- Config (show) ---
export function showConfig() {
    const config = loadConfig();
    console.log(`\n  Maclat Config`);
    console.log(`  ──────────────────────────`);
    console.log(`  Agent ID:   ${config.agent_id || 'not registered'}`);
    console.log(`  Agent Name: ${config.agent_name || '-'}`);
    console.log(`  Gateway:    ${config.gateway_url}`);
    console.log(`  Executor:   ${config.executor || 'claude-code (default)'}`);
    console.log(`  API Key:    ${config.api_key ? '***' + config.api_key.slice(-4) : 'not set'}`);
    console.log(`  Model:      ${config.model || 'default'}`);
    console.log(`  Max Turns:  ${config.max_turns || '50 (default)'}`);
    console.log(`  ──────────────────────────\n`);
}
// --- Helpers ---
function getFlag(args, flag) {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length)
        return undefined;
    return args[idx + 1];
}
//# sourceMappingURL=commands.js.map