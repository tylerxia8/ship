# Plugforge Security Notes

Plugforge exposes Ship as a developer platform while keeping the public surface
small, scoped, and auditable.

## Public Boundary

- External integrations use `/api/v1/*`.
- First-party Ship UI routes remain under `/api/*`.
- Public routes use OAuth bearer tokens, scope checks, request IDs, rate-limit
  headers, and public API audit logging.

## OAuth Apps

- Workspace admins manage OAuth apps from `/settings/developers`.
- Raw `client_secret` values are shown once on creation or rotation.
- Ship stores only secret hashes.
- Secret rotation invalidates the old secret immediately.
- App deactivation immediately rejects existing bearer tokens for that app.

## Tokens

- Access tokens are short-lived.
- Refresh tokens rotate on use.
- Reuse of a spent refresh token revokes the token family.
- Device Authorization Grant supports CLI login without a client secret or local
  callback server.

## Scopes

MVP scopes are intentionally narrow:

- `documents:read`
- `documents:write`
- `issues:read`
- `issues:write`
- `sprints:read`
- `sprints:write`
- `webhooks:manage`

Every protected public endpoint declares and enforces its required scope.

## Webhook Security

- Ship signs each webhook with HMAC-SHA256.
- The signature covers `timestamp + "." + rawBody`.
- The SDK verifier rejects missing signatures, tampered bodies, and stale
  timestamps by default.
- Payloads include event metadata and document summary fields, not full rich-text
  document content.
- Subscribers should dedupe events by `Ship-Idempotency-Key`.

## Operational Controls

- The Developer Portal shows app status, scopes, API activity, webhook
  subscriptions, and delivery attempts.
- Admins can disable an app if credentials leak.
- Webhook subscriptions can be deactivated.
- Delivery rows record status, response code, latency, retry state, and response
  excerpt.
- Test events let admins validate a subscriber before depending on production
  events.

## Known MVP Tradeoffs

- Webhook delivery uses an in-process worker for the sprint. Delivery state is
  persisted in Postgres, and the interface can move to SQS or Redis later.
- Rate limiting is in-memory for MVP. Production should use a shared store so
  limits apply across multiple API instances.
- Webhook signing secret rotation has no dual-secret grace period. Subscribers
  must update their stored secret before expecting future signatures to verify.
