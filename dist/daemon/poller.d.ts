import type { JobExecutor } from './executor.js';
export declare class JobPoller {
    private gatewayUrl;
    private agentId;
    private executor;
    private running;
    private currentJobId;
    private idleInterval;
    constructor(gatewayUrl: string, agentId: string, executor: JobExecutor);
    start(): Promise<void>;
    stop(): void;
    private startIdleAnimation;
    private stopIdleAnimation;
    private clearIdleLine;
    private pollForJobs;
    private executeJob;
}
