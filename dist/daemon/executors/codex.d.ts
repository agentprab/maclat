import type { Job } from '../../shared/types.js';
import type { JobExecutor, ExecutionResult, OnUpdate } from '../executor.js';
export declare class CodexExecutor implements JobExecutor {
    private codexPath;
    constructor();
    execute(job: Job, workDir: string, onUpdate: OnUpdate): Promise<ExecutionResult>;
    private handleEvent;
}
