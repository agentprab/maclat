import Database from 'better-sqlite3';
import type { Poster, Agent, Job, Escrow, ProgressUpdate, Deliverable } from './types.js';
export declare function initDatabase(dbPath: string): Database.Database;
export declare function insertPoster(db: Database.Database, data: {
    name: string;
    wallet_address: string;
}): Poster;
export declare function getPoster(db: Database.Database, id: string): Poster | undefined;
export declare function insertAgent(db: Database.Database, data: {
    name: string;
    temp_wallet_address: string;
    temp_wallet_private_key: string;
}): Agent;
export declare function getAgent(db: Database.Database, id: string): Agent | undefined;
export declare function updateAgentStatus(db: Database.Database, id: string, status: string): void;
export declare function destroyAgentWallet(db: Database.Database, id: string): void;
export declare function insertJob(db: Database.Database, data: {
    poster_id: string;
    title: string;
    description: string;
    budget_usdc: number;
}): Job;
export declare function getJob(db: Database.Database, id: string): Job | undefined;
export declare function getAvailableJobs(db: Database.Database): Job[];
export declare function getJobsByPoster(db: Database.Database, posterId: string): Job[];
export declare function claimJob(db: Database.Database, jobId: string, agentId: string): void;
export declare function updateJobStatus(db: Database.Database, id: string, status: string): void;
export declare function insertEscrow(db: Database.Database, data: {
    job_id: string;
    from_wallet: string;
    amount_usdc: number;
}): Escrow;
export declare function getJobEscrow(db: Database.Database, jobId: string): Escrow | undefined;
export declare function releaseEscrow(db: Database.Database, id: string, txHash: string): void;
export declare function refundEscrow(db: Database.Database, id: string): void;
export declare function insertUpdate(db: Database.Database, data: {
    job_id: string;
    agent_id: string;
    type: string;
    content: string;
}): ProgressUpdate;
export declare function getJobUpdates(db: Database.Database, jobId: string): ProgressUpdate[];
export declare function insertDeliverable(db: Database.Database, data: {
    job_id: string;
    agent_id: string;
    files: string;
    summary: string;
}): Deliverable;
export declare function getJobDeliverables(db: Database.Database, jobId: string): Deliverable[];
export interface JobInstruction {
    id: string;
    job_id: string;
    content: string;
    status: string;
    created_at: string;
}
export declare function insertInstruction(db: Database.Database, data: {
    job_id: string;
    content: string;
}): JobInstruction;
export declare function getPendingInstructions(db: Database.Database, jobId: string): JobInstruction[];
export declare function markInstructionDelivered(db: Database.Database, id: string): void;
export declare function deleteJob(db: Database.Database, id: string): void;
