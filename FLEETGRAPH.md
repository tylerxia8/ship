# FleetGraph

A project intelligence agent for Ship. Reads the document graph, reasons about it, and either answers questions scoped to what a user is looking at (on-demand) or surfaces conditions worth acting on without being asked (proactive). Same graph, two triggers.

**Author:** Tyler Xia
**Sprint:** 2026-05-25 → 2026-05-31
**Status:** MVP, early-submission, and final cost sections complete.

---

## Agent Responsibility

FleetGraph is responsible for **graph-traversal reasoning over Ship's unified document model** — answering questions and surfacing conditions that require visiting 2 or more documents and the associations between them. Single-document questions ("what's this issue's state?") are explicitly out of scope; the Ship UI already shows that. The agent's value is in the joins, the deltas, and the implicit "should I be doing something about this?" questions a project lead would ask if they had infinite attention.

### What it monitors proactively

For each `documents WHERE document_type='sprint' AND status='active'` (computed status, not stored), once every 4 minutes:

- **Blocker chains** — issues in `state='blocked'` whose `document_associations` lead to other blocked or stale issues, forming a graph with no in-progress nodes
- **Capacity overruns** — sum of `properties.estimate_hours` on issues assigned this week exceeds a person's `properties.capacity_hours` by ≥20%
- **Slip risk** — sprint with `>40%` of issues in `in_progress` at `>60%` of the time window elapsed (heuristic; tunable)
- **Stale assignments** — issue `state='in_progress'` with no `updated_at` change for 72+ hours
- **Orphaned ownership** — sprint `properties.owner_id` references a person document whose linked user has no activity in 7+ days (PTO heuristic)
- **Retro gap** — sprint window closed but no `weekly_retro` child document exists 48 hours later

These are the seed conditions. The agent's reasoner can also surface conditions the engineer didn't pre-code, with lower confidence (logged but not auto-notified).

### What it reasons about on demand

When a user invokes the chat from within Ship's UI, the agent receives the **scope of the current view** as context: which document the user is looking at, which mode (Programs / Weeks / Resource / Docs), and the user's question. Reasoning ranges from:

