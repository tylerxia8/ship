# PRESEARCH — FleetGraph

Pre-search answers driving the architecture decisions in [FLEETGRAPH.md](FLEETGRAPH.md). Each phase's questions answered in priority order; concrete tradeoffs called out where they exist.

---

## Phase 1 — Define the Agent

### 1. Agent Responsibility Scoping

**Events the agent monitors proactively** — these all derive from polling `documents` and `document_associations` (Ship doesn't emit webhooks today):

- New issue created with `state='blocked'`
- Existing issue transitions to `state='blocked'`
- Issue `updated_at` falls behind a freshness threshold (72h for in_progress, 7d for any state)
- Sprint created
- Sprint window closes
- `weekly_retro` document not created within 48h of sprint close
- `properties.estimate_hours` total assigned to a person exceeds their `properties.capacity_hours` by ≥20%

**Conditions worth surfacing** — high-precision rules layered with low-precision LLM judgment:

| Condition class | Detection | Surface? |
|---|---|---|
| Blocker chain (2+ hop blocked-to-blocked, stale) | Deterministic graph traversal | Yes, gated |
| Sprint slip risk (state distribution × time elapsed) | Deterministic heuristic | Yes, no gate (chat answer) |
| Overload (capacity overrun) | Deterministic sum | Yes, gated for non-requester |
| Stale in-progress | Deterministic threshold | Yes, gated for non-requester |
| Orphan ownership (PTO heuristic) | Deterministic but tunable | Yes, daily batched, admin-gated |
| Retro gap | Deterministic | Yes, soft notification |
| **Open-ended ("anything weird?")** | LLM judgment in `proactive_scan` intent | Only at `confidence='high'`; lower confidence logged for review, not surfaced |

**Without human approval, the agent may:**

- Read any document (subject to requesting user's ACL for on-demand; service-account workspace-wide for proactive)
- Respond to chat with structured answers + citations
- Surface findings in the requester's scoped FleetGraph panel
- Suppress repeated findings via dedup cache
- Log findings to LangSmith + internal analytics table

**Always requires confirmation:**

- Mutating any Ship document — state, assignment, comment, content edit
- Notifying any user other than the requester
- Subscribing/unsubscribing the user from detection classes
- External side effects (none in v1; future Slack/email)

**How the agent knows who is on a project**: Ship's separation between `workspace_memberships` (authorization) and `documents WHERE document_type='person'` (content). Membership for ACL checks; person-document `properties.user_id` joined to issue/sprint owner/assignee fields for assignment graph. Documented in [docs/unified-document-model.md § Authorization vs Content Separation](docs/unified-document-model.md#authorization-vs-content-separation).

**How the agent knows who to notify**: based on the action class:

- Findings about scope X → owner of X (`properties.owner_id` for sprints, `properties.assignee_id` for issues, `properties.user_id` for person docs)
- Escalation → program owner via program document's `properties.owner_id`
- Compliance class (orphan ownership, persistent slip) → workspace admins (`workspace_memberships WHERE role='admin'`)
- On-demand → the requesting user (always)

**How on-demand uses current-view context**: Ship frontend sends `{ scopeType, scopeId, workspaceId }` with every chat message. `context_resolver` uses it to bound the initial fetch, bias the intent classifier, and constrain citations to the current scope plus adjacent documents fetched by the active nodes.

### 2. Use Case Discovery

Use cases derived from **pain points evident in the data model** rather than invented:

| Role | Pain point | Use case |
|---|---|---|
| Engineer | "I don't know if fixing this issue unblocks anything else" — Ship UI shows associations but not the transitive closure | UC 1 — blocker traversal |
| PM | "I find slips at standup, when it's too late" — Ship UI shows current state, not state-vs-pace | UC 2 — slip risk on demand |
| Director | "I can't see capacity across people without manual rollup" — load is implicit, not surfaced | UC 3 — load query |
| PM | "Blocked issues that block other blocked issues fall through the cracks" — Ship UI doesn't traverse | UC 4 — proactive blocker chain |
| Engineer | "Scope creep between retros is invisible until the retro itself" — diff isn't computed | UC 5 — sprint diff |
| PM | "I plan sprints and overcommit; only notice at week 2" — capacity check is post-hoc | UC 6 — sprint creation overcommit warning |

Each use case maps to a specific Ship document type or association pattern. None are inventions — they're each grounded in a real "click around 3+ documents to figure this out" workflow that the unified document model makes addressable.

### 3. Trigger Model Decision

**When proactive runs without a user present**: a `setInterval(60_000)` loop in the agent service enumerates `documents WHERE document_type='sprint' AND computed_status='active'`. For each sprint, if `last_run_at` in `fleetgraph_runs` is older than 4 minutes, fire a graph run with that sprint as scope. Per-scope rate limit prevents thundering herd.

**When a reviewer wants to force a proactive run**: the scoped FleetGraph panel exposes a manual Scan action. Ship calls `POST /api/fleetgraph/scan`, the API proxy forwards to `POST /agent/scan`, and the agent runs the same proactive graph once for the current document.

**Poll vs webhook vs hybrid — tradeoff matrix in FLEETGRAPH.md § Trigger Model.** Summary: poll for v1 because Ship doesn't emit events; webhook deferred because the latency floor (~4 min with polling) is well within the 5-min SLA, and adding event-bus infrastructure to Ship is 2–3 days of Ship-side work outside Week 5's scope.

**Stale tolerance per use case**:

| Use case | Max acceptable staleness | Why |
|---|---|---|
| Blocker chain (UC 4) | 5 min | Brief SLA |
| Slip detection on demand (UC 2) | 0 (synchronous) | User waiting for chat response |
| Capacity overrun (UC 6) | 5 min on sprint creation | Brief SLA |
| Stale assignment | Hours acceptable | Inherently a slow signal |
| Retro gap | Hours acceptable | Daily-cadence reminder |

The 5-min SLA is set by the most-time-sensitive proactive case (blocker chain on a fast-moving sprint). 4-min poll cadence meets it with margin.

**Cost at scale**:

- 100 projects (~20 active sprints) × 360 polls/day = 7,200 proactive runs/day = ~$94/day = $2,820/mo on proactive alone (at the conservative $0.013/run including occasional bounded reasoner calls). Refined in Cost Analysis.
- 1,000 projects (~200 active sprints) → ~$28,200/mo proactive. This is the threshold where webhook migration becomes economic.

---

## Phase 2 — Graph Architecture

### 4. Node Design

Nodes by phase:

- **Context (1 node)** - `context_resolver` normalizes trigger + scope into the typed state object. Deterministic.
- **Routing (1 node)** - `intent_classifier`, Haiku call, maps user message or proactive trigger to one of 6 intents + the fetch subset each needs.
- **Fetch (5 nodes, deterministic chain)** - `fetch_doc`, `fetch_assocs`, `fetch_load`, `fetch_activity`, plus `fetch_history` for diff queries. `fetch_doc` always runs; the others inspect `intent.requiredFetches` and no-op when not needed. Each is a deterministic Ship API call.
- **Reasoning (1 node)** - `reasoner`, Sonnet call with structured output. Follow-up traversal via an `expand_doc(id)` tool is a v2 hardening item.
- **Action (1 node)** - `action_decision`, deterministic classifier emitting `(actions[], needsHumanApproval)`.
- **HITL (1 node)** - `human_gate`, INTERRUPT pause; MVP resumes from MemorySaver while the agent process is alive.
- **Execution (planned)** - Ship API mutations for approved actions are intentionally deferred; MVP gates proposals but does not execute document mutations.
- **Output (1 node)** - formats chat response or notification, persists proactive findings, and finalizes the LangSmith trace.

**Fetch execution**: MVP uses a stable chain instead of parallel branching. This avoids LangGraph.js routing flake while still showing different execution behavior per intent: load checks activate `fetch_load`, slip checks activate `fetch_activity`, diff checks activate `fetch_history`, and blocker checks stay small.

**Conditional edges** (3 total — what makes this a graph, not a pipeline):

1. After `intent_classifier` → 6 distinct fetch subsets; only the relevant nodes execute per run
2. After `reasoner` → `action_decision` routes proactive findings to `output` for persistence; on-demand mutation/notify-other proposals route to `human_gate`; read-only responses go straight to `output`
3. After `human_gate` → user decision resumes the graph to `output`; executor/log/snooze persistence are v2 hardening paths

Distinct intents produce distinct trace shapes. This is the PRD's pipeline-vs-graph test.

### 5. State Management

**In-run state** — `Annotation.Root` schema covering context, intent, fetched data, reasoning output, pending actions, human decision, messages history. Defined in detail in [FLEETGRAPH.md § Graph Diagram](FLEETGRAPH.md#graph-diagram).

**Cross-run state** — MVP uses `MemorySaver` checkpoints indexed by `thread_id`, which is enough for HITL resume while the agent process stays alive. `PostgresSaver` plus durable `fleetgraph_*` tables is the planned hardening path:

- For proactive: `thread_id = sprint_id` (per-sprint conversation continuity)
- For on-demand: `thread_id = conversation_id` (per-chat conversation)

**Persisted state now:**

1. **Findings** — `fleetgraph_findings` stores proactive findings, deduped by `(workspace_id, scope_id, finding_hash)`, and exposed in the contextual FleetGraph chat panel.

**Planned persisted state:**

1. **Checkpoints** — full graph state, for resuming `human_gate` interrupts across restarts
2. **Suppression cache** — `(scope_id, finding_hash) → last_surfaced_at` to prevent re-notifying about already-known conditions beyond the current finding status
3. **Dismissal log** — feedback for exponential-backoff suppression
4. **Per-scope rate limits** — `last_run_at` per scope, enforced by the proactive trigger

**Avoiding redundant API calls:**

- **Within a run**: fetched data lives in state; nodes don't re-fetch
- **Across runs**: planned 60s response cache on the Ship API client (in-memory LRU bounded at 10MB). It will be invalidated when the v2 executor mutates a document
- **Reasoner data**: v1 dedupes persisted cards by a stable fetched-state hash; v2 suppression will prevent repeat surfacing after dismissals and can skip expensive reasoner calls when the condition is unchanged

### 6. Human-in-the-Loop Design

**Which actions require confirmation**: every mutation to Ship state; every notification to a user other than the requester; every subscription change. Read-only responses to the requester are never gated.

**Confirmation experience in Ship**: an inline card in the scoped FleetGraph panel showing:

- Agent's reasoning (1–2 sentences)
- Citations as clickable doc references (Ship's existing markdown-link pattern)
- Proposed action(s) with explicit verb/object ("Comment on AUTH-43 escalating to @program-owner")
- `Approve` / `Dismiss` / `Snooze ▾` buttons

`Snooze` opens a small dropdown: 1h / 1d / 1w / custom. Custom takes a date picker; defaults to next workday at 9am.

**On dismiss in the MVP**: the persisted `fleetgraph_findings` row is marked `dismissed`, which removes it from the scoped panel's open-findings list. A v2 `fleetgraph_dismissals` table will keep a separate feedback log and suppress matching findings for an exponentially-backing-off duration (1d → 1w → permanent unless user re-subscribes).

**On snooze in the MVP**: on-demand HITL resume returns a quiet snoozed response. Durable `snooze_until` scheduling is a v2 hardening path once PostgresSaver/checkpoint persistence is enabled.

**On approve in the MVP**: graph resumes from `human_gate` and records the human decision in the final response; mutating executor calls are intentionally deferred. The v2 executor will call Ship API with the agent's service-account creds and record an audit trail.

### 7. Error and Failure Handling

| Failure | Behavior |
|---|---|
| Ship API 5xx | Exponential backoff: 1s, 3s, 10s. After 3 attempts: proactive logs silently; on-demand returns "Ship is having trouble, try again." |
| Ship API 4xx (auth, not-found) | Graceful terminate at next node boundary. No retry. Logs for investigation. |
| Anthropic API 5xx | Single retry after 1s. On second fail: fall back to a non-LLM response listing the fetched documents without synthesis ("here's what I found, but I couldn't reason about it"). |
| Anthropic API 4xx (rate limit) | Wait for `retry-after` header; fail gracefully if >30s. |
| Document deleted mid-run | Graceful terminate; user-facing message: "the document you were asking about no longer exists." |
| LangSmith outage | Trace queued in a local bounded buffer (5,000 events). Never blocks the user-facing path. |
| Reasoner produces unparseable structured output | Retry once with stricter system prompt. On second fail: return the raw text as a chat answer; no `pendingActions` proposed. |
| Postgres checkpoint write fails | In-memory state takes over; HITL gates can't be resumed until DB recovers. Alert sent to admins. |

**Caching policy:**

- Ship API responses: 60s TTL, in-memory LRU, 10MB cap. Invalidated on agent-initiated mutations.
- LLM responses for `intent_classifier`: 5-min TTL keyed on `(scope_id, user_message_normalized)`. Off by default; can enable for high-volume scopes.
- Reasoner output: never cached at the LLM layer (suppression dedup at the action layer instead).

---

## Phase 3 — Stack and Deployment

### 8. Deployment Model

**Where the proactive agent runs**: a new Render web service `ship-agent` alongside Ship's existing `ship-api-76ez`. Same Render account, same deploy pipeline, same Neon DB (different schema).

**How it's kept alive**: Render's web-service runtime model. A `setInterval` in the service process drives the proactive poller; Render auto-restarts on process crashes. Free tier has a spin-down-on-idle behavior that would break polling, so the agent runs on Render's Starter ($7/month) plan for always-on. Alternative: Render's native cron-job service (separate from web service) — chosen if the in-process scheduler proves fragile.

**How it authenticates with Ship without a user session**: a new service-account user in `users` (new `is_service_account` boolean column, migration-applied), assigned admin role in all workspaces. The agent service holds a long-lived API key in its env vars; Ship's auth middleware recognizes service-account keys via a separate code path that doesn't enforce session timeout. Service-account actions are tagged in audit logs as `acting_on_behalf_of_agent=true`.

### 9. Performance

**Achieving the 5-min detection latency**:

- Poll cadence 4 min (= worst-case time-to-detect-trigger) + graph run time ~3s = worst-case 4:03 surfaced. 57s margin.
- If the graph itself slows beyond 60s, fall back to a cached/simplified detection (skip the reasoner step, emit deterministic-only findings).

**Token budget per invocation** (working numbers):

| Step | Model | Input | Output | Cost |
|---|---|---|---|---|
| `intent_classifier` | Haiku 4.5 | ~200 | ~80 | $0.0003 |
| `reasoner` | Sonnet 4.6 | ~2,000 | ~400 | $0.012 |
| **Total** | | | | **~$0.013** |

Bounded by:
- Conversation history capped at 10 turns
- `fetch_assocs` capped at 50 edges/hop
- `expand_doc` tool capped at 3 invocations per reasoner call

**Cost cliffs**:

1. **Reasoner** is 92% of per-run cost. Mitigation: aggressive dedup of identical findings.
2. **Unbounded `fetch_assocs`** — a document with hundreds of edges would balloon context. Hard caps in place.
3. **Long chat sessions** — sliding-window summarization caps prompt size.
4. **Polling × N sprints** linear. At ~200 sprints (1k users) we'd want to switch to webhook delivery.

---

## How this PRESEARCH maps to FLEETGRAPH.md

| PRESEARCH section | FLEETGRAPH.md home |
|---|---|
| 1. Responsibility scoping | § Agent Responsibility |
| 2. Use case discovery | § Use Cases |
| 3. Trigger model decision | § Trigger Model |
| 4. Node design | § Graph Diagram |
| 5. State management | § Graph Diagram → State shape + § Architecture Decisions |
| 6. HITL design | § Agent Responsibility + § Graph Diagram (human_gate node) |
| 7. Error handling | § Architecture Decisions (filled at Early Submission) |
| 8. Deployment | § Architecture Decisions |
| 9. Performance | § Trigger Model + § Cost Analysis |
