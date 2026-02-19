import { POLL_INTERVAL_MS, JOBS_DIR } from '../shared/config.js';
import { join } from 'path';
import { bold, dim, gray, toolPill, fileWrite as fmtFileWrite, agentText, jobFound, jobDone, jobError, } from './format.js';
export class JobPoller {
    gatewayUrl;
    agentId;
    executor;
    running = false;
    currentJobId = null;
    idleInterval = null;
    constructor(gatewayUrl, agentId, executor) {
        this.gatewayUrl = gatewayUrl;
        this.agentId = agentId;
        this.executor = executor;
    }
    async start() {
        this.running = true;
        this.startIdleAnimation();
        while (this.running) {
            try {
                if (!this.currentJobId) {
                    await this.pollForJobs();
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.log(jobError(`Poll failed: ${msg}`));
            }
            await sleep(POLL_INTERVAL_MS);
        }
    }
    stop() {
        this.running = false;
        this.stopIdleAnimation();
    }
    startIdleAnimation() {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        this.idleInterval = setInterval(() => {
            if (!this.currentJobId) {
                process.stdout.write(`\r  ${gray(frames[i % frames.length])} ${dim('Watching for jobs...')}  `);
                i++;
            }
        }, 100);
    }
    stopIdleAnimation() {
        if (this.idleInterval) {
            clearInterval(this.idleInterval);
            this.idleInterval = null;
        }
    }
    clearIdleLine() {
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }
    async pollForJobs() {
        const res = await fetch(`${this.gatewayUrl}/jobs/available`);
        if (!res.ok)
            return;
        const jobs = (await res.json());
        if (jobs.length === 0)
            return;
        const job = jobs[0];
        this.clearIdleLine();
        console.log(jobFound(job.title, job.budget_usdc));
        await this.executeJob(job);
    }
    async executeJob(job) {
        this.currentJobId = job.id;
        try {
            // 1. Claim the job
            console.log(`  ${dim('Claiming job...')}`);
            const claimRes = await fetch(`${this.gatewayUrl}/jobs/${job.id}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_id: this.agentId }),
            });
            if (!claimRes.ok) {
                const err = (await claimRes.json());
                console.log(jobError(`Failed to claim: ${err.error}`));
                this.currentJobId = null;
                return;
            }
            // 2. Signal work started
            console.log(`  ${bold('Starting work...')}`);
            await fetch(`${this.gatewayUrl}/jobs/${job.id}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            console.log('');
            // 3. Set up progress relay (POST to gateway + pretty terminal output)
            const onUpdate = async (type, content) => {
                // Terminal output
                if (type === 'terminal') {
                    // Parse "ToolName: target" format
                    const colonIdx = content.indexOf(':');
                    if (colonIdx > 0) {
                        const name = content.slice(0, colonIdx).trim();
                        const target = content.slice(colonIdx + 1).trim().slice(0, 60);
                        console.log(toolPill(name, target));
                    }
                    else {
                        console.log(toolPill(content, ''));
                    }
                }
                else if (type === 'file_write') {
                    try {
                        const data = JSON.parse(content);
                        console.log(fmtFileWrite(data.path));
                    }
                    catch {
                        console.log(fmtFileWrite(content));
                    }
                }
                else if (type === 'text') {
                    // Truncate long text, show first line only
                    const firstLine = content.split('\n')[0].slice(0, 120);
                    console.log(agentText(firstLine));
                }
                // Gateway relay
                try {
                    await fetch(`${this.gatewayUrl}/jobs/${job.id}/updates`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ agent_id: this.agentId, type, content }),
                    });
                }
                catch {
                    // Non-critical
                }
            };
            // 4. Set up interactivity (instruction injection)
            const interactivity = {
                getInstructions: async () => {
                    try {
                        const res = await fetch(`${this.gatewayUrl}/jobs/${job.id}/instructions?status=pending`);
                        if (!res.ok)
                            return [];
                        return await res.json();
                    }
                    catch {
                        return [];
                    }
                },
                markDelivered: async (id) => {
                    try {
                        await fetch(`${this.gatewayUrl}/jobs/${job.id}/instructions/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'delivered' }),
                        });
                    }
                    catch { /* non-critical */ }
                },
            };
            // 5. Execute the job
            const workDir = join(JOBS_DIR, job.id);
            const result = await this.executor.execute(job, workDir, onUpdate, interactivity);
            // 6. Deliver results
            console.log('');
            console.log(`  ${dim('Delivering')} ${bold(String(result.files.length))} ${dim('files...')}`);
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
                console.log(jobDone(`${result.files.length} files delivered`));
            }
            else {
                console.log(jobError('Failed to send deliverables.'));
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(jobError(`Job execution failed: ${msg}`));
        }
        finally {
            this.currentJobId = null;
            console.log('');
        }
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=poller.js.map