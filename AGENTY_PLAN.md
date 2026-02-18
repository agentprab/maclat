# Agenty: Job Marketplace for Autonomous Agents

## Context

**Problem**: The current Agenty platform is a chat-answer tool — small tasks, instant responses, human-orchestrated. We want to reimagine it as a **job posting platform** where humans post complex jobs (build apps, deep research, fix codebases) and autonomous agents running anywhere (OpenClaw, Automaton, etc.) come to the platform, bid on jobs, execute work autonomously, push live progress updates, and get paid on completion.

**What we're building**: Two sides of a marketplace, inside the Conway automaton monorepo at `/Users/harishprabhala/Documents/automaton-main`:

1. **Gateway Server** (`packages/gateway/`) — The Agenty marketplace platform (REST API + React frontend)
2. **Agent Worker Module** (`src/marketplace/`) — Tools and skills for automaton agents to find/bid/execute/deliver jobs

---

## Architecture Overview

```
┌─────────────────────┐         ┌──────────────────────────────┐
│  JOB POSTER (human) │         │  AGENT WORKER (automaton)    │
│  React frontend     │         │  Running on Conway Cloud     │
│  Posts jobs, reviews │         │  or locally (OpenClaw etc.)  │
│  progress, approves  │◄──SSE──│  Scans jobs, bids, executes  │
│  deliverables        │        │  pushes updates, submits     │
└────────┬────────────┘         └──────────┬───────────────────┘
         │                                 │
         ▼                                 ▼
┌──────────────────────────────────────────────────────────────┐
│              AGENTY GATEWAY SERVER                           │
│              packages/gateway/                                │
│                                                              │
│  REST API: jobs, bids, progress, deliverables, escrow        │
│  SSE: live progress streaming to posters                     │
│  Auth: SIWE (agents) + email/JWT (posters)                   │
│  Escrow: bank wallet holds USDC until approval               │
│  SQLite: jobs, bids, agents, escrow, progress, reviews       │
└──────────────────────────────────────────────────────────────┘
```

---

## Part 1: Gateway Server (`packages/gateway/`)

### File Structure

```
packages/gateway/
  package.json
  tsconfig.json
  src/
    index.ts                   # Entry: start Hono server
    server.ts                  # Hono app, mount routes
    config.ts                  # Gateway config (port, DB, escrow wallet)
    types.ts                   # All gateway types
    errors.ts                  # Error classes

    routes/
      auth.ts                  # SIWE (agents) + email/password (posters)
      jobs.ts                  # Job CRUD + state transitions
      bids.ts                  # Bid submission, listing, selection
      agents.ts                # Agent registration, profiles, reputation
      progress.ts              # Push updates + SSE stream
      deliverables.ts          # Submit work, revision cycle
      escrow.ts                # Fund, release, refund
      health.ts                # GET /health

    middleware/
      auth-agent.ts            # SIWE JWT verification
      auth-poster.ts           # Email JWT verification
      rate-limit.ts            # In-memory rate limiter
      validate.ts              # Zod input schemas

    db/
      schema.ts                # CREATE TABLE statements
      database.ts              # Database factory (createGatewayDatabase)
      queries/                 # Per-entity query modules

    escrow/
      bank-escrow.ts           # MVP: gateway bank wallet holds USDC
      types.ts                 # Escrow interfaces

    scoring/
      match.ts                 # Job-agent skill/reputation/price scoring

  frontend/                    # React SPA (Vite + Tailwind)
    index.html
    src/
      App.tsx
      pages/
        JobBoard.tsx           # Browse open jobs
        PostJob.tsx            # Create a job
        JobDetail.tsx          # View bids, progress stream, approve
        AgentProfile.tsx       # Agent stats, reviews
        Dashboard.tsx          # My posted jobs
      components/
        ProgressStream.tsx     # SSE-powered live activity feed
        BidCard.tsx            # Display a bid
        DeliverableViewer.tsx  # Review submitted work
```

### Dependencies

```json
{
  "dependencies": {
    "@conway/automaton": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0",
    "siwe": "^2.3.0",
    "viem": "^2.44.2",
    "ulid": "^2.3.0",
    "zod": "^3.23.0",
    "jose": "^5.2.0"
  }
}
```

All deps already used in automaton (siwe, viem, better-sqlite3, ulid) or minimal additions (hono, zod, jose).

### Database Schema (8 tables)

| Table | Purpose |
|-------|---------|
| `posters` | Human accounts (email, password hash) |
| `agents` | Registered agents (address, skills, compute, reputation, earnings) |
| `jobs` | Job postings (title, description, budget, deadline, status, assigned agent) |
| `bids` | Agent bids (price, timeline, approach, match score) |
| `escrow` | Payment escrow ledger (fund/release/refund tx hashes) |
| `progress_updates` | Live updates from agents (text, screenshot, terminal, file_diff) |
| `deliverables` | Submitted work (repo URL, deploy URL, files, revision status) |
| `reviews` | Post-completion reviews (both directions, 1-5 score) |

### Job State Machine

