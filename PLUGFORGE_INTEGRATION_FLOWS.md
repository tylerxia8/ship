# Plugforge Integration Flows

Ship now carries six concrete integration flows. Five satisfy the post-MVP
integration requirement; the CLI is the must-ship baseline.

Run the flow suite:

```powershell
corepack.cmd pnpm plugforge:flows
```

| Flow | Status | Proof |
|---|---|---|
| CLI tool with device flow | Shipped | `@ship/cli` implements `ship login`, `ship docs ls/get/create`, and `ship webhooks tail`; `integrations/cli/tests/ttfe.drill.ts` verifies the five-line developer story. |
| Slack integration | Shipped reference adapter | `integrations/flows/src/slack.mjs` completes Slack OAuth, verifies Ship webhook signatures, and posts `document.created` plus `issue.assigned` messages; `integrations/flows/tests/slack.test.mjs` proves both event paths. |
| Browser SDK demo | Shipped demo | `integrations/flows/browser-sdk-demo` runs Authorization Code + PKCE in a single-page app and lists documents with `ShipClient`; `browser-sdk-demo.test.mjs` verifies redirect, callback exchange, token storage, and list rendering. |
| GitHub integration | Shipped reference adapter | `integrations/flows/src/github.mjs` verifies GitHub App webhook signatures, extracts `Ship-Issue: <id>` from PRs, validates the issue through the SDK, links the PR, and comments on later Ship issue events. |
| Refresh-token rotation drill | Shipped | `refresh-token-rotation.drill.test.mjs` proves normal rotation, stolen spent-token replay detection, and family invalidation. |
| Idempotency-Key replay drill | Shipped | `idempotency-replay.drill.test.mjs` proves subscribers process the first delivery and dedupe manual replays with the original idempotency key intact. |

The in-process plugin runtime remains intentionally unimplemented stretch work.
