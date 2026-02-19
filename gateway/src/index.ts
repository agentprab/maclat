import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { initDatabase } from './db.js';
import { createRoutes } from './routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8123;
const DATA_DIR = join(homedir(), '.maclat-gateway');
const DB_PATH = join(DATA_DIR, 'gateway.db');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = initDatabase(DB_PATH);
const app = new Hono();

// Serve the UI at /
app.get('/', (c) => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf-8');
  return c.html(html);
});

createRoutes(app, db);

console.log(`\n  Maclat Gateway`);
console.log(`  ──────────────────────────`);
console.log(`  URL:  http://localhost:${PORT}`);
console.log(`  DB:   ${DB_PATH}`);
console.log(`  ──────────────────────────\n`);

serve({ fetch: app.fetch, port: PORT });
