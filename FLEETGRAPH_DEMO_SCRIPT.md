# FleetGraph Early Submission Demo Script

Target length: 5 minutes.

## Pre-Recording Checklist

- Open `FLEETGRAPH.md`.
- Open production Ship:
  `https://ship-henna.vercel.app/documents/9fd08ede-475e-488d-8909-ffdef4340ddf`
- Open these LangSmith traces:
  - Read-only path: `https://smith.langchain.com/public/aed63ea9-170a-4042-820c-c4e811800ebc/r`
  - Human-gated path: `https://smith.langchain.com/public/cac0e57f-7436-4dd3-b360-3f0f2119fb93/r`
- Optional health-check tabs:
  - `https://ship-agent.onrender.com/health`
  - `https://ship-api-76ez.onrender.com/api/fleetgraph/health`
- Zoom browser to 90-100%.
- Hide bookmarks, notifications, and unrelated tabs.

## What The Video Must Prove

- Same LangGraph powers proactive and on-demand modes.
- Chat is embedded in Ship and scoped to the current document.
- Proactive detection is wired end to end against real Ship data.
- Human-in-the-loop gate exists for mutating/notification actions.
- LangSmith traces show different graph paths.
- `FLEETGRAPH.md` contains agent responsibility, use cases, graph outline, trigger model, test cases, and deployment evidence.

## 0:00-0:30 - Opening

Show `FLEETGRAPH.md` title and Agent Responsibility.

Say:

> This is FleetGraph, a project intelligence agent for Ship. The core idea is that Ship already shows project state, but FleetGraph watches and reasons over the graph of issues, sprints, projects, people, and associations. It has two modes: proactive, where it surfaces risks without being asked, and on-demand, where a user asks from inside the Ship interface. Both modes use the same graph; the trigger is what changes.

Point to:

- Agent Responsibility
- What it monitors proactively
- What it must ask a human about

## 0:30-1:15 - Graph Architecture

Scroll to Graph Diagram.

Say:

> The graph starts by resolving the current Ship context, classifies the user's intent, then activates the fetch nodes needed for that intent. It always reasons over real Ship data, then `action_decision` decides whether the answer can be returned immediately or has to pause at `human_gate`. That branching is important because the assignment asks for a graph, not a fixed pipeline.

Point to:

- `context_resolver`
- `intent_classifier`
- `fetch_doc`, `fetch_assocs`, `fetch_load`, `fetch_activity`, `fetch_history`
- `reasoner`
- `action_decision`
- `human_gate`
- `output`

## 1:15-2:20 - On-Demand Context-Aware Chat

Switch to Ship production Week 17 page.

Click the **Project Assistant** button.

Say:

> This is the on-demand mode. It is not a standalone chatbot page. The assistant is embedded in Ship, and this panel starts from the document I am looking at. Here the scope is this sprint.

Ask:

```text
Who's overloaded this week?
```

While it runs, say:

> This should classify as a load check, fetch the sprint and related people/work, and any reassignment-style action should require human approval before anything changes.

If approval buttons appear, say:

> This is the human-in-the-loop gate. The agent can recommend an action, but it cannot mutate Ship or notify another person without an explicit human decision.

If it returns read-only output instead, say:

> In this current data state the answer came back read-only, but the human-gated path is documented in the trace I will show next.

## 2:20-3:00 - Proactive Scan In The UI

Click **Check page**.

Say:

> This manually triggers the proactive path for the demo. The deployed poller uses the same graph on a four-minute cadence per active sprint, but the button lets a reviewer exercise the proactive detection immediately. If a finding is worth surfacing, it is persisted as a scoped finding and deduped so repeated scans refresh the same condition instead of spamming the user.

Expected:

- A notification-style assistant response appears.
- Existing "Things to review" finding cards may appear or refresh.

## 3:00-4:00 - LangSmith Trace Proof

Show read-only trace.

Say:

> This first public trace is the read-only path. It goes through context resolution, intent classification, fetches, reasoner, action decision, and finalizes without `human_gate`, because no action needed approval.

Show human-gated trace.

Say:

> This second trace uses the same compiled graph but takes a different route. The reasoner proposed actions that require approval, so `action_decision` routed into `human_gate`. This is the clearest evidence that the implementation is a graph with conditional execution, not a linear pipeline.

Point out:

- Trace 1: no `human_gate`
- Trace 2: has `human_gate`
- Same graph, different traversal

## 4:00-4:40 - Trigger Model And Deployment

Return to `FLEETGRAPH.md`.

Show Trigger Model and Reviewer Walkthrough / health checks.

Say:

> For the trigger model, I chose polling every four minutes per active sprint, with a one-minute buffer under the five-minute detection requirement. Webhooks would be faster, but Ship does not have an event bus yet, so polling is the defensible MVP choice. The frontend, Ship API proxy, and FleetGraph agent are deployed publicly, and the API proxy has a timeout so a slow agent does not hang the UI.

Optional show:

- Agent health JSON
- Ship API FleetGraph health JSON

## 4:40-5:10 - MVP Checklist Close

Scroll to PRD MVP checklist.

Say:

> The early submission requirements are covered here: graph running with proactive detection, two public LangSmith traces with different paths, completed agent responsibility and use cases, documented graph nodes and branches, human-in-the-loop, real Ship data, UI chat and notifications, deployment, and a defended trigger model.

End with:

> The main thing I want the grader to see is that FleetGraph is not just a dashboard or chatbot. It is a context-aware graph agent that watches Ship, reasons over relationships, and knows when to act versus when to wait for a human.

## Backup Lines If Something Fails

If Ship is slow:

> The deployed app is slow right now, so I am switching to the documented production evidence in `FLEETGRAPH.md`. The same Week 17 scan and on-demand runs are recorded in the Test Cases table with timestamps, thread IDs, and trace links.

If LangSmith is slow:

> The trace page is slow to load, but the two public trace URLs are in the Test Cases table. Trace 1 is the read-only route and trace 2 is the human-gated route.

If the live answer differs:

> The exact answer can change because this is running against live Ship data. What matters for the demo is the path: scoped request, graph run, citations or finding, and human gate when actions are proposed.

If the assistant times out:

> The timeout message is expected hardening. The Ship API proxy returns a clear timeout instead of leaving the user waiting indefinitely.

## Short Version

Use this if you only have 2 minutes:

> FleetGraph is a project intelligence agent for Ship with two modes: proactive scans and on-demand context-aware chat. Both use the same LangGraph. The current Ship page provides scope, so the assistant knows whether I am on an issue, sprint, project, or person. The graph classifies intent, fetches only the needed Ship data, reasons over it, and then either returns a read-only answer, persists a proactive finding, or pauses at a human gate for actions. These two LangSmith traces prove different execution paths: one read-only path without `human_gate`, and one gated path with `human_gate`. The MVP checklist in `FLEETGRAPH.md` documents the trigger model, use cases, tests, trace links, deployment, and real-data evidence.
