# Plugforge Evidence Pack

Generated: `2026-06-03T22:15:03.346Z`

## Deployment

- Live app: `https://d2rr1fze9v095b.cloudfront.net`
- Developer Portal: `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
- OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
- Scopes: `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
- Webhook event registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`

## Source Revision

- Branch: `plugforge/main`

```text
No relevant uncommitted changes.
```

## Live Endpoint Checks

| Check | Status | HTTP | Latency |
| --- | --- | --- | --- |
| `/health` | Yes | 200 | 242ms |
| `/api/v1/openapi.json` | Yes | 200 | 279ms |
| `/api/v1/scopes` | Yes | 200 | 191ms |
| `/api/v1/webhooks/events` | Yes | 200 | 213ms |

## OpenAPI Contract Coverage

- Static contract: Yes, 22 paths, Ship Public API 1.0.0
- Live contract: Yes, 22 paths, Ship Public API 1.0.0

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
- Elapsed: 1332ms

```text
  "authenticated_checks": false,
  "checked_at": "2026-06-03T22:14:51.147Z",
  "results": [
    {
      "name": "GET /health",
      "path": "/health",
      "ok": true,
      "status": 200,
      "elapsed_ms": 200
    },
    {
      "name": "GET /api/v1/openapi.json",
      "path": "/api/v1/openapi.json",
      "ok": true,
      "status": 200,
      "elapsed_ms": 204
    },
    {
      "name": "GET /api/v1/scopes",
      "path": "/api/v1/scopes",
      "ok": true,
      "status": 200,
      "elapsed_ms": 64
    },
    {
      "name": "GET /api/v1/webhooks/events",
      "path": "/api/v1/webhooks/events",
      "ok": true,
      "status": 200,
      "elapsed_ms": 59
    },
    {
      "name": "POST /oauth/device/code",
      "path": "/oauth/device/code",
      "ok": true,
      "status": 200,
      "elapsed_ms": 65
    }
  ]
}
```

## Final Check

- Command: `corepack.cmd pnpm plugforge:final-check`
- Passed: Yes
- Elapsed: 11999ms

```text
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 1191,
      "stderr_excerpt": null,
      "stdout_excerpt": "> ship@0.0.0 plugforge:live-smoke C:\\Users\\tyler\\ship\n> node scripts/plugforge-live-smoke.mjs\n\n{\n  \"ok\": true,\n  \"ship_url\": \"https://d2rr1fze9v095b.cloudfront.net\",\n  \"authenticated_checks\": false,\n  \"checked_at\": \"2026-06-03T22:14:53.041Z\",\n  \"results\": [\n    {\n      \"name\": \"GET /health\",\n      \""
    },
    {
      "name": "cli scopes discovery",
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 326,
      "stderr_excerpt": null,
      "stdout_excerpt": "{\n  \"data\": [\n    {\n      \"name\": \"documents:read\",\n      \"description\": \"Read documents visible to the authorized user.\"\n    },\n    {\n      \"name\": \"documents:write\",\n      \"description\": \"Create and update documents as the authorized user.\"\n    },\n    {\n      \"name\": \"issues:read\",\n      \"descript"
    },
    {
      "name": "cli webhook event discovery",
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 340,
      "stderr_excerpt": null,
      "stdout_excerpt": "{\n  \"data\": [\n    {\n      \"type\": \"document.created\",\n      \"description\": \"A document was created.\",\n      \"required_scope\": \"documents:read\"\n    },\n    {\n      \"type\": \"document.updated\",\n      \"description\": \"A document was updated.\",\n      \"required_scope\": \"documents:read\"\n    },\n    {\n      \"t"
    },
    {
      "name": "cli help",
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 70,
      "stderr_excerpt": null,
      "stdout_excerpt": "Ship Plugforge CLI\n\nUsage:\n  ship login --client-id <id> [--ship-url <url>] [--scope <scopes>]\n  ship scopes [--ship-url <url>]\n  ship me [--ship-url <url>]\n  ship docs ls [--ship-url <url>] [--limit 25] [--cursor <cursor>] [--type <type>]\n  ship docs get <document-id> [--ship-url <url>]\n  ship docs"
    },
    {
      "name": "plugforge fitness",
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 9354,
      "stderr_excerpt": null,
      "stdout_excerpt": "> @ship/api@0.0.0 plugforge:fitness C:\\Users\\tyler\\ship\\api\n> vitest run src/platform/fitness.test.ts && vitest run src/platform/platform.test.ts\n\n\n\u001b[1m\u001b[46m RUN \u001b[49m\u001b[22m \u001b[36mv4.0.17 \u001b[39m\u001b[90mC:/Users/tyler/ship/api\u001b[39m\n\n \u001b[32m✓\u001b[39m src/platform/fitness.test.ts \u001b[2m(\u001b[22m\u001b[2m8 tests\u001b[22m\u001b[2m)\u001b"
    }
  ]
}
```


## Reviewer Notes

- Public platform routes are under `/api/v1/*`.
- First-party Ship UI routes remain under `/api/*`.
- Developer Portal app activity, webhook subscriptions, deliveries, and test events are session-authenticated admin views.
- Webhook delivery is at-least-once. Consumers should dedupe with the idempotency key.
