import type { Job } from '../shared/types.js';
export interface ExecutionResult {
    success: boolean;
    files: Array<{
        path: string;
        content: string;
    }>;
    summary: string;
}
export type OnUpdate = (type: 'text' | 'terminal', content: string) => void;
export interface JobExecutor {
    execute(job: Job, workDir: string, onUpdate: OnUpdate): Promise<ExecutionResult>;
}
export declare class ClaudeCodeExecutor implements JobExecutor {
    private maxTurns;
    private claudePath;
    constructor(maxTurns?: number);
    execute(job: Job, workDir: string, onUpdate: OnUpdate): Promise<ExecutionResult>;
    private handleStreamEvent;
    private buildPrompt;
    private collectFiles;
}
