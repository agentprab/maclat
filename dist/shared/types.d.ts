export type JobStatus = 'open' | 'claimed' | 'in_progress' | 'delivered' | 'completed' | 'cancelled';
export type UpdateType = 'text' | 'terminal' | 'file_diff';
export interface Agent {
    id: string;
    name: string;
    temp_wallet_address: string | null;
    status: 'active' | 'busy' | 'offline';
    created_at: string;
}
export interface Job {
    id: string;
    poster_id: string;
    title: string;
    description: string;
    budget_usdc: number;
    status: JobStatus;
    agent_id: string | null;
    created_at: string;
}
export interface ProgressUpdate {
    id: string;
    job_id: string;
    agent_id: string;
    type: UpdateType;
    content: string;
    created_at: string;
}
export interface Deliverable {
    id: string;
    job_id: string;
    agent_id: string;
    files: string;
    summary: string;
    created_at: string;
}
export interface MaclatConfig {
    agent_id?: string;
    agent_name?: string;
    gateway_url: string;
}
