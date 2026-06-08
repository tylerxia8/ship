# Pre-Search Conversation Reference

This file is the repository reference artifact for the AI-assisted PlugForge
pre-search and final-submission hardening conversation.

The full interaction was iterative and happened across multiple local Codex
turns while implementing PlugForge. The durable decisions and constraints from
that conversation are committed in the following files:

- `PRESEARCH.md` contains the completed Phase 1, Phase 2, and Phase 3 answers.
- `docs/architecture.md` contains the compact architecture defense.
- `docs/architecture-extended.md` contains the longer architecture appendix.
- `PLUGFORGE_SUBMISSION_CHECKLIST.md` maps rubric items to evidence.
- `PLUGFORGE_FINAL_SUBMISSION.md` is the reviewer entry point.

## Conversation Themes Captured

1. OAuth foundation first. The platform needed working OAuth app registration,
   PKCE, Device Grant, refresh rotation, bearer middleware, and scope checks
   before adding broad public surface area.
2. Public/internal split as a hard boundary. `/api/v1/*` is the public contract;
   first-party app routes stay under `/api/*`; boundary checks enforce the split.
3. Specs are generated, not hand-written. Route metadata and Zod schemas feed
   OpenAPI 3.1 so the public contract does not drift from implementation.
4. Webhooks are domain-published. Document writes publish through the event bus;
   route handlers do not manually fire webhook deliveries.
5. The SDK and CLI prove developer experience. The CLI consumes `@ship/sdk`,
   and the TTFE drill scripts the five-line developer story end to end.
6. Proof beats promises. After feedback, focused signer tests, SDK tests,
   proof gates, final-check evidence, and GitHub Actions TTFE/flake proof were
   added so the demo is backed by repeatable checks.
7. The agent should be a platform citizen. The final hardening pass added OAuth
   Client Credentials support so FleetGraph can mint its own scoped public API
   token instead of relying only on a pre-injected bearer token.

## Final Feedback Actions Recorded

- Added `grant_type=client_credentials` on `/oauth/token`.
- Added `ShipClient.clientCredentials()` and the exported SDK helper.
- Updated FleetGraph public reads to prefer `SHIP_AGENT_CLIENT_ID` and
  `SHIP_AGENT_CLIENT_SECRET`, with `SHIP_PUBLIC_API_TOKEN` as a fallback.
- Updated `scripts/plugforge-agent-audit-proof.mjs` to prefer client
  credentials and report `auth_mode`.
- Added `PLUGFORGE_FINAL_PERFORMANCE_COMPARISON.md`.
- Added `PLUGFORGE_GRADER_QUICKSTART.md`.
- Updated the final demo script to walk through SDK login through webhook replay.

## Why This Is A Reference Instead Of A Transcript

The working conversation included secrets-adjacent operational details such as
demo accounts, token handling, and deployment checks. This reference preserves
the engineering decisions and feedback response without duplicating sensitive
or noisy terminal material. The source-of-truth artifacts above are the
auditable submission record.