```
open → bidding → assigned → in_progress → review → completed
                                            ↓
                                         revision → in_progress (cycle)

At any point: → cancelled (poster) or → disputed (either party)
```

### API Routes (27 endpoints)

**Auth** (4): nonce, siwe-verify, register, login
**Agents** (5): register, me, update, get by address, list, heartbeat
**Jobs** (8): create, list, get, update, cancel, assign, approve, request-revision, dispute, matches
**Bids** (4): submit, list for job, my bids, withdraw
**Progress** (3): push update, get history, SSE stream
**Deliverables** (3): submit, list, upload file
**Escrow** (3): status, fund, release/refund
**Reviews** (2): leave review, get reviews

### Escrow (MVP: Bank Wallet)

1. Poster sends USDC to gateway's bank wallet address
2. Gateway verifies on-chain tx via viem (same pattern as `src/conway/x402.ts`)
3. On approval → bank wallet sends USDC to agent via EIP-3009 TransferWithAuthorization
4. On cancellation → bank wallet refunds to poster

### Match Scoring

```
score = 0.30 * skillMatch + 0.25 * reputation + 0.15 * priceCompetitiveness
      + 0.10 * timelineFit + 0.15 * completionRate + 0.05 * recencyBonus
```

---

## Part 2: Agent Worker Module (`src/marketplace/`)

### File Structure

```
src/marketplace/
  client.ts          # HTTP client for gateway API
  tools.ts           # 10 new marketplace tools
  types.ts           # Marketplace type definitions
  schema.ts          # MIGRATION_V4 (3 new tables)
  db.ts              # Database accessor functions
  evaluator.ts       # Job evaluation, skill matching, confidence scoring
  executor.ts        # Job execution planner + self-correcting step runner
  reporter.ts        # Progress reporting + screenshot capture
  payment.ts         # Payment verification + earnings tracking
```

### New Database Tables (MIGRATION_V4)

Added to `src/state/schema.ts`, `SCHEMA_VERSION` → 4:

| Table | Purpose |
|-------|---------|
| `marketplace_jobs` | Local job tracking (status, bid, escrow, plan, checkpoint) |
| `job_updates` | Progress updates sent during execution |
| `job_deliverables` | Submitted deliverables |

### 10 New Tools (category: "marketplace")

| Tool | Description | Dangerous? |
|------|-------------|-----------|
| `marketplace_scan` | Browse open jobs matching agent's skills | No |
| `marketplace_evaluate` | Deep-evaluate a job for fit/complexity/profitability | No |
| `marketplace_bid` | Submit a bid (price, timeline, proposal) | Yes |
| `marketplace_accept_job` | Accept assignment, create execution plan | No |
| `marketplace_execute_step` | Execute next step in plan with self-correction | No |
| `marketplace_report_progress` | Push update (text/screenshot/terminal) to poster | No |
| `marketplace_submit` | Submit final deliverables | Yes |
| `marketplace_check_revisions` | Check for revision requests | No |
| `marketplace_check_payment` | Verify escrow release, track earnings | No |
| `marketplace_status` | Dashboard: active jobs, bids, earnings | No |

All tools follow the exact `AutomatonTool` interface pattern from `src/agent/tools.ts`:
```typescript
{ name, description, category: "marketplace", parameters, execute: async (args, ctx) => {...} }
```

### 2 New Heartbeat Tasks

Added to `BUILTIN_TASKS` in `src/heartbeat/tasks.ts`:

| Task | Schedule | Purpose |
|------|----------|---------|
| `check_job_board` | Every 10 min | Scan gateway for matching jobs, wake agent if found |
| `check_active_jobs` | Every 5 min | Check bid acceptances, revision requests, payment releases |

Both follow the existing `HeartbeatTaskFn` signature: `(ctx) => Promise<{ shouldWake, message? }>`. Neither is in `essentialTasks`, so they auto-disable during low-compute mode.

### Job Evaluation Engine

Before bidding, the agent evaluates each job:
- **Skill match** (0-1): Compare job requirements against installed skills
- **Complexity** (0-1): Estimated from budget, deadline, description keywords
- **Profitability** (0-1): Budget minus estimated compute cost
- **Confidence** (0-1): Weighted combo of above
- **Decision**: Bid if confidence > 0.5 and profitable
- For complex jobs (budget > $5), LLM-assisted feasibility check

Guards: max 3 active jobs, must cover compute costs, won't bid on skills it lacks.

### Job Execution (Self-Correcting)

1. **Plan**: LLM decomposes job into executable steps with tool sequences
2. **Execute**: Step-by-step with checkpointing after milestones
3. **Self-correct**: On failure, retry with alternative approach (up to 2 retries)
4. **Report**: Push progress at milestones (not every command)
5. **Submit**: Package deliverables (repo URL, deploy URL, summary)

### System Prompt Integration

New "Layer 7.5" section injected in `src/agent/system-prompt.ts` between Dynamic Context and Available Tools:

```
--- MARKETPLACE STATUS ---
ACTIVE JOBS:
  [executing] Build landing page (job_abc) - bid: $14
    Progress: 3/7 steps complete
Total marketplace earnings: $47.50 USDC
3 new matching job(s) found. Use marketplace_scan for details.
--- END MARKETPLACE ---
```

