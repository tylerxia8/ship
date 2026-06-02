# Plugforge Operational Readiness

Plugforge is built as an MVP platform layer, but the production posture is
documented enough for a reviewer to understand the operating model.

## Webhook Retry Load

- Delivery is at-least-once.
- Each delivery row is persisted before delivery is attempted.
- Transient failures move to `retry_pending`.
- Subscriber `Retry-After` headers are honored for rate-limit responses.
- Permanent failures move to `dead_letter`.
- The MVP retry worker runs in-process. The documented next step is SQS or Redis
  backed retries when the API scales beyond one worker process.

## API Rate Limits

- Public API requests include rate-limit headers.
- Limits are isolated by bearer token so one integration does not consume another
  integration's budget.
- MVP storage is in-memory. Production scale should move counters to Redis or an
  equivalent shared store.

## Audit And Logging

- Public API calls are written to the API audit table with route, scope, status,
  latency, client ID, and request ID.
- The Developer Portal exposes app-specific activity to workspace admins.
- CloudWatch remains the runtime logging system for government compatibility.

## Token And Secret Policy

- Client secrets are shown once and stored only as hashes.
- Rotating a client secret invalidates the old secret immediately.
- Access tokens are short-lived.
- Refresh tokens rotate on every use.
- Refresh token replay revokes the token family.

## Known MVP Tradeoffs

- No dual-secret webhook rotation grace period yet.
- No public developer documentation site yet; the OpenAPI contract, SDK README,
  CLI, and examples are the current developer entry points.
- Rate-limit and retry workers are intentionally simple for the assignment scale.
