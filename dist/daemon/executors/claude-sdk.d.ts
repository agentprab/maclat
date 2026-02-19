import type { Job } from '../../shared/types.js';
import type { JobExecutor, ExecutionResult, OnUpdate, Interactivity } from '../executor.js';
export declare class ClaudeSdkExecutor implements JobExecutor {
    private apiKey;
    private model;
    private maxTurns;
    private baseUrl?;
    constructor(apiKey: string, model?: string, maxTurns?: number, baseUrl?: string);
    execute(job: Job, workDir: string, onUpdate: OnUpdate, interactivity?: Interactivity): Promise<ExecutionResult>;
}
