# Plugforge Performance Targets

| Target | Gate |
|---|---|
| Time-to-First-Event, clean machine docs-only <= 30 minutes; CI target < 60s | `corepack.cmd pnpm plugforge:ttfe` builds `@ship/sdk`, then runs SDK subscription creation, SDK document creation, terminal webhook receipt, SDK signature verification, and SDK delivery-log verification. The script fails above `TTFE_TARGET_MS`, default `60000`. Latest live proof in `PLUGFORGE_FINAL_SUBMISSION.md` completed in `2916ms`. |
| Authorization Code + PKCE P95 < 3s | `api/src/platform/platform.test.ts` measures the local end-to-end authorization-code exchange and fails above `3000ms`; `e2e/plugforge-oauth.spec.ts` covers the browser flow and wrong-verifier negative case. |
| OpenAPI spec parity 100% | `api/src/platform/fitness.test.ts` walks every generated public operation and asserts route metadata, scope metadata, ApiError failures, pagination metadata, and SDK method coverage. |
| Webhook delivery latency P95, first attempt < 2s | The SDK webhook integration test creates a subscription, creates a document through `ShipClient`, and requires signed first delivery within `2000ms`. |
| Webhook retry success after transient 5xx | The retry test forces three 500 responses, verifies retry floors of `1s`, `4s`, and `16s`, and requires fourth-attempt success in the delivery log. |
| Public API responses with rate-limit headers 100% | `api/src/platform/fitness.test.ts` now asserts every public OpenAPI response declares `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`; 429 responses also declare `Retry-After`. Runtime tests assert the same headers on limited responses. |
| Telemetry/regression vs Part 1 baseline <= +10% | Public audit logging captures route, status, scope, and latency for every public API call. The final +10% comparison still requires the Part 1 baseline artifact and deployment environment metrics; this is the remaining external gate rather than a code-only assertion. |

## Signature TTFE Drill

From a clean checkout with a running Ship API and a token scoped
`documents:write webhooks:manage`:

```powershell
corepack.cmd pnpm install
$env:SHIP_URL = "http://localhost:3000"
$env:SHIP_TOKEN = "ship_at_..."
corepack.cmd pnpm plugforge:ttfe
```

The output is a JSON proof containing `elapsed_ms`, `target_ms`, the document,
subscription, delivery IDs, delivery status, and `signature_verified: true`.
For CI, the default target is under `60000ms`; for the full challenge rubric,
`TTFE_TARGET_MS=1800000` represents the 30-minute human threshold. Against a
public deployment, the receiver URL must be publicly reachable; the local
terminal receiver is intended for local containers and CI networks.
