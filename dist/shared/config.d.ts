import type { MaclatConfig } from './types.js';
export declare const GATEWAY_URL = "https://api.maclat.com";
export declare const CONFIG_PATH: string;
export declare const POLL_INTERVAL_MS = 5000;
export declare const MAX_CLAUDE_TURNS = 50;
export declare const JOBS_DIR: string;
export declare function ensureMaclatDir(): void;
export declare function loadConfig(): MaclatConfig;
export declare function saveConfig(config: MaclatConfig): void;
