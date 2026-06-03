# Plugforge Performance Targets

| Target | Gate |
|---|---|
| Time-to-First-Event, clean machine docs-only <= 30 minutes; CI target < 60s | `corepack.cmd pnpm drill ttfe` installs the packed `@ship/sdk` into a temporary clean project, starts a containerized Ship API/Postgres stack when needed, then runs SDK subscription creation, SDK document creation, terminal webhook receipt, SDK signature verification, and SDK delivery-log verification. The script reports per-stage timings and fails above `TTFE_TARGET_MS`, default `60000`. Latest live proof in `PLUGFORGE_FINAL_SUBMISSION.md` completed in `2916ms`. |
| Authorization Code + PKCE P95 < 3s | `api/src/platform/platform.test.ts` measures the local end-to-end authorization-code exchange and fails above `3000ms`; `e2e/plugforge-oauth.spec.ts` covers the browser flow and wrong-verifier negative case. |
| OpenAPI spec parity 100% | `api/src/platform/fitness.test.ts` walks every generated public operation and asserts route metadata, scope metadata, ApiError failures, pagination metadata, and SDK method coverage. |
| Webhook delivery latency P95, first attempt < 2s | The SDK webhook integration test creates a subscription, creates a document through `ShipClient`, and requires signed first delivery within `2000ms`. |
| Webhook retry success after transient 5xx | The retry test forces three 500 responses, verifies retry floors of `1s`, `4s`, and `16s`, and requires fourth-attempt success in the delivery log. |
| Public API responses with rate-limit headers 100% | `api/src/platform/fitness.test.ts` now asserts every public OpenAPI response declares `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`; 429 responses also declare `Retry-After`. Runtime tests assert the same headers on limited responses. |
| Telemetry/regression vs Part 1 baseline <= +10% | Public audit logging captures route, status, scope, and latency for every public API call. The final +10% comparison still requires the Part 1 baseline artifact and deployment environment metrics; this is the remaining external gate rather than a code-only assertion. |

## Signature TTFE Drill

From a clean checkout:

```powershell
corepack.cmd pnpm install
corepack.cmd pnpm drill ttfe
```

The harness installs `@ship/sdk` into a temporary clean working directory, starts
the local Docker API/Postgres stack if no `SHIP_URL`/`SHIP_TOKEN` are supplied,
and bootstraps a short-lived drill token inside that containerized database. The
output is a JSON proof containing `elapsed_ms`, `stage_timings_ms`, `target_ms`,
the document, subscription, delivery IDs, delivery status,
`signature_verified: true`, and negative checks showing tampered and expired
payloads were rejected. For CI, the default target is under `60000ms`; for the
full challenge rubric, `TTFE_TARGET_MS=1800000` represents the 30-minute human
threshold. Against a deployed Ship URL, provide `SHIP_URL` and `SHIP_TOKEN` and
run `corepack.cmd pnpm drill ttfe --no-docker` with a publicly reachable webhook
receiver.

### Drill Stage Criteria

| Stage | Expected outcome | Assertion |
|---|---|---|
| Install: `pnpm install @ship/sdk` | Workspace package resolves, TypeScript types load, and no peer-dependency errors block usage. | `corepack.cmd pnpm drill ttfe` packs `@ship/sdk`, installs it into a temporary clean project, and imports `ShipClient` plus `verifyWebhook` before running the loop. |
| Auth: `ship login` device flow | User code is displayed, polling succeeds within 60s in tests, and the token persists in the configured store. | `integrations/cli/tests/ttfe.drill.ts` asserts the user code callback and `ITokenStore` contents; the CLI drill reports the login stage timing. |
| Subscribe: `client.webhooks.create` | Subscription is persisted, signing secret is returned once, and the subscription is visible through the developer surface. | The drill asserts the created subscription payload, one-time `signing_secret`, and delivery-log visibility; platform tests cover developer portal subscription/delivery visibility. |
| Trigger: `client.documents.create` | Document is created, `document.created` is published by the domain bus, and subscribers receive a POST. | The platform tests cover domain event publication; the TTFE drill waits for the subscriber POST after SDK document creation. |
| Verify: `verifyWebhook(headers, rawBody, secret)` | Valid signature passes; tampered body and timestamps older than five minutes fail. | Both `scripts/plugforge-ttfe-drill.mjs` and the CLI drill assert the valid, tampered, and expired cases. |
| Total elapsed | CI completes in under 60s; clean-machine docs-only path stays within 30 minutes. | `TTFE_TARGET_MS` defaults to `60000`; use `TTFE_TARGET_MS=1800000` for the human challenge threshold. |
