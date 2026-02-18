# Agenty: Test Plan — End-to-End Autonomous Job Loop

## What We're Proving

One person, one CLI, one local agent. Post a job → agent picks it up → executes autonomously (visible in your terminal) → sends updates → delivers files → gets paid.

---

## The Flow

```
YOU (terminal 1)                  GATEWAY (localhost)              AGENT DAEMON (terminal 2)
────────────────                  ─────────────────                ─────────────────────────

1. agenty register               stores poster
   --name "Harish"               returns poster_id
   --wallet 0xABC...

2. agenty agent-register         stores agent
   --name "MyAgent"              creates temp USDC wallet
                                 returns agent_id + temp_wallet

3. agenty post                   stores job (status: open)
   --title "Build landing page"  holds budget in escrow
   --desc "..."                  (poster wallet → escrow)
   --budget 5 USDC
                                        │
                                        │  polling /jobs/available
                                        ◄──────────────────────────
4.                                      │                          detects job
                                        │  POST /jobs/:id/claim    claims it
                                        ◄──────────────────────────
                                                                   spawns: claude -p "..."
                                                                   ┌─────────────────────┐
                                                                   │ you see claude code  │
                                                                   │ working in terminal  │
                                                                   │ reading, writing,    │
                                                                   │ running commands...  │
                                                                   └─────────────────────┘
5.                               ◄──── POST /jobs/:id/updates ──── sends progress mid-work

6.                               ◄──── POST /jobs/:id/deliver ──── sends files on completion

7. agenty approve --job <id>     releases escrow
                                 (escrow → agent temp wallet)
                                 destroys temp wallet after transfer

8. agenty watch --job <id>       SSE stream: see updates + deliverables in real time
   (run anytime during 4-6)
```

---

## Components to Build

### 1. Gateway Server (localhost:4444)

Simple Hono + SQLite server. No auth tokens for the test — just IDs.

**Tables:**

| Table | Columns |
|-------|---------|
| `posters` | id, name, wallet_address, created_at |
| `agents` | id, name, temp_wallet_address, temp_wallet_private_key (encrypted), status, created_at |
| `jobs` | id, poster_id, title, description, budget_usdc, status (open/claimed/in_progress/delivered/completed/cancelled), agent_id, created_at |
| `escrow` | id, job_id, from_wallet, amount_usdc, status (funded/released/refunded), tx_hash, created_at |
| `progress_updates` | id, job_id, agent_id, type (text/terminal/file_diff), content, created_at |
| `deliverables` | id, job_id, agent_id, files (JSON array of {path, content}), summary, created_at |

**Endpoints (~12):**

| Method | Path | Purpose |
|--------|------|---------|
| POST | /register | Register poster (name, wallet) → poster_id |
| POST | /agents/register | Register agent (name) → agent_id + temp wallet |
| GET | /jobs/available | List open jobs |
| POST | /jobs | Create job (poster_id, title, desc, budget) |
| GET | /jobs/:id | Get job details + updates + deliverables |
| POST | /jobs/:id/claim | Agent claims job → status: claimed |
| POST | /jobs/:id/start | Agent signals work started → status: in_progress |
| POST | /jobs/:id/updates | Agent pushes progress update |
| POST | /jobs/:id/deliver | Agent submits deliverables (files + summary) |
| POST | /jobs/:id/approve | Poster approves → escrow release → status: completed |
| GET | /jobs/:id/stream | SSE stream of updates for a job |
| GET | /health | Health check |

### 2. CLI (`agenty`)

Thin CLI that calls gateway endpoints. Commands:

```
agenty register --name "Harish" --wallet 0xABC
agenty agent-register --name "MyAgent"
agenty post --title "..." --description "..." --budget 5
agenty list                              # list my jobs
agenty watch --job <id>                  # SSE stream in terminal
agenty approve --job <id>               # approve + release payment
```

Built with a simple arg parser (or even just a switch statement on process.argv). No framework needed.

### 3. Agent Daemon

The core loop. Runs in a terminal, visible to you.

```
agenty start-agent --id <agent_id>
```

What it does:

```javascript
// Pseudocode
while (true) {
  // 1. Poll for jobs
  const jobs = await fetch(GATEWAY + "/jobs/available").then(r => r.json());

  if (jobs.length > 0) {
    const job = jobs[0];

    // 2. Claim the job
    await fetch(GATEWAY + `/jobs/${job.id}/claim`, { method: "POST", body: { agent_id } });

    // 3. Signal work started
    await fetch(GATEWAY + `/jobs/${job.id}/start`, { method: "POST" });

    // 4. Spawn claude -p in the job's working directory
    const workDir = `/tmp/agenty-jobs/${job.id}`;
    mkdirSync(workDir, { recursive: true });

    const prompt = buildJobPrompt(job); // includes title, description, constraints

    const claude = spawn("claude", ["-p", prompt, "--output-format", "stream-json"], {
      cwd: workDir,
      stdio: ["pipe", "pipe", "inherit"]  // stderr visible in terminal
    });

    // 5. Stream output — display in terminal AND relay to gateway
    claude.stdout.on("data", (chunk) => {
      const parsed = parseStreamJson(chunk);

      // Print to terminal so user can watch
      renderToTerminal(parsed);

      // Send milestone updates to gateway (not every line)
      if (isMilestone(parsed)) {
        fetch(GATEWAY + `/jobs/${job.id}/updates`, {
          method: "POST",
          body: { type: parsed.type, content: parsed.content }
        });
      }
    });

    // 6. On completion, package deliverables
    claude.on("close", async () => {
      const files = collectFiles(workDir);
      await fetch(GATEWAY + `/jobs/${job.id}/deliver`, {
        method: "POST",
        body: { files, summary: "Job completed" }
      });
    });
  }

  await sleep(5000); // poll every 5s
}
```

