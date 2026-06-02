# Plugforge Evidence Pack

Generated: `2026-06-02T19:26:23.049Z`

## Deployment

- Live app: `https://d2rr1fze9v095b.cloudfront.net`
- Developer Portal: `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
- OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
- Scopes: `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
- Webhook event registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`

## Source Revision

- Branch: `plugforge/main`

```text
M PLUGFORGE_FINAL_SUBMISSION.md
 M PLUGFORGE_OPERATIONAL_READINESS.md
 M PLUGFORGE_README.md
 M sdk/README.md
```

## Live Endpoint Checks

| Check | Status | HTTP | Latency |
| --- | --- | --- | --- |
| `/health` | Yes | 200 | 414ms |
| `/api/v1/openapi.json` | Yes | 200 | 285ms |
| `/api/v1/scopes` | Yes | 200 | 272ms |
| `/api/v1/webhooks/events` | Yes | 200 | 276ms |

## OpenAPI Contract Coverage

- Static contract: Yes, 17 paths, Ship Public API 1.0.0
- Live contract: Yes, 17 paths, Ship Public API 1.0.0

| Required path under `/api/v1` | Static OpenAPI | Live OpenAPI |
| --- | --- | --- |
| `/scopes` | Yes | Yes |
| `/webhooks/events` | Yes | Yes |
| `/oauth/apps/{id}/audit` | Yes | Yes |
| `/oauth/apps/{id}/webhook-subscriptions` | Yes | Yes |
| `/oauth/apps/{id}/webhook-deliveries` | Yes | Yes |
| `/oauth/apps/{id}/webhook-subscriptions/{subscriptionId}/test` | Yes | Yes |

## Smoke Verification

- Command: `corepack.cmd pnpm plugforge:live-smoke`
- Passed: Yes
- Elapsed: 4530ms

```text
  "authenticated_checks": false,
  "checked_at": "2026-06-02T19:26:20.371Z",
  "results": [
    {
      "name": "GET /health",
      "path": "/health",
      "ok": true,
      "status": 200,
      "elapsed_ms": 183
    },
    {
      "name": "GET /api/v1/openapi.json",
      "path": "/api/v1/openapi.json",
      "ok": true,
      "status": 200,
      "elapsed_ms": 157
    },
    {
      "name": "GET /api/v1/scopes",
      "path": "/api/v1/scopes",
      "ok": true,
      "status": 200,
      "elapsed_ms": 58
    },
    {
      "name": "GET /api/v1/webhooks/events",
      "path": "/api/v1/webhooks/events",
      "ok": true,
      "status": 200,
      "elapsed_ms": 61
    },
    {
      "name": "POST /oauth/device/code",
      "path": "/oauth/device/code",
      "ok": true,
      "status": 200,
      "elapsed_ms": 347
    }
  ]
}
```

## Final Check

The longer final check was not run for this pack. To include it, run:

```powershell
corepack.cmd pnpm plugforge:evidence-pack -- --include-final-check
```


## Reviewer Notes

- Public platform routes are under `/api/v1/*`.
- First-party Ship UI routes remain under `/api/*`.
- Developer Portal app activity, webhook subscriptions, deliveries, and test events are session-authenticated admin views.
- Webhook delivery is at-least-once. Consumers should dedupe with the idempotency key.