- "Is this issue blocking anything else?" (MVP traverses the scoped document's outgoing associations; deeper traversal is a v2 expansion)
- "What's slipping this week?" (reads sprint's child issues, compares state distribution to time elapsed)
- "Who else is working on auth?" (semantic search across documents + association traversal)
- "Should I take this issue on?" (compares my current load + this issue's complexity + my historical velocity)
- "What changed in this program since last week's retro?" (diffs sprint snapshots)

The on-demand mode does NOT have to be a question. A user invoking with no message gets a **summary**: "here's the most important thing I'd flag about this scope right now," running the same proactive-detection logic but scoped to one document.

### What it can do autonomously

- **Read** any document the requesting user can read (or any document, for proactive runs using the service account's workspace-wide read scope)
- **Respond** to the requesting user with chat answers, citations, and recommended actions
- **Surface a finding** in the scoped FleetGraph panel for the requesting user
- **Log findings** to LangSmith traces + an internal `fleetgraph_findings` table for analytics
- **Persist proactive findings** to Ship via `/api/fleetgraph/findings`, deduped by `(workspace_id, scope_id, finding_hash)`
- **Suppress** repeated findings via the dedup cache (no user-visible side effect)

### What it must always ask a human about

- **Mutating any Ship document** — state changes, assignments, comments, descope, reassignment
- **Notifying users other than the requester** — including the issue's owner, the sprint owner, or anyone in `document_associations`
- **Triggering external side effects** — posting to Slack/email (future), creating calendar events (future)
- **Modifying its own behavior** — e.g., subscribing/unsubscribing from a detection rule on behalf of the user

The gate UI lives inline in the scoped FleetGraph panel: a card showing the agent's reasoning, citations, and the proposed action, with **Approve / Dismiss / Snooze** controls.

### Safety edge cases

Ship documents and user chat messages are treated as project data, not trusted instructions. Before the reasoner sees scoped Ship data, FleetGraph redacts obvious secrets from titles, user questions, load snapshots, and document properties, including keys named like `token`, `secret`, `password`, `cookie`, `authorization`, and common bearer/API-token text patterns. Prompt-bound text and JSON are also capped with an explicit truncation marker so one oversized issue field cannot blow up latency or cost. If a document contains prompt-injection text such as "ignore your rules" or "reveal the API key," the reasoner is instructed to ignore the instruction, explain the project risk in plain language, and recommend human review instead of following it.

### Who it notifies and under what conditions

| Recipient | Conditions | Gate? |
|---|---|---|
| Requester (on-demand) | Always, in response to their question | No |
| Requester (scoped panel) | A proactive finding for the scope the user is viewing | No |
| Issue/sprint owner (other than requester) | Proactive finding the agent's reasoner judges relevant to the owner | Yes |
| Workspace admins | Compliance-class findings — orphaned-ownership, retro-gap, persistent slip across 2+ sprints | Yes, batched daily |

### How it knows who is on a project, and what their role is

Ship's separation between **authorization** (`workspace_memberships`) and **content** (`documents WHERE document_type='person'`) — documented in [docs/unified-document-model.md](docs/unified-document-model.md#authorization-vs-content-separation) — is the right read here.

- **Membership** comes from `workspace_memberships` (who's in the workspace + role: admin/member). This is the auth check the agent uses when proxying access.
- **Project assignment** comes from `document_associations` — issues' `parent` and `project` associations, person documents' `properties.user_id` linking to `users.id`.
- **Sprint accountability** comes from `properties.owner_id` on the sprint document.

The agent uses the service-account read scope to enumerate all relevant relationships in a single fetch step; no user-permission proxying for proactive runs (it has read-everything). For on-demand runs, the user's session is enforced — the agent can only respond about documents the user could otherwise see.

### How on-demand mode uses context from the current view

The Ship frontend, when the chat panel is opened, sends `{ scopeType, scopeId, workspaceId, viewMode }` to the agent service alongside any user message. The `context_resolver` node uses this to:

1. Bound the initial fetch — `fetch_doc` reads exactly `scopeId`, not the whole workspace
2. Bias the intent classifier — "what's slipping" on a sprint scope is interpreted differently than the same question on an issue scope
3. Constrain the citations — answers cite documents in or adjacent to the current scope, not random workspace documents

If the user navigates away mid-conversation, the conversation thread retains the **original** scope it was opened in; switching scopes opens a new chat thread. This prevents the "I keep talking about issue X but the user is now looking at sprint Y" failure mode.

---

## Graph Diagram

Both proactive and on-demand modes traverse the same graph. Only the entry node and initial state differ.

```mermaid
flowchart TD
    proactive([proactive trigger<br/>poll every 4 min<br/>per active sprint]) --> resolver
    ondemand([on-demand trigger<br/>chat from Ship UI]) --> resolver

    resolver[context_resolver<br/>~50ms · no LLM]
    resolver --> classifier

    classifier[intent_classifier<br/>Haiku 4.5 · ~500ms]

    classifier --> fetchdoc[fetch_doc<br/>always runs]

    fetchdoc --> fetchassocs[fetch_assocs<br/>no-op unless requested]
    fetchassocs --> fetchload[fetch_load<br/>no-op unless requested]
    fetchload --> fetchactivity[fetch_activity<br/>no-op unless requested]
    fetchactivity --> fetchhistory[fetch_history<br/>no-op unless requested]
    fetchhistory --> reasoner

    reasoner[reasoner<br/>Sonnet 4.6 · tool: expand_doc · ~1–3s]
    reasoner --> decision

    decision{action_decision<br/>needs human approval?}
    decision -->|read-only OR proactive finding| output
    decision -->|on-demand mutation OR notify-other| gate

    gate[human_gate<br/>INTERRUPT — MemorySaver checkpoint<br/>resume on user click]
    gate -->|approve / dismiss / snooze| output

    output([output<br/>chat response OR notification<br/>LangSmith trace finalized])
```

**Node responsibilities at a glance:**

| Node | Purpose | Model | Latency | Notes |
|---|---|---|---|---|
| `context_resolver` | Normalize trigger + scope into state object | — | ~50ms | Deterministic |
| `intent_classifier` | Map question/state to one of 6 intents + required fetches | Haiku 4.5 | ~500ms | First conditional edge fans out from here |
| `fetch_doc` | Load primary doc(s) for scope | — | ~100ms | Ship API or direct pg |
| `fetch_assocs` | Load outgoing `document_associations` for the current scope | — | ~150ms | Capped at 50 edges; reverse sprint associations are used by `fetch_load` |
| `fetch_load` | For person/sprint scopes — assigned issues + capacity | — | ~150ms | Aggregates `estimate_hours` via existing Ship APIs |
| `fetch_activity` | Recent change signal | — | ~100ms | Derived from `updated_at` for scope + sprint issues |
| `fetch_history` | Lightweight historical context for diff queries | — | ~100ms | Reads existing property history arrays; full snapshots are v2 |
| `reasoner` | Synthesize fetched data into structured finding | Sonnet 4.6 | ~1–3s | Structured output only in MVP; follow-up traversal tool is v2 |
| `action_decision` | Classify reasoning output as read-only or mutating; conditional edge | — | ~10ms | Deterministic; second conditional edge |
| `human_gate` | INTERRUPT — pause graph and wait for approve/dismiss/snooze | — | indefinite | Resumes to output in MVP; mutation executor is v2 |
| `output` | Format chat response or notification; persist proactive finding; finalize trace | — | ~50ms | Terminal node |

**Fetch strategy:** the MVP graph uses a deterministic fetch chain rather than LangGraph parallel fan-out. Each optional fetch node checks `intent.requiredFetches` and returns immediately when it is not needed. This produces stable traces while still making intent-specific runs materially different: `load_check` includes `fetch_load`, `slip_check` includes `fetch_activity`, `diff_query` includes `fetch_history`, and read-only blocker checks stay small.

**Proactive action handling:** proactive runs always continue to `output` so medium/high-confidence findings are persisted. Suggested mutating actions are stored on the finding as recommendations only. On-demand runs that propose mutations or notifying another user still pause at `human_gate`.

**State persistence:** MVP uses LangGraph `MemorySaver` checkpoints indexed by `thread_id` so HITL interrupts can resume within the same running agent process. `PostgresSaver` is the planned hardening path for cross-restart persistence, dedup tables, and long-lived snoozes.

---

## Use Cases

Six concrete use cases. The MVP graph supports all six through scoped fetches plus the reasoner's structured output; deterministic hard-coded detectors are strongest for blocker, load, activity/staleness, and lightweight history signals. Fuller snapshot diffing and durable suppression are v2 hardening items.

| # | Role | Trigger | Agent detects / produces | Human decides |
|---|---|---|---|---|
| 1 | Engineer | On-demand: opens chat on an issue, asks "is this blocking anything?" | Traverses outgoing `document_associations` for the scoped issue, filters to unfinished related docs, and returns a cited blocker summary. Deeper multi-hop traversal is the next hardening step once reverse/typed associations are normalized across all document kinds. | Whether to escalate, unblock, or de-scope. Agent will draft an escalation comment on request — gated. |
| 2 | PM | On-demand: opens chat on a sprint, asks "what's slipping?" | Reads sprint's child issues, computes (in_progress count) vs. (days remaining × team velocity), flags issues with no `updated_at` in 48h+, surfaces tail risk: "5 issues remain in_progress with 2 days left at current pace; PAY-12 and PAY-19 haven't changed state since Monday." | Which slips to triage, which to accept, which to escalate to the program owner. |
| 3 | Director | On-demand: in Resource mode, asks "who's overloaded this week?" | Pulls all `person` documents in workspace, joins to their assigned issues this week via `document_associations`, sums `properties.estimate_hours`, compares to each person's `properties.capacity_hours`. Returns ranked list: "Shawn at 132% (52h assigned vs 40h capacity), Maria at 118%, Jordan at 95%." | Whether to rebalance, hire, de-scope, or accept. Agent will propose specific reassignment moves — gated. |
| 4 | PM | **Proactive**: every 4 min per active sprint | Detects **blocker chain** — issue A `state=blocked` linked to B `state=blocked` linked to C, all with `updated_at` older than 48h. Posts a notification card to the sprint owner proposing escalation to the program owner. | Approve (agent drafts and posts escalation comment), Dismiss (silences for exponential backoff), Snooze. |
| 5 | Engineer | On-demand: on a program/page asks "what changed since last week's retro?" | MVP reads lightweight history already present on the scoped document and recent activity for adjacent docs. Full current-vs-previous sprint snapshot diffing is documented as the v2 path. | Whether to update the retro doc with the diff. Agent will draft the diff — gated before any write. |
| 6 | PM | **Proactive**: triggered on sprint creation event (detected by next poll cycle) | Reads new sprint's planned issues, sums `estimate_hours` vs. team capacity for that week. If sum >80% of capacity, identifies the lowest-priority issues that fit the overage and proposes de-scope: "AUTH-101 (low priority, 8h) and AUTH-105 (low, 6h) would bring the sprint to 78% capacity." | Whether to actually de-scope. Agent makes the moves on approval — gated. |

**Pattern across all six:** every use case requires reasoning over 2+ document types AND 2+ associations. Single-document UI views can't produce these answers without manual clicking. That's the agent's value moat.

**On the open-ended reasoner:** in addition to these six pre-coded detectors, the reasoner has freedom to surface novel conditions during `proactive_scan`. These are logged at `confidence='low'` and only surfaced to users who opt into "experimental detections" — they're not blocked from happening, just gated behind explicit opt-in to avoid noise.

---

## Trigger Model

**Decision: hybrid — poll for proactive, in-band synchronous for on-demand. Webhooks deferred to v2.**

### Poll cadence and rationale

- **Per active sprint, every 4 minutes.** A `setInterval(60_000)` in the agent service queries `documents WHERE document_type='sprint'` filtered to active sprints (computed from `properties.sprint_number` + workspace start date, per Ship's week model). For each, checks `last_run_at` in the `fleetgraph_runs` table; runs again if ≥4 min elapsed.
- **4 min, not 5**, to give 1 minute of margin against the 5-min SLA in the PRD. Graph run time itself is ~2–5s, so total worst-case event-to-surface is ~4:05.
- **Per active sprint, not per workspace**, because Ship's data model groups work by sprint and most detections are sprint-scoped. Running once per workspace would force the graph to enumerate sprints itself; lifting that to the trigger layer keeps graph runs focused and traces clean.

### Why poll, not webhook (yet)

| Factor | Poll (chosen) | Webhook (deferred) |
|---|---|---|
| Ship support | Already works — Ship exposes the documents API the poller reads | Doesn't exist — Ship would need an event-bus subsystem, retry semantics, signature verification, dead-letter queue, delivery guarantees |
| Cost predictability | Linear and known: N sprints × 360 polls/day | Variable based on event volume; bursty during sprint-end pushes |
| Detection latency floor | 4 min (poll cadence) | Sub-second possible |
| Detection latency ceiling | 4 min + graph time (~4:05) | Depends on delivery + retry semantics |
| Implementation cost | Hours | Days (Ship-side changes) |
| Failure mode | Misses if poll fails — re-tried next cycle, max 8-min gap | Misses if webhook delivery fails — needs dead-letter + retry |

The 5-min PRD SLA is achievable with polling, so webhooks are an optimization, not a requirement.

### Webhook migration path (documented for completeness)

When event volume justifies the move:

1. Add `documents` table triggers in Postgres emitting to a `fleetgraph_events` outbox table
2. Add an outbox-poller in the agent service that drains `fleetgraph_events` every 5s and fires per-event graph runs
3. Same graph; just a faster trigger
4. Polling stays on as a fallback to catch missed events (defense in depth)

### On-demand: in-band synchronous

User chat in the Ship UI → Ship API forwards to agent service `POST /agent/chat` → graph runs synchronously and returns a JSON response. A manual proactive scan is also exposed as `POST /api/fleetgraph/scan` from the scoped chat panel, which forwards to `POST /agent/scan` and runs the same proactive graph once for the current document so reviewers can exercise the proactive path without waiting for the scheduler.

### Cost projection at scale (preview — full breakdown in Cost Analysis section)

| Scale | Active sprints | Proactive runs/day | On-demand runs/day | Combined model $/month |
|---|---|---|---|---|
| 100 users (~20 sprints) | 20 | 7,200 | 100 | ~$2,630/mo |
| 1,000 users (~200 sprints) | 200 | 72,000 | 1,000 | ~$26,300/mo |
| 10,000 users (~2,000 sprints) | 2,000 | 720,000 | 10,000 | ~$263,000/mo |

Linear scaling; reasoner is the dominant cost (~$0.012/run). Cost cliffs documented in the Cost Analysis section at final submission.

### Performance requirements

| Metric | Goal | FleetGraph result |
|---|---|---|
| Problem detection latency | <5 min from Ship event to surfaced finding | Poller wakes every 60s and runs each active sprint at most every 4 min. Measured graph runs are 7.64s and 19.23s in the public traces, so the documented worst-case budget is ~4:20. |
| Cost per graph run | Documented and defended | Proactive: ~$0.012/run; on-demand: ~$0.0126/run. Both are dominated by the Sonnet reasoner. Actual development/test spend from Anthropic token export: ~$0.34 total. |
| Estimated runs per day | Documented and defended | At 100 users: ~7,300/day (7,200 proactive + 100 on-demand). Scale table above documents 100 / 1,000 / 10,000-user projections. |

### Detection-latency verification plan

Per PRD: "latency will be verified with a timed test run. An event will be introduced into Ship and the clock starts."

Test protocol:
1. Pre-create an active sprint with a healthy state (no blockers)
2. Start a stopwatch
3. Insert a `state='blocked'` issue linked to another `state='blocked'` issue, both with `updated_at` 49 hours ago (fabricated)
4. Wait for the agent to surface the blocker-chain finding via notification
5. Stop stopwatch
6. Expected: under 5 minutes; budgeted: under 4:05.

Trace evidence captured in the Test Cases section.

---

## Test Cases

Each use case has an explicit Ship state, expected agent behavior, and a unique trace/evidence pointer below. Early feedback noted that the two representative public traces should not be reused across use cases, so final trace capture uses one distinct LangSmith run per documented test case. The two public traces at the bottom of this section remain as the graph-shape comparison only; they are not a substitute for unique per-test evidence.

| Use Case | Ship State That Triggers It | Agent Should Detect / Produce | Trace / Evidence |
|---|---|---|---|
| UC1 - Issue blocker traversal | Issue `fc466b06...` ("Create mobile app") opened in Ship; state=`backlog`, priority=`low`, estimate=`40h`, user asks "is this blocking anything?" | Fetch scoped issue + associations, classify `blocker_check`, return cited blocker summary without human gate. | Unique run: test case 1 below. |
| UC2 - Sprint slip / planning risk | Sprint `09e44014...` ("Week 16") opened in Ship; `confidence_score=42.4%`, missing goals/criteria, user asks what is slipping. | Fetch sprint + adjacent work, produce risk finding, propose notify/comment actions, route through `human_gate`. | Unique run: test case 2 below. |
| UC3 - Overloaded people | Resource/person-oriented query against seeded workspace containing 11 people and 104 issues with estimate/capacity properties. | Activate `load_check`, fetch people/issues/sprint associations, rank people by assigned estimate vs capacity, gate any reassignment proposal. | Unique run: test case 8 below (`load_check`). |
| UC4 - Proactive blocker/stale chain | Active sprint scanned with no user message; sprint has stale or low-confidence issue/project signals worth surfacing. | Fast-path `proactive_scan`, decide whether the finding is worth surfacing, persist a scoped finding/notification card. | Unique run: test cases 3, 7, and 10 below. |
| UC5 - Change since retro | Program/sprint/page query with history-like properties and recent adjacent document activity. | Activate `diff_query`, run `fetch_history` + `fetch_activity`, summarize meaningful changes, gate any retro update. | Unique run: test case 9 below (`diff_query`). |
| UC6 - Sprint overcommit warning | Newly planned/active sprint scanned on next poll/manual scan; planned issue estimate total is compared to team capacity. | Activate proactive reasoning over sprint load, surface capacity/overcommit finding, propose de-scope/rebalance as gated action. | Unique run: test case 7 or 10 below, depending on final overcommit seed state. |

Real-data evidence captured against the local Ship instance seeded with 257 documents (104 issues, 35 sprints, 15 projects, 5 programs, 11 people).

Final trace hygiene: each row below has its own public LangSmith URL. The helper command `pnpm --filter @ship/agent trace-matrix` was used to find distinct run IDs before sharing each run from LangSmith. None of the per-test rows borrow the representative graph-shape links.

| # | Ship State | Expected Output | Observed | Trace Link |
|---|---|---|---|---|
| 1 | On-demand chat from an issue (`fc466b06...` — "Create mobile app", state=backlog, priority=low, 40h estimate) | Agent reads doc + associations, returns blocker status with citation | ✅ Agent identified backlog/low/40h, "no blocker relationships detected," cited the issue ID. Path: `context_resolver → intent_classifier (blocker_check, high) → fetch_doc → fetch_assocs → reasoner → action_decision (no actions) → finalize` | [unique trace](https://smith.langchain.com/public/af6640b4-9702-4078-9cf2-763e1e2e71bd/r) |
| 2 | On-demand chat from a sprint (`09e44014...` — "Week 16", confidence_score=42.4%, no goals/criteria set) | Agent identifies low-confidence signal, proposes notify_user + comment actions, HITL gate engages | ✅ Surfaced "very low confidence score 42.4%," "no plan/goals/vision," proposed 4 actions (notify sprint owner, comment, notify 2 assignees). Path: `... → reasoner → action_decision (mutations) → human_gate INTERRUPT` | [unique trace](https://smith.langchain.com/public/92486dba-22c2-4ed7-a619-b6f0c0c7156f/r) |
| 3 | Proactive scan on a sprint (no user message; agent decides what is worth surfacing) | Agent identifies signal-worthy state without prompting | Same Week 16 sprint: proactive_scan intent (fast-path, no LLM call for intent), reasoner-medium-confidence finding generated, 2 actions proposed. Path: distinct from on-demand because `intent_classifier` skips the LLM. | [unique trace](https://smith.langchain.com/public/58bde4c6-d557-4c52-9f7c-a1024a97534c/r) |
| 4 | HITL Approve flow (continuation of test 2) | Graph resumes from `human_gate`, records the human decision, and finalize returns approved output | POST `/api/fleetgraph/resume` with `{threadId, decision: "approved"}` -> graph resumed -> finalize formatted message with approved prefix. DOM verified via Playwright. Screenshot: [fleetgraph-chat-approved.png](shipshape/fleetgraph-evidence/fleetgraph-chat-approved.png) | [unique trace](https://smith.langchain.com/public/412b832d-5bfe-4669-ac82-a92d73791e64/r) |
| 5 | Browser end-to-end (logged in as `dev@ship.local`, navigated to `/documents/{issue-id}`, opened chat panel, submitted question) | Full UI roundtrip: chat panel renders, scope auto-detected from URL, message dispatched, response rendered with citations | Verified via Playwright. Screenshots: [working](shipshape/fleetgraph-evidence/fleetgraph-chat-working.png), [HITL](shipshape/fleetgraph-evidence/fleetgraph-chat-hitl-approval.png), [approved](shipshape/fleetgraph-evidence/fleetgraph-chat-approved.png) | [unique trace](https://smith.langchain.com/public/5c0757ee-d5f1-437e-8f24-0ca301d8a941/r) |
| 6 | Latency check - graph end-to-end against real Ship + Anthropic | Total <= 5 min including poll + graph | Graph run time was 7.64s for the read-only path and 19.23s for the HITL path. With the 4-min per-scope poll cadence, the documented worst-case event-to-surface budget is ~4:20, under the 5-min SLA. | [unique trace](https://smith.langchain.com/public/450b59af-de4d-40b4-93af-88f42b0e6315/r) |
| 7 | Production manual scan on Week 17 (`9fd08ede...`) from `ship-henna.vercel.app` | Same proactive graph runs on demand, persists a durable finding, and the scoped panel displays it | `POST /api/fleetgraph/scan` returned output and persisted finding `e722608b-10ff-4198-9156-44ac239fbe27`; Playwright verified the FleetGraph button renders on the Week 17 document, opens with `sprint: 9fd08ede...`, and shows the proactive finding with Resolve/Dismiss controls. Screenshot: [fleetgraph-production-week17.png](shipshape/fleetgraph-evidence/fleetgraph-production-week17.png) | [unique trace](https://smith.langchain.com/public/d3a6be81-2bd0-4f38-9a3e-4c0e7980cd4d/r) |
| 8 | Production on-demand load query on Week 17 (`9fd08ede...`): "Who's overloaded this week?" | Classify as `load_check`, activate load fetch path, and gate reassignment-style actions | Production API returned `intent.kind=load_check`, `confidence=high`, `pendingInterrupt=true` in 9.44s (`threadId=chat-1779824300747-raspkji9`). | [unique trace](https://smith.langchain.com/public/b89b4bed-1e49-45be-b39c-d83630be8a15/r) |
| 9 | Production on-demand diff query on Week 17 (`9fd08ede...`): "What changed since last week's retro?" | Classify as `diff_query`, activate history path, and produce read-only answer when available history is insufficient | Production API returned `intent.kind=diff_query`, `confidence=high`, read-only chat output in 10.66s (`threadId=chat-1779824310181-e78tjiaa`). | [unique trace](https://smith.langchain.com/public/fc81205e-67b9-406e-b2c0-956f5183547a/r) |
| 10 | Timed production proactive scan on Week 17 through Ship API | Surface a proactive finding within the 5-min detection window and persist/refresh the scoped card | `POST /api/fleetgraph/scan` returned a notification in 12.78s (`threadId=timed-1779824299857`). `GET /api/fleetgraph/findings?status=open` then showed refreshed finding `883dec33-7919-42f6-9c84-18db84c856ec` with `last_seen_at=2026-05-26T19:38:53.281Z`. | [unique trace](https://smith.langchain.com/public/f422a7cc-9340-436f-a072-f3c45d7b9dff/r) |

**Trace shape demonstrates "graph, not pipeline":**

| Trace | Latency | Spans | Distinguishing node |
|---|---|---|---|
| [trace 1](https://smith.langchain.com/public/aed63ea9-170a-4042-820c-c4e811800ebc/r) (read-only) | 7.64s | 16 | `action_decision → finalize` (no `human_gate` span exists) |
| [trace 2](https://smith.langchain.com/public/cac0e57f-7436-4dd3-b360-3f0f2119fb93/r) (HITL) | 19.23s | 16 | `action_decision → human_gate` (interrupt visible in trace) |

Same compiled graph, two visibly different node traversals based on the reasoner's findings. Opening both URLs side-by-side and comparing the node-tree views satisfies the PRD's *"at least two shared trace links submitted showing different execution paths"* requirement.

---

## Architecture Decisions

### 1. Framework: LangGraph.js in a new `agent/` workspace

**Decision.** Use `@langchain/langgraph` (Node) inside Ship's existing pnpm monorepo at `agent/`, alongside `api/`, `web/`, `shared/`.

**Why not Python LangGraph.** Ship's stack is TypeScript end-to-end. Python would mean a second deploy pipeline, marshaling state across language boundaries, and the team carrying two runtimes.

**Why not manual instrumentation.** PRD allows non-LangGraph but requires manual LangSmith trace emission. LangGraph.js (with `langsmith` npm package auto-detected from env vars) gives us tracing for free.

**Trade-offs accepted.** LangGraph.js is at 1.3.2 with a smaller ecosystem than the Python version. Two specific quirks hit during the build:
- A node cannot share a name with a state channel (renamed `output` node → `finalize`)
- Conditional edges with array returns + destinations maps were finicky; replaced with deterministic chain + each fetch node early-returning when not required. Same logical behavior, simpler graph topology.

### 2. Node design rationale

**Decision.** Eight nodes, one purpose each:

| Node | Purpose | LLM? |
|---|---|---|
| `context_resolver` | Validate + normalize trigger input into `Context` | No |
| `intent_classifier` | Map on-demand message → typed `Intent` (one of 7 kinds); fast-path for proactive | Haiku 4.5, structured output via Zod + `withStructuredOutput()` |
| `fetch_doc` | Load primary document for scope (always runs) | No (Ship API) |
| `fetch_assocs` | Load `document_associations` for the scope (capped 50 edges); early-return if not required | No (Ship API) |
| `fetch_load` | Build person/sprint capacity snapshot from issues, people, and sprint associations | No (Ship API) |
| `fetch_activity` | Build recent activity from `updated_at` on scope and sprint issues | No (Ship API) |
| `fetch_history` | Build lightweight history snapshot from existing document properties | No (Ship API) |
| `reasoner` | Synthesize fetched data into `ReasonerOutput` with citations + suggestedActions | Sonnet 4.6, structured output via Zod |
| `action_decision` | Classify actions: requester-only notify → read-only path; mutations → HITL gate | No |
| `human_gate` | LangGraph `interrupt()` — pauses graph, persists state, resumes via `Command({resume})` | No |
| `finalize` | Format `output` for caller (chat vs notification) | No |

Each node has a single responsibility. Per-stage observability is cheap because every node boundary is a span in LangSmith. The trace shape immediately tells you which intent fired (different fetch substructure) and whether the gate engaged.

### 3. State management

**In-run state.** `Annotation.Root` with typed fields. The `fetchedData` field uses a merge reducer so each fetch node can add its slice of context without clobbering earlier fetches. The `messages` field uses a sliding-window reducer capped at 10 turns to bound context size for follow-up chat.

**Checkpoints.** `MemorySaver` for v1 (in-process; survives across `interrupt()` pauses within the same agent service lifetime). `PostgresSaver` is the planned upgrade for cross-restart persistence; deferred since MVP only needs in-process resume.

**Suppression / dedup.** Proactive runs produce a deterministic `findingHash` from the stable fetched Ship state (scope, intent, documents, associations, load, activity types, and history states) rather than the LLM's exact prose. v1 persists findings with a unique `(workspace_id, scope_id, finding_hash)` constraint, so repeat runs over the same condition refresh `last_seen_at` instead of creating duplicate cards. A separate dismissal/snooze suppression table is a v2 hardening item alongside PostgresSaver.

### 4. Deployment model

**Services.** Two Render web services in the same `tea-d8714gek1jcs739i4u60` account:
- `ship-api-76ez` (existing, Week 4) — Ship's main backend, deploys from `fleetgraph/main` branch as of this sprint
- `ship-agent` (new this week) — FleetGraph agent service, also from `fleetgraph/main`

Both at https://ship-api-76ez.onrender.com and https://ship-agent.onrender.com respectively.

**Auth flow.**
- Browser → Ship API: session cookie (existing flow, untouched)
- Ship API → ship-agent: `X-Agent-Secret` header validated against `AGENT_SHARED_SECRET` env on both sides
- ship-agent → Ship API: Bearer token via `api_tokens` table (the `SHIP_SERVICE_ACCOUNT_KEY`), plus the shared `X-Agent-Secret` header for FleetGraph finding writes

**Proxy reliability.** Ship API bounds calls to the agent with `FLEETGRAPH_AGENT_TIMEOUT_MS` (default 25s; `/health` uses 5s) and returns `504 AGENT_TIMEOUT` instead of leaving the browser waiting indefinitely when the agent service is slow.

Migration 039 (`api/src/db/migrations/039_service_account.sql`) added `users.is_service_account` boolean for future audit-log differentiation. Optional in MVP; the existing api_tokens flow gives us auth without depending on the migration.

**Scheduler.** `setInterval(60_000)` in the agent service process polls active sprints in `FLEETGRAPH_TARGET_WORKSPACE_ID`. Per-scope cooldown of 4 minutes via in-memory `Map<scopeId, lastRunAt>`. Gated by `FLEETGRAPH_POLLER_ENABLED=true`; manual scans through `/api/fleetgraph/scan` use the same proactive graph on demand for demos and verification.

### 5. Observability

**LangSmith integration.** `langsmith` npm package auto-detects `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, `LANGSMITH_TRACING=true`. The `agent/src/config.ts` module also sets the legacy `LANGCHAIN_*` aliases for SDK compatibility.

**Trace tagging.** Each invocation runs under a thread_id (`chat-{ts}-{rand}` for on-demand, `proactive-{scope_id}` for the poller), making it trivial to grep traces for a specific conversation or scope.

**Trace shape distinguishes paths.** Read-only paths produce traces of the form `… → reasoner → action_decision → finalize`. Mutating paths produce `… → reasoner → action_decision → human_gate → finalize`. Intent-specific fetch nodes also show different no-op/active behavior in their spans. The presence/absence of the `human_gate` span is the clearest visible "different execution paths" signal for the PRD's pipeline-test.

### 6. Web UI integration

**Component:** `web/src/components/FleetGraphChat.tsx` — floating action button + modal panel. Embedded in `web/src/pages/App.tsx` after `<Outlet />` so it appears on every authenticated route.

**Scope auto-detection.** `AppLayout` derives the active document id and document type from the unified document context and passes that scope into `FleetGraphChat`; legacy route fallback still reads `useParams<{id?}>()` + `useLocation()`. When the URL matches `/documents/:id`, `/sprints/:id`, `/issues/:id` etc., the chat panel sends that scope with every message. Conversation thread resets when `scope.scopeId` changes (prevents the "I keep answering about issue X but the user is now on sprint Y" footgun).

**HITL UI.** When the agent response contains `pendingInterrupt`, the component renders Approve / Dismiss / Snooze buttons inline with the agent message. Clicking dispatches `POST /api/fleetgraph/resume` with the threadId. The resumed graph's output replaces the proposed-actions block.

**Proactive findings UI.** Medium/high-confidence proactive findings are persisted in `fleetgraph_findings` via `POST /api/fleetgraph/findings`. When the scoped chat panel opens, it calls `GET /api/fleetgraph/findings?status=open` and shows findings for the current document with Resolve/Dismiss controls backed by `PATCH /api/fleetgraph/findings/:id`.

**No standalone chatbot.** Per the PRD's hard constraint — chat is invoked from within scope-bearing routes only. The panel doesn't render outside those (Dashboard, My-Week, etc.).

---

## Cost Analysis

Actuals below are from `claude_api_tokens_2026_05.csv`, filtered to the FleetGraph assignment key (`claude-key`) for 2026-05-25 through 2026-05-26. The Anthropic token export reports daily token totals by model, but not per-request invocation counts.

### Development and Testing Costs

| Item | Amount |
|---|---|
| Claude API — input tokens (cumulative) | 50,296 |
| Claude API — output tokens (cumulative) | 14,886 |
| Graph agent invocations during development/testing | 7 documented evidence runs in the Test Cases table, plus additional production verification scans included in the token totals. Anthropic's token export does not expose exact per-request invocation counts. |
| Total development spend | ~$0.34 (`$0.336628` calculated from token totals) |

Model breakdown:

| Model | Input Tokens | Output Tokens | Calculated Spend |
|---|---:|---:|---:|
| `claude-haiku-4-5-20251001` | 13,950 | 965 | ~$0.0188 |
| `claude-sonnet-4-6` | 36,346 | 13,921 | ~$0.3179 |
| **Total** | **50,296** | **14,886** | **~$0.3366** |

Pricing used: Anthropic API pricing as of 2026-05-26: Haiku 4.5 at $1 / MTok input and $5 / MTok output; Sonnet 4.6 at $3 / MTok input and $15 / MTok output.

Token budget per production graph run:

| Step | Model | Input tokens | Output tokens | $/run |
|---|---|---|---|---|
| `intent_classifier` | claude-haiku-4-5 | ~200 | ~80 | ~$0.0006 |
| `reasoner` | claude-sonnet-4-6 | ~2,000 | ~400 | ~$0.012 |
| **Proactive run** | no classifier fast-path + reasoner | ~2,000 | ~400 | **~$0.0120** |
| **On-demand run** | classifier + reasoner | ~2,200 | ~480 | **~$0.0126** |

### Production Cost Projections

| 100 Users | 1,000 Users | 10,000 Users |
|---|---|---|
| ~$2,630/mo | ~$26,300/mo | ~$263,000/mo |

**Assumptions:**

- **Active sprints per 100 users:** ~20 (5 programs × 4 active sprints, typical Treasury-style PM rhythm)
- **Proactive runs per active sprint per day:** 360 (one every 4 min, 24 h)
- **On-demand invocations per user per day:** ~1 average (heavy users 5+, most users 0–1)
- **Average tokens per invocation:** ~2,600 (intent + reasoner combined)
- **Proactive cost per run:** ~$0.0120 (Sonnet reasoner only; proactive intent is deterministic)
- **On-demand cost per run:** ~$0.0126 (Haiku classifier + Sonnet reasoner)
- **Estimated runs per day at 100 users:** ~7,300 (7,200 proactive + 100 on-demand)
- **Monthly formula at 100 users:** `((7,200 × $0.0120) + (100 × $0.0126)) × 30 = ~$2,630`
- **Inference-only estimate:** excludes Render/Vercel/Neon infrastructure because those are already part of Ship's app hosting; add ~$7/mo for the FleetGraph Render Starter service if counted separately.

**Cost cliffs to be aware of:**

1. **Reasoner is the spend driver** — ~95% of on-demand cost and nearly all proactive cost. Mitigations: deterministic pre-filter before Sonnet, cache fetched data within a graph run, and suppress reasoner calls when the finding hash matches a recent dismissal.
2. **`fetch_assocs` unbounded** — a document with hundreds of associations would balloon context. Hard cap at 50 edges per hop, 100 total per run.
3. **Conversation history growth** — chat threads with 20+ turns blow context. Bounded to 10 turns; older turns summarized into a single system message.
4. **Polling × active sprints** — linear cost growth. At 1,000+ users we'd want to switch to event-driven (webhooks) to avoid paying for polls that find nothing.

The actual development spend is low because the final FleetGraph graph runs are compact: Haiku only classifies on-demand intent, while Sonnet receives bounded fetched Ship state rather than full-document dumps.

---

## Live deployment

| Resource | URL / ID |
|---|---|
| Ship web (frontend) | https://ship-henna.vercel.app |
| Ship API + FleetGraph proxy | https://ship-api-76ez.onrender.com (service `srv-d871iv8jo6nc73977oqg`, branch `fleetgraph/main`) |
| FleetGraph agent | https://ship-agent.onrender.com (service `srv-d8ad0ivavr4c73deci8g`, branch `fleetgraph/main`) |
| LangSmith project (dev runs) | `fleetgraph-dev` at https://smith.langchain.com |
| LangSmith project (prod runs) | `fleetgraph-prod` at https://smith.langchain.com |
| Source code branch | `fleetgraph/main` on `tylerxia8/ship` |
| Deploy guide | [agent/DEPLOY.md](agent/DEPLOY.md) |

### Reviewer walkthrough

1. Open the production Week 17 sprint: https://ship-henna.vercel.app/documents/9fd08ede-475e-488d-8909-ffdef4340ddf
2. Sign in with an authorized Ship account.
3. Click the Project Assistant button in the app chrome.
4. Confirm the panel scope reads `sprint: 9fd08ede-475e-488d-8909-ffdef4340ddf`.
5. Ask: "Who's overloaded this week?" Expected: `load_check` path, with human approval required before any reassignment-style action.
6. Ask: "What changed since last week's retro?" Expected: `diff_query` path, read-only answer when history is insufficient.
7. Click Scan. Expected: proactive scan path returns a notification-style finding and refreshes/persists a scoped finding card.

**Health checks (all live):**
```bash
curl https://ship-agent.onrender.com/health
# { "ok": true, "service": "ship-agent", "langsmith_project": "fleetgraph-prod", "tracing": true, "auth_enforced": true }

curl https://ship-api-76ez.onrender.com/api/fleetgraph/health
# { "proxy_ok": true, "agent": { ... } }
```

---

## Submission tracker

| Section | Due | Status |
|---|---|---|
| Agent Responsibility | MVP (Tue 11:59 PM) | ✅ |
| Graph Diagram | MVP | ✅ |
| Use Cases | MVP | ✅ (6 use cases) |
| Trigger Model | MVP | ✅ |
| Test Cases | Early Submission (Thu 11:59 PM) | Complete: real evidence from 10 test runs + 4 browser/production screenshots; final trace hygiene now requires unique public LangSmith links per test case |
| Architecture Decisions | Early Submission | ✅ All 6 decisions documented with rationale, trade-offs, code-level pointers |
| Cost Analysis | Final Submission (Sun noon) | ✅ Actual Anthropic token totals added from `claude_api_tokens_2026_05.csv` |

## PRD MVP checklist

- [x] Graph running with at least one proactive detection wired end-to-end
- [x] LangSmith tracing enabled (2+ public trace links captured; final capture workflow documents one unique public trace per test case)
- [x] FLEETGRAPH.md submitted with Agent Responsibility + Use Cases (6 defined)
- [x] Graph outline (node types, edges, conditional branches) documented
- [x] At least one human-in-the-loop gate implemented (verified end-to-end in browser)
- [x] Running against real Ship data — no mocks (257 docs read in seeded local; prod uses live Neon)
- [x] Agent chat + notifications accessible in UI (`web/src/components/FleetGraphChat.tsx`)
- [x] Deployed and publicly accessible (ship-agent.onrender.com + ship-api-76ez.onrender.com)
- [x] Trigger model documented + defended
- [x] <5 min detection latency (public traces show graph runs under 20s; with 4-min poll cadence = ~4:20 worst case)