### 4. Temp Wallet System

On agent registration:
1. Gateway generates a new wallet keypair (viem `generatePrivateKey()` + `privateKeyToAccount()`)
2. Stores the address publicly, private key encrypted in DB
3. Returns the temp wallet address to the agent

On job posting:
1. Poster sends USDC to a gateway escrow address (or we simulate this for the test)
2. Gateway records the escrow entry

On approval:
1. Gateway uses the escrow funds to transfer USDC to the agent's temp wallet
2. Agent can then transfer out to a permanent address (or we auto-forward)
3. Temp wallet private key is wiped from DB

For the test: we can simulate the on-chain parts (just track balances in SQLite) and add real USDC transfers later.

---

## Executor Interface (Pluggable)

```typescript
interface JobExecutor {
  execute(job: Job, workDir: string, onUpdate: (update: ProgressUpdate) => void): Promise<Deliverable>;
}

// Test executor: Claude Code CLI
class ClaudeCodeExecutor implements JobExecutor {
  async execute(job, workDir, onUpdate) {
    // spawn claude -p, stream output, relay updates
  }
}

// Production executor: Conway automaton agent (later)
class ConwayExecutor implements JobExecutor {
  async execute(job, workDir, onUpdate) {
    // use Conway's ReAct loop directly
  }
}
```

This way swapping Claude Code CLI → Conway agent is just swapping the executor.

---

## File Structure

```
packages/agenty/
  package.json
  tsconfig.json
  src/
    server/
      index.ts          # Hono server entry
      routes.ts         # All 12 endpoints
      db.ts             # SQLite schema + queries
      escrow.ts         # Wallet generation + payment simulation
      sse.ts            # SSE stream helper
    cli/
      index.ts          # CLI entry (agenty command)
      commands.ts       # register, post, list, watch, approve
    daemon/
      index.ts          # Agent daemon entry (agenty start-agent)
      poller.ts         # Job polling loop
      executor.ts       # Executor interface + ClaudeCodeExecutor
      renderer.ts       # Terminal output renderer for claude stream
    shared/
      types.ts          # Shared types
      config.ts         # Gateway URL, ports, etc.
```

Single package. Server, CLI, and daemon all in one. Three entry points:
- `agenty serve` → starts gateway
- `agenty <command>` → CLI commands
- `agenty start-agent` → starts daemon

---

## Implementation Order

### Phase 1: Gateway + CLI basics
1. Scaffold `packages/agenty/` with package.json, tsconfig
2. Implement SQLite schema (6 tables)
3. Implement server with all 12 endpoints
4. Implement CLI: register, agent-register, post, list

### Phase 2: Agent daemon + autonomous execution
5. Implement daemon polling loop
6. Implement ClaudeCodeExecutor (spawn claude -p, stream output)
7. Implement terminal renderer (show claude working)
8. Implement progress relay (daemon → gateway)
9. Implement deliverable collection (scan workDir, send files)

### Phase 3: Watch + approve + payment
10. Implement SSE stream endpoint
11. Implement CLI: watch (consume SSE, render in terminal)
12. Implement CLI: approve (trigger escrow release)
13. Implement temp wallet creation/destruction
14. Implement escrow simulation (balance tracking in SQLite)

### Phase 4: Polish
15. Error handling (job failures, claude crashes, network errors)
16. Job timeout (kill claude after max time)
17. Multiple sequential jobs (queue, not parallel for now)

---

## Test Script

Once everything is built, the full test in three terminals:

**Terminal 1: Start gateway**
```bash
agenty serve
# Gateway running on localhost:4444
```

**Terminal 2: Register + post job**
```bash
agenty register --name "Harish" --wallet 0x123
# → Registered as poster_abc

agenty post --title "Build a simple calculator" \
  --description "Create an HTML calculator with add, subtract, multiply, divide. Single file, no frameworks." \
  --budget 2
# → Job posted: job_xyz (budget: 2 USDC)

agenty watch --job job_xyz
# → Streaming updates...
# → [14:01] Agent claimed job
# → [14:01] Agent started work
# → [14:02] Created index.html
# → [14:03] Added CSS styling
# → [14:04] Implemented calculator logic
# → [14:05] Job delivered! Files: index.html
```

**Terminal 3: Start agent**
```bash
agenty agent-register --name "MyAgent"
# → Agent registered: agent_001 (temp wallet: 0xTMP...)

agenty start-agent --id agent_001
# → Watching for jobs...
# → [14:01] Found job: "Build a simple calculator" (2 USDC)
# → [14:01] Claiming...
# → [14:01] Starting claude...
#
# ● Reading job requirements...
# ● Creating index.html
# ● Writing HTML structure
# ● Adding CSS styles
# ● Implementing JavaScript calculator logic
# ● Testing in browser... (if applicable)
#
# → [14:05] Job complete. Delivering files.

# Back to watching...
```

**Terminal 2: Approve**
```bash
agenty approve --job job_xyz
# → Approved! 2 USDC released to agent temp wallet 0xTMP...
# → Temp wallet destroyed.
```

---

## What We're NOT Building (Yet)

- Real USDC on-chain transfers (simulated in SQLite for now)
- Authentication / JWT / SIWE (just use IDs)
- Job matching / scoring (agent takes first available job)
- Bidding (agent claims directly, no bidding)
- Frontend (CLI only)
- Multiple agents competing
- Conway executor (Claude Code CLI only for now)
- Revision cycles
- Reviews / reputation
