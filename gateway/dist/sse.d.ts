export declare function broadcastJobEvent(jobId: string, data: Record<string, unknown>): void;
export declare function subscribeToJob(jobId: string, callback: (data: Record<string, unknown>) => void): () => void;
