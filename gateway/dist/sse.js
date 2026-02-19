import { EventEmitter } from 'events';
const emitter = new EventEmitter();
emitter.setMaxListeners(100);
export function broadcastJobEvent(jobId, data) {
    emitter.emit(`job:${jobId}`, data);
}
export function subscribeToJob(jobId, callback) {
    const handler = (data) => callback(data);
    emitter.on(`job:${jobId}`, handler);
    return () => emitter.off(`job:${jobId}`, handler);
}
//# sourceMappingURL=sse.js.map