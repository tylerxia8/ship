# FleetGraph Final Submission Demo Script

Target length: 6 minutes. If the video limit is shorter, use the 3-minute version at the bottom.

## Websites To Open

Open these before recording, in this order:

1. GitHub `FLEETGRAPH.md`
   - https://github.com/tylerxia8/ship/blob/fleetgraph/main/FLEETGRAPH.md
2. Production Ship, Week 17 sprint
   - https://ship-henna.vercel.app/documents/9fd08ede-475e-488d-8909-ffdef4340ddf
3. Read-only representative LangSmith trace
   - https://smith.langchain.com/public/aed63ea9-170a-4042-820c-c4e811800ebc/r
4. Human-gated representative LangSmith trace
   - https://smith.langchain.com/public/cac0e57f-7436-4dd3-b360-3f0f2119fb93/r
5. Unique production load-query trace
   - https://smith.langchain.com/public/b89b4bed-1e49-45be-b39c-d83630be8a15/r
6. Unique timed proactive-scan trace
   - https://smith.langchain.com/public/f422a7cc-9340-436f-a072-f3c45d7b9dff/r
7. Optional health checks
   - https://ship-agent.onrender.com/health
   - https://ship-api-76ez.onrender.com/api/fleetgraph/health

Recording setup:

- Browser zoom: 90-100%.
- Hide bookmarks, notifications, and unrelated tabs.
- Keep GitHub first so the grader sees the deliverable file immediately.
- If Ship is logged out or slow, do not spend the video debugging login. Switch to `FLEETGRAPH.md` evidence and LangSmith traces.

## What The Video Must Prove

- FleetGraph is a graph agent, not a standalone chatbot.
- Proactive and on-demand modes use the same graph architecture.
- The assistant is embedded in Ship and scoped to the current document.
- Human-in-the-loop is implemented for actions that mutate Ship or notify others.
- The app runs against real Ship data and is deployed publicly.
- The final critique is addressed: test cases now have unique LangSmith trace links.
- Final cost analysis is complete and defensible.

## 0:00-0:30 - Opening

Show `FLEETGRAPH.md` in GitHub.

Say:

> This is the final FleetGraph submission. FleetGraph is a project intelligence agent for Ship. Ship already shows project state, but FleetGraph watches the document graph, reasons over issues, sprints, projects, people, and associations, and then either answers in context or surfaces something proactively.

Point to:

- `Agent Responsibility`
- `Use Cases`
- `Graph Diagram`

## 0:30-1:15 - Agent Responsibility And Scope

Scroll to `Agent Responsibility`.

Say:

> The agent is responsible for graph-traversal reasoning. It is intentionally not for single-document facts the UI already shows. It monitors blocker chains, capacity overruns, slip risk, stale assignments, orphaned ownership, and retro gaps. For actions, it can answer, surface findings, and persist proactive cards autonomously, but it must ask a human before changing Ship data or notifying another person.

Point to:

- What it monitors proactively
- What it can do autonomously
- What it must always ask a human about

## 1:15-2:00 - Same Graph, Two Modes

Scroll to `Graph Diagram`.

Say:

> Both modes enter the same LangGraph. The difference is the trigger. On-demand starts from the Ship page the user is viewing. Proactive starts from the scheduler or manual scan. After that, both go through context resolution, intent classification, scoped fetches, reasoning, action decision, and either final output or the human gate.

Point to:

- `context_resolver`
- `intent_classifier`
- `fetch_load`, `fetch_activity`, `fetch_history`
- `action_decision`
- `human_gate`

## 2:00-3:00 - Live UI: Embedded Context-Aware Assistant

Switch to production Ship Week 17:

`https://ship-henna.vercel.app/documents/9fd08ede-475e-488d-8909-ffdef4340ddf`

Click **Project Assistant**.

Say:

> This is the on-demand mode. It is embedded in Ship, not a separate chatbot page. Because I opened it from a sprint document, the assistant receives this sprint as scope and uses that as the starting point for the graph.

Ask:

```text
Who's overloaded this week?
```

While it runs, say:

> This should classify as a load check, fetch the sprint and related people and work, and gate any reassignment-style action before anything changes.

