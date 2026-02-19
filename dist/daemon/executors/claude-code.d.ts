import type { Job } from '../../shared/types.js';
import type { JobExecutor, ExecutionResult, OnUpdate } from '../executor.js';
export declare class ClaudeCodeExecutor implements JobExecutor {
    private maxTurns;
    private claudePath;
    constructor(maxTurns?: number);
    execute(job: Job, workDir: string, onUpdate: OnUpdate): Promise<ExecutionResult>;
    private handleStreamEvent;
}
