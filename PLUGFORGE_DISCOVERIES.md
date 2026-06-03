# Plugforge Three Discoveries

## 1. Device Authorization Grant Is The CLI Unlock

The Device Authorization Grant turns a CLI from an awkward secret-pasting tool
into a real OAuth client. The CLI can show a user code, poll safely, honor
`authorization_pending` and `slow_down`, persist rotating refresh tokens, and
never ask the developer to handle a client secret in the terminal.

Evidence: `api/src/platform/routes/oauth.ts`, `sdk/src/auth.ts`,
`integrations/cli/src/index.mjs`, and `integrations/cli/tests/ttfe.drill.ts`.

## 2. Zod-Driven OpenAPI Plus Fitness Tests Beats Hand-Written Specs

Hand-written specs drift. Route metadata with Zod schemas creates a source of
truth the server can serve, the static docs can export, the validator can check,
and the SDK parity test can walk. The most valuable test is not one endpoint
unit test; it is the route/spec/SDK fitness test that makes drift visible.

Evidence: `api/src/platform/openapi.ts`, `api/src/platform/fitness.test.ts`,
and `docs/openapi.json`.

## 3. Stripe-Style HMAC Signatures Need Replay And Idempotency Together

A webhook signature is more than an HMAC. The timestamp prevents old payload
replay, `v1` keeps the header evolvable, and `Idempotency-Key` lets subscribers
dedupe legitimate replays and retries. Together, they turn at-least-once
delivery from a source of duplicate bugs into a manageable contract.

Evidence: `api/src/platform/webhooks.ts`, `sdk/src/webhooks.ts`,
`integrations/flows/tests/idempotency-replay.drill.test.mjs`, and
`scripts/plugforge-ttfe-drill.mjs`.