If an approval card appears:

> This is the human-in-the-loop gate. The agent can recommend action, but it cannot mutate Ship or notify someone else without approval.

If it returns read-only output:

> This live data state returned a read-only answer, but the human-gated path is captured in the LangSmith trace I will show next.

## 3:00-3:35 - Live UI: Proactive Scan

In the same assistant panel, click **Check page**.

Say:

> This manually exercises the proactive path for the demo. In production, the agent polls active sprints on a four-minute cadence, leaving one minute of buffer under the five-minute detection requirement. When it finds something worth surfacing, it persists a scoped finding and dedupes repeated detections.

Expected:

- A proactive assistant response appears, or
- Existing "Things to review" cards appear or refresh.

## 3:35-4:40 - LangSmith Proof

Show the read-only representative trace:

`https://smith.langchain.com/public/aed63ea9-170a-4042-820c-c4e811800ebc/r`

Say:

> This trace shows the read-only route. It reaches `action_decision` and finalizes without entering `human_gate`.

Show the human-gated representative trace:

`https://smith.langchain.com/public/cac0e57f-7436-4dd3-b360-3f0f2119fb93/r`

Say:

> This is the same compiled graph, but the reasoner proposed actions requiring approval, so `action_decision` routed into `human_gate`. That different traversal is the key evidence that this is a graph, not a fixed pipeline.

Then show `FLEETGRAPH.md` Test Cases.

Say:

> The early feedback noted that reused traces were not enough. I addressed that by adding a unique public LangSmith trace for every test case row. The two traces I just showed are representative shape proof; the table has distinct trace links for the individual tests.

## 4:40-5:20 - Trigger Model, Deployment, And Performance

Scroll to `Trigger Model`, `Performance requirements`, and `Deployment / Public Access`.

Say:

> The trigger model is polling every four minutes per active sprint. Webhooks would be faster, but Ship does not yet have an event bus, so polling is the defensible MVP choice. The worst-case detection budget is about four minutes plus graph runtime, which stays under the five-minute requirement. The frontend, Ship API proxy, and FleetGraph agent are all publicly deployed.

Optional: briefly show health checks.

## 5:20-6:00 - Cost Analysis And Close

Scroll to `Cost Analysis`.

Say:

> For final submission, I added actual development and testing spend from the Anthropic token export, plus production cost projections for 100, 1,000, and 10,000 users. The main cost driver is the Sonnet reasoner, so the documented tradeoff is clear: proactive scan frequency gives faster detection, but increases linear cost.

End with:

> FleetGraph makes Ship more useful because it does not wait for someone to stare at a dashboard. It watches real project state, reasons over relationships, surfaces problems proactively, and knows when to stop for human judgment.

## Backup Lines

If Ship is slow:

> The deployed app is slow right now, so I am switching to the documented production evidence in `FLEETGRAPH.md`. The Week 17 scan and on-demand runs are recorded in the Test Cases table with thread IDs and unique public traces.

If LangSmith is slow:

> LangSmith is slow to load in the browser, but each public trace URL is linked directly in the Test Cases table. I verified the public links return successfully.

If the live answer differs:

> This is running against live Ship data, so the exact text can change. The evidence that matters is the scoped request, graph route, trace, and human gate behavior when actions are proposed.

If the assistant times out:

> The timeout message is expected hardening. The Ship API proxy returns a clear timeout instead of leaving the UI hanging.

## 3-Minute Version

Use this if time is tight:

> FleetGraph is a project intelligence agent embedded in Ship. It has two modes: proactive scans and on-demand context-aware chat. Both use the same LangGraph; only the trigger changes. The current Ship page provides scope, so a chat opened on a sprint starts from that sprint instead of acting like a generic chatbot. The graph resolves context, classifies intent, fetches only the needed Ship data, reasons over it, and either returns an answer, persists a proactive finding, or pauses at `human_gate` for approval. The LangSmith traces prove different graph paths: a read-only path that finalizes immediately and a gated path that routes through `human_gate`. The final submission also fixes the early feedback: each test case row now has its own unique public LangSmith trace. The trigger model, deployment evidence, performance target, and cost analysis are all documented in `FLEETGRAPH.md`.
