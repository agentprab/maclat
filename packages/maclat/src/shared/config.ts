import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { MaclatConfig } from './types.js';

export const GATEWAY_URL = 'https://api.maclat.com';
export const CONFIG_PATH = join(homedir(), '.maclat', 'config.json');
export const POLL_INTERVAL_MS = 5000;
export const MAX_CLAUDE_TURNS = 50;
export const JOBS_DIR = join(homedir(), '.maclat', 'jobs');

export function ensureMaclatDir(): void {
  const dir = join(homedir(), '.maclat');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(JOBS_DIR)) {
    mkdirSync(JOBS_DIR, { recursive: true });
  }
}

export function loadConfig(): MaclatConfig {
  ensureMaclatDir();
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  }
  return { gateway_url: GATEWAY_URL };
}

export function saveConfig(config: MaclatConfig): void {
  ensureMaclatDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
