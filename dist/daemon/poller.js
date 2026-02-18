import { POLL_INTERVAL_MS, JOBS_DIR } from '../shared/config.js';
import { join } from 'path';
export class JobPoller {
    gatewayUrl;
    agentId;
    executor;
    running = false;
    currentJobId = null;
    constructor(gatewayUrl, agentId, executor) {
        this.gatewayUrl = gatewayUrl;
        this.agentId = agentId;
        this.executor = executor;
    }
    async start() {
        this.running = true;
        console.log(`  Watching for jobs... (polling every ${POLL_INTERVAL_MS / 1000}s)\n`);
        while (this.running) {
            try {
                if (!this.currentJobId) {
                    await this.pollForJobs();
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.log(`  [error] Poll failed: ${msg}`);
            }
            await sleep(POLL_INTERVAL_MS);
        }
    }
    stop() {
        this.running = false;
    }
    async pollForJobs() {
        const res = await fetch(`${this.gatewayUrl}/jobs/available`);
        if (!res.ok)
            return;
        const jobs = (await res.json());
        if (jobs.length === 0)
            return;
        // Take the first available job
        const job = jobs[0];
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        console.log(`  [${time}] Found job: "${job.title}" (${job.budget_usdc} USDC)`);
        await this.executeJob(job);
    }
    async executeJob(job) {
        this.currentJobId = job.id;
        const time = () => new Date().toLocaleTimeString('en-US', { hour12: false });
        try {
            // 1. Claim the job
            console.log(`  [${time()}] Claiming...`);
            const claimRes = await fetch(`${this.gatewayUrl}/jobs/${job.id}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_id: this.agentId }),
            });
            if (!claimRes.ok) {
                const err = (await claimRes.json());
                console.log(`  [${time()}] Failed to claim: ${err.error}`);
                this.currentJobId = null;
                return;
            }
            // 2. Signal work started
            console.log(`  [${time()}] Starting work...`);
            await fetch(`${this.gatewayUrl}/jobs/${job.id}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            // 3. Set up progress relay
            const onUpdate = async (type, content) => {
                try {
                    await fetch(`${this.gatewayUrl}/jobs/${job.id}/updates`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ agent_id: this.agentId, type, content }),
                    });
                }
                catch {
                    // Non-critical, don't crash on failed update
                }
            };
            // 4. Execute the job
            console.log(`  [${time()}] Spawning claude...\n`);
            const workDir = join(JOBS_DIR, job.id);
            const result = await this.executor.execute(job, workDir, onUpdate);
            // 5. Deliver results
            console.log(`\n  [${time()}] Job ${result.success ? 'completed' : 'finished'}. Delivering files...`);
            const deliverRes = await fetch(`${this.gatewayUrl}/jobs/${job.id}/deliver`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agent_id: this.agentId,
                    files: result.files,
                    summary: result.summary,
                }),
            });
            if (deliverRes.ok) {
                console.log(`  [${time()}] Deliverables sent (${result.files.length} files).`);
            }
            else {
                console.log(`  [${time()}] Failed to send deliverables.`);
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`  [error] Job execution failed: ${msg}`);
        }
        finally {
            this.currentJobId = null;
            console.log(`\n  Back to watching for jobs...\n`);
        }
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=poller.js.map