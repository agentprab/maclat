import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function broadcastJobEvent(jobId: string, data: Record<string, unknown>): void {
  emitter.emit(`job:${jobId}`, data);
}

export function subscribeToJob(jobId: string, callback: (data: Record<string, unknown>) => void): () => void {
  const handler = (data: Record<string, unknown>) => callback(data);
  emitter.on(`job:${jobId}`, handler);
  return () => emitter.off(`job:${jobId}`, handler);
}
