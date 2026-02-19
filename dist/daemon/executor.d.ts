import type { Job } from '../shared/types.js';
export interface ExecutionResult {
    success: boolean;
    files: Array<{
        path: string;
        content: string;
    }>;
    summary: string;
}
export type OnUpdate = (type: 'text' | 'terminal' | 'file_write', content: string) => void;
export interface Interactivity {
    getInstructions: () => Promise<Array<{
        id: string;
        content: string;
    }>>;
    markDelivered: (id: string) => Promise<void>;
}
export interface JobExecutor {
    execute(job: Job, workDir: string, onUpdate: OnUpdate, interactivity?: Interactivity): Promise<ExecutionResult>;
}
