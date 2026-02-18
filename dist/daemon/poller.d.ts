import type { JobExecutor } from './executor.js';
export declare class JobPoller {
    private gatewayUrl;
    private agentId;
    private executor;
    private running;
    private currentJobId;
    constructor(gatewayUrl: string, agentId: string, executor: JobExecutor);
    start(): Promise<void>;
    stop(): void;
    private pollForJobs;
    private executeJob;
}