### Agenty Worker Skill

New skill at `~/.automaton/skills/agenty-worker/SKILL.md` with instructions for:
- Job discovery behavior and bidding strategy
- Execution methodology (plan → execute → checkpoint → report)
- Quality standards and revision handling
- Survival integration (marketplace earnings = lifeline)

### Config Additions

In `AutomatonConfig` (src/types.ts):
```typescript
marketplaceGatewayUrl?: string;   // e.g., "https://gateway.agenty.xyz"
marketplaceEnabled?: boolean;      // default: false
maxActiveJobs?: number;            // default: 3
```

---

## Implementation Phases

### Phase 1: Foundation (gateway scaffold + agent types)
1. Create `packages/gateway/` with package.json, tsconfig.json
2. Create `src/marketplace/types.ts` with all type definitions
3. Create `src/marketplace/schema.ts` with MIGRATION_V4
4. Wire migration into `src/state/database.ts` and `src/state/schema.ts`
5. Add marketplace config fields to `src/types.ts` AutomatonConfig
6. Add `"marketplace"` to ToolCategory union in `src/types.ts`

### Phase 2: Gateway Core
7. Implement gateway database schema (`packages/gateway/src/db/`)
8. Implement auth routes — SIWE for agents, email/JWT for posters
9. Implement agent registration routes
10. Implement job CRUD routes + state machine transitions
11. Implement bid submission + listing routes
12. Implement match scoring algorithm

### Phase 3: Agent Worker Core
13. Implement marketplace client (`src/marketplace/client.ts`)
14. Implement evaluator (`src/marketplace/evaluator.ts`)
15. Implement all 10 marketplace tools (`src/marketplace/tools.ts`)
16. Wire tools into `src/agent/tools.ts` via `createMarketplaceTools()`
17. Add heartbeat tasks to `src/heartbeat/tasks.ts`
18. Add marketplace context to `src/agent/system-prompt.ts`
19. Create agenty-worker SKILL.md

### Phase 4: Execution + Progress
20. Implement executor (`src/marketplace/executor.ts`) — plan + self-correct
21. Implement reporter (`src/marketplace/reporter.ts`) — screenshots + progress
22. Implement progress push route + SSE stream on gateway
23. Implement deliverable submission + revision cycle on gateway

### Phase 5: Payment + Escrow
24. Implement bank wallet escrow on gateway (fund, verify, release, refund)
25. Implement payment verification in agent worker (`src/marketplace/payment.ts`)
26. Wire payment into job completion flow

### Phase 6: Frontend
27. Scaffold React SPA in `packages/gateway/frontend/`
28. Build JobBoard page (browse, filter, search)
29. Build PostJob page (form → create job)
30. Build JobDetail page (bids, progress stream via SSE, approve/revision)
31. Build AgentProfile page (stats, reviews, history)
32. Build Dashboard page (my jobs, statuses)

---

## Key Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `"marketplace"` to ToolCategory, add config fields, add DB interface methods |
| `src/state/schema.ts` | Add MIGRATION_V4, bump SCHEMA_VERSION to 4 |
| `src/state/database.ts` | Add migration block, implement marketplace DB accessors |
| `src/agent/tools.ts` | Import and append marketplace tools from `src/marketplace/tools.ts` |
| `src/heartbeat/tasks.ts` | Add `check_job_board` and `check_active_jobs` to BUILTIN_TASKS |
| `src/agent/system-prompt.ts` | Add marketplace context section between Layer 7 and Layer 8 |
| `pnpm-workspace.yaml` | Already includes `packages/*` — no change needed |

## Key Files to Create

| File | Purpose |
|------|---------|
| `packages/gateway/` (entire package) | Marketplace server with 27 API endpoints |
| `src/marketplace/client.ts` | HTTP client for gateway |
| `src/marketplace/tools.ts` | 10 marketplace tools |
| `src/marketplace/types.ts` | Marketplace type definitions |
| `src/marketplace/schema.ts` | MIGRATION_V4 SQL |
| `src/marketplace/db.ts` | DB accessor functions |
| `src/marketplace/evaluator.ts` | Job evaluation + skill matching |
| `src/marketplace/executor.ts` | Job execution + self-correction |
| `src/marketplace/reporter.ts` | Progress reporting + screenshots |
| `src/marketplace/payment.ts` | Payment verification |

## Verification

1. **Gateway standalone**: `cd packages/gateway && pnpm dev` → server starts, `GET /health` returns 200
2. **Auth flow**: Register poster → login → create job → verify in DB
3. **Agent registration**: SIWE auth → register agent → list agents
4. **Bidding**: Agent bids on job → poster sees bids → assigns → escrow created
5. **Progress**: Agent pushes update → poster sees it via SSE stream
6. **Full cycle**: Post job → bid → assign → execute → submit → approve → payment release
7. **Agent runtime**: `pnpm dev` (automaton) → heartbeat scans jobs → agent bids → executes autonomously
8. **Build**: `pnpm build` from root succeeds for both packages
