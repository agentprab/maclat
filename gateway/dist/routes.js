import { insertPoster, getPoster, insertAgent, getAgent, updateAgentStatus, destroyAgentWallet, insertJob, getJob, getAvailableJobs, getJobsByPoster, claimJob, updateJobStatus, insertEscrow, getJobEscrow, releaseEscrow, insertUpdate, getJobUpdates, insertDeliverable, getJobDeliverables, insertInstruction, getPendingInstructions, markInstructionDelivered, deleteJob, } from './db.js';
import { generateTempWallet } from './escrow.js';
import { broadcastJobEvent, subscribeToJob } from './sse.js';
export function createRoutes(app, db) {
    // --- Health ---
    app.get('/health', (c) => c.json({ status: 'ok' }));
    // --- Register Poster ---
    app.post('/register', async (c) => {
        const { name, wallet_address } = await c.req.json();
        if (!name || !wallet_address)
            return c.json({ error: 'name and wallet_address required' }, 400);
        const poster = insertPoster(db, { name, wallet_address });
        return c.json(poster, 201);
    });
    // --- Register Agent ---
    app.post('/agents/register', async (c) => {
        const { name } = await c.req.json();
        if (!name)
            return c.json({ error: 'name required' }, 400);
        const wallet = generateTempWallet();
        const agent = insertAgent(db, { name, temp_wallet_address: wallet.address, temp_wallet_private_key: wallet.privateKey });
        return c.json({ id: agent.id, name: agent.name, temp_wallet_address: agent.temp_wallet_address, status: agent.status }, 201);
    });
    // --- Get Agent ---
    app.get('/agents/:id', (c) => {
        const agent = getAgent(db, c.req.param('id'));
        if (!agent)
            return c.json({ error: 'agent not found' }, 404);
        return c.json({
            id: agent.id,
            name: agent.name,
            temp_wallet_address: agent.temp_wallet_address,
            status: agent.status,
            created_at: agent.created_at,
        });
    });
    // --- Post Job ---
    app.post('/jobs', async (c) => {
        const { poster_id, title, description, budget_usdc } = await c.req.json();
        if (!poster_id || !title || !budget_usdc)
            return c.json({ error: 'poster_id, title, budget_usdc required' }, 400);
        const poster = getPoster(db, poster_id);
        if (!poster)
            return c.json({ error: 'poster not found' }, 404);
        const job = insertJob(db, { poster_id, title, description: description || '', budget_usdc });
        insertEscrow(db, { job_id: job.id, from_wallet: poster.wallet_address, amount_usdc: budget_usdc });
        return c.json(job, 201);
    });
    // --- Available Jobs (must be before /jobs/:id) ---
    app.get('/jobs/available', (c) => {
        return c.json(getAvailableJobs(db));
    });
    // --- Get Job ---
    app.get('/jobs/:id', (c) => {
        const job = getJob(db, c.req.param('id'));
        if (!job)
            return c.json({ error: 'job not found' }, 404);
        const updates = getJobUpdates(db, job.id);
        const deliverables = getJobDeliverables(db, job.id);
        return c.json({ ...job, updates, deliverables });
    });
    // --- Delete Job ---
    app.delete('/jobs/:id', (c) => {
        const id = c.req.param('id');
        const job = getJob(db, id);
        if (!job)
            return c.json({ error: 'job not found' }, 404);
        deleteJob(db, id);
        return c.json({ status: 'deleted' });
    });
    // --- List Jobs ---
    app.get('/jobs', (c) => {
        const posterId = c.req.query('poster_id');
        if (posterId)
            return c.json(getJobsByPoster(db, posterId));
        return c.json(getAvailableJobs(db));
    });
    // --- Claim Job ---
    app.post('/jobs/:id/claim', async (c) => {
        const id = c.req.param('id');
        const { agent_id } = await c.req.json();
        const job = getJob(db, id);
        if (!job)
            return c.json({ error: 'job not found' }, 404);
        if (job.status !== 'open')
            return c.json({ error: `job status is ${job.status}, not open` }, 400);
        claimJob(db, id, agent_id);
        updateAgentStatus(db, agent_id, 'busy');
        broadcastJobEvent(id, { type: 'job_claimed', job_id: id, agent_id });
        return c.json({ status: 'claimed' });
    });
    // --- Start Work ---
    app.post('/jobs/:id/start', (c) => {
        const id = c.req.param('id');
        updateJobStatus(db, id, 'in_progress');
        broadcastJobEvent(id, { type: 'job_started', job_id: id });
        return c.json({ status: 'in_progress' });
    });
    // --- Progress Update ---
    app.post('/jobs/:id/updates', async (c) => {
        const id = c.req.param('id');
        const { agent_id, type, content } = await c.req.json();
        const update = insertUpdate(db, { job_id: id, agent_id, type, content });
        broadcastJobEvent(id, { type: 'progress_update', job_id: id, update });
        return c.json(update, 201);
    });
    // --- Deliver ---
    app.post('/jobs/:id/deliver', async (c) => {
        const id = c.req.param('id');
        const { agent_id, files, summary } = await c.req.json();
        const delivId = insertDeliverable(db, {
            job_id: id,
            agent_id,
            files: JSON.stringify(files),
            summary: summary || 'Job completed',
        }).id;
        updateJobStatus(db, id, 'delivered');
        updateAgentStatus(db, agent_id, 'active');
        broadcastJobEvent(id, { type: 'job_delivered', job_id: id, deliverable_id: delivId });
        return c.json({ id: delivId, status: 'delivered' });
    });
    // --- File Download ---
    app.get('/jobs/:id/files/:path{.+}', (c) => {
        const id = c.req.param('id');
        const filePath = c.req.param('path');
        const deliverables = getJobDeliverables(db, id);
        if (!deliverables || deliverables.length === 0) {
            return c.json({ error: 'no deliverables' }, 404);
        }
        const d = deliverables[deliverables.length - 1];
        const files = JSON.parse(d.files || '[]');
        const file = files.find((f) => f.path === filePath);
        if (!file) {
            return c.json({ error: 'file not found' }, 404);
        }
        c.header('Content-Disposition', `attachment; filename="${filePath.split('/').pop()}"`);
        return c.text(file.content);
    });
    // --- Approve + Escrow Release ---
    app.post('/jobs/:id/approve', async (c) => {
        const id = c.req.param('id');
        const job = getJob(db, id);
        if (!job)
            return c.json({ error: 'job not found' }, 404);
        if (!job.agent_id)
            return c.json({ error: 'no agent assigned' }, 400);
        updateJobStatus(db, id, 'completed');
        const escrow = getJobEscrow(db, id);
        const agent = getAgent(db, job.agent_id);
        const txHash = `sim_${Date.now()}`;
        if (escrow) {
            releaseEscrow(db, escrow.id, txHash);
        }
        if (agent) {
            destroyAgentWallet(db, agent.id);
        }
        const payment = {
            amount_usdc: job.budget_usdc,
            tx_hash: txHash,
            to_wallet: agent?.temp_wallet_address || 'unknown',
            agent_wallet_destroyed: true,
        };
        broadcastJobEvent(id, {
            type: 'job_approved',
            job_id: id,
            ...payment,
        });
        return c.json({ status: 'completed', payment });
    });
    // --- Post Instruction ---
    app.post('/jobs/:id/instructions', async (c) => {
        const id = c.req.param('id');
        const { content } = await c.req.json();
        if (!content)
            return c.json({ error: 'content required' }, 400);
        const job = getJob(db, id);
        if (!job)
            return c.json({ error: 'job not found' }, 404);
        const instruction = insertInstruction(db, { job_id: id, content });
        // Record as progress update so it shows in the feed
        const update = insertUpdate(db, { job_id: id, agent_id: 'user', type: 'instruction', content });
        broadcastJobEvent(id, { type: 'progress_update', job_id: id, update });
        return c.json(instruction, 201);
    });
    // --- Get Pending Instructions (daemon polling) ---
    app.get('/jobs/:id/instructions', (c) => {
        const id = c.req.param('id');
        const status = c.req.query('status');
        if (status === 'pending') {
            return c.json(getPendingInstructions(db, id));
        }
        return c.json([]);
    });
    // --- Mark Instruction Delivered ---
    app.patch('/jobs/:id/instructions/:iid', async (c) => {
        const iid = c.req.param('iid');
        markInstructionDelivered(db, iid);
        return c.json({ status: 'ok' });
    });
    // --- SSE Stream ---
    app.get('/jobs/:id/stream', (c) => {
        const id = c.req.param('id');
        const job = getJob(db, id);
        if (!job)
            return c.json({ error: 'job not found' }, 404);
        return new Response(new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                const send = (event, data) => {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                };
                // Send current status
                send('status', { status: job.status });
                // Subscribe to updates
                const unsubscribe = subscribeToJob(id, (data) => {
                    try {
                        send(data.type, data);
                    }
                    catch {
                        unsubscribe();
                    }
                });
                // Keep-alive ping
                const pingInterval = setInterval(() => {
                    try {
                        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
                    }
                    catch {
                        clearInterval(pingInterval);
                        unsubscribe();
                    }
                }, 15000);
                // Cleanup on close
                c.req.raw.signal.addEventListener('abort', () => {
                    clearInterval(pingInterval);
                    unsubscribe();
                });
            },
        }), {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    });
}
//# sourceMappingURL=routes.js.map