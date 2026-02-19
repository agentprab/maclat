import Database from 'better-sqlite3';
import { ulid } from 'ulid';
import type { Poster, Agent, Job, Escrow, ProgressUpdate, Deliverable } from './types.js';

export function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS posters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      temp_wallet_address TEXT,
      temp_wallet_private_key TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      poster_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      budget_usdc REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      agent_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS escrow (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      from_wallet TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'funded',
      tx_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS progress_updates (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deliverables (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      files TEXT,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_instructions (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

// --- Posters ---
export function insertPoster(db: Database.Database, data: { name: string; wallet_address: string }): Poster {
  const id = ulid();
  db.prepare('INSERT INTO posters (id, name, wallet_address) VALUES (?, ?, ?)').run(id, data.name, data.wallet_address);
  return getPoster(db, id)!;
}

export function getPoster(db: Database.Database, id: string): Poster | undefined {
  return db.prepare('SELECT * FROM posters WHERE id = ?').get(id) as Poster | undefined;
}

// --- Agents ---
export function insertAgent(db: Database.Database, data: { name: string; temp_wallet_address: string; temp_wallet_private_key: string }): Agent {
  const id = ulid();
  db.prepare('INSERT INTO agents (id, name, temp_wallet_address, temp_wallet_private_key) VALUES (?, ?, ?, ?)').run(id, data.name, data.temp_wallet_address, data.temp_wallet_private_key);
  return getAgent(db, id)!;
}

export function getAgent(db: Database.Database, id: string): Agent | undefined {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined;
}

export function updateAgentStatus(db: Database.Database, id: string, status: string): void {
  db.prepare('UPDATE agents SET status = ? WHERE id = ?').run(status, id);
}

export function destroyAgentWallet(db: Database.Database, id: string): void {
  db.prepare('UPDATE agents SET temp_wallet_address = NULL, temp_wallet_private_key = NULL WHERE id = ?').run(id);
}

// --- Jobs ---
export function insertJob(db: Database.Database, data: { poster_id: string; title: string; description: string; budget_usdc: number }): Job {
  const id = ulid();
  db.prepare('INSERT INTO jobs (id, poster_id, title, description, budget_usdc) VALUES (?, ?, ?, ?, ?)').run(id, data.poster_id, data.title, data.description, data.budget_usdc);
  return getJob(db, id)!;
}

export function getJob(db: Database.Database, id: string): Job | undefined {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Job | undefined;
}

export function getAvailableJobs(db: Database.Database): Job[] {
  return db.prepare("SELECT * FROM jobs WHERE status = 'open' ORDER BY created_at ASC").all() as Job[];
}

export function getJobsByPoster(db: Database.Database, posterId: string): Job[] {
  return db.prepare('SELECT * FROM jobs WHERE poster_id = ? ORDER BY created_at DESC').all(posterId) as Job[];
}

export function claimJob(db: Database.Database, jobId: string, agentId: string): void {
  db.prepare("UPDATE jobs SET agent_id = ?, status = 'claimed' WHERE id = ?").run(agentId, jobId);
}

export function updateJobStatus(db: Database.Database, id: string, status: string): void {
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
}

// --- Escrow ---
export function insertEscrow(db: Database.Database, data: { job_id: string; from_wallet: string; amount_usdc: number }): Escrow {
  const id = ulid();
  db.prepare('INSERT INTO escrow (id, job_id, from_wallet, amount_usdc) VALUES (?, ?, ?, ?)').run(id, data.job_id, data.from_wallet, data.amount_usdc);
  return db.prepare('SELECT * FROM escrow WHERE id = ?').get(id) as Escrow;
}

export function getJobEscrow(db: Database.Database, jobId: string): Escrow | undefined {
  return db.prepare('SELECT * FROM escrow WHERE job_id = ?').get(jobId) as Escrow | undefined;
}

export function releaseEscrow(db: Database.Database, id: string, txHash: string): void {
  db.prepare("UPDATE escrow SET status = 'released', tx_hash = ? WHERE id = ?").run(txHash, id);
}

export function refundEscrow(db: Database.Database, id: string): void {
  db.prepare("UPDATE escrow SET status = 'refunded' WHERE id = ?").run(id);
}

// --- Progress Updates ---
export function insertUpdate(db: Database.Database, data: { job_id: string; agent_id: string; type: string; content: string }): ProgressUpdate {
  const id = ulid();
  db.prepare('INSERT INTO progress_updates (id, job_id, agent_id, type, content) VALUES (?, ?, ?, ?, ?)').run(id, data.job_id, data.agent_id, data.type, data.content);
  return db.prepare('SELECT * FROM progress_updates WHERE id = ?').get(id) as ProgressUpdate;
}

export function getJobUpdates(db: Database.Database, jobId: string): ProgressUpdate[] {
  return db.prepare('SELECT * FROM progress_updates WHERE job_id = ? ORDER BY created_at ASC').all(jobId) as ProgressUpdate[];
}

// --- Deliverables ---
export function insertDeliverable(db: Database.Database, data: { job_id: string; agent_id: string; files: string; summary: string }): Deliverable {
  const id = ulid();
  db.prepare('INSERT INTO deliverables (id, job_id, agent_id, files, summary) VALUES (?, ?, ?, ?, ?)').run(id, data.job_id, data.agent_id, data.files, data.summary);
  return db.prepare('SELECT * FROM deliverables WHERE id = ?').get(id) as Deliverable;
}

export function getJobDeliverables(db: Database.Database, jobId: string): Deliverable[] {
  return db.prepare('SELECT * FROM deliverables WHERE job_id = ? ORDER BY created_at ASC').all(jobId) as Deliverable[];
}

// --- Instructions ---
export interface JobInstruction {
  id: string;
  job_id: string;
  content: string;
  status: string;
  created_at: string;
}

export function insertInstruction(db: Database.Database, data: { job_id: string; content: string }): JobInstruction {
  const id = ulid();
  db.prepare('INSERT INTO job_instructions (id, job_id, content) VALUES (?, ?, ?)').run(id, data.job_id, data.content);
  return db.prepare('SELECT * FROM job_instructions WHERE id = ?').get(id) as JobInstruction;
}

export function getPendingInstructions(db: Database.Database, jobId: string): JobInstruction[] {
  return db.prepare("SELECT * FROM job_instructions WHERE job_id = ? AND status = 'pending' ORDER BY created_at ASC").all(jobId) as JobInstruction[];
}

export function markInstructionDelivered(db: Database.Database, id: string): void {
  db.prepare("UPDATE job_instructions SET status = 'delivered' WHERE id = ?").run(id);
}

// --- Delete Job (cascade) ---
export function deleteJob(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM job_instructions WHERE job_id = ?').run(id);
  db.prepare('DELETE FROM deliverables WHERE job_id = ?').run(id);
  db.prepare('DELETE FROM progress_updates WHERE job_id = ?').run(id);
  db.prepare('DELETE FROM escrow WHERE job_id = ?').run(id);
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
}
