# Plugforge Evidence Pack

Generated: `2026-06-03T21:32:35.194Z`

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
| `/health` | Yes | 200 | 251ms |
| `/api/v1/openapi.json` | Yes | 200 | 275ms |
| `/api/v1/scopes` | Yes | 200 | 203ms |
| `/api/v1/webhooks/events` | Yes | 200 | 209ms |

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
- Elapsed: 1256ms

```text
  "authenticated_checks": false,
  "checked_at": "2026-06-03T21:32:22.970Z",
  "results": [
    {
      "name": "GET /health",
      "path": "/health",
      "ok": true,
      "status": 200,
      "elapsed_ms": 184
    },
    {
      "name": "GET /api/v1/openapi.json",
      "path": "/api/v1/openapi.json",
      "ok": true,
      "status": 200,
      "elapsed_ms": 199
    },
    {
      "name": "GET /api/v1/scopes",
      "path": "/api/v1/scopes",
      "ok": true,
      "status": 200,
      "elapsed_ms": 113
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
      "elapsed_ms": 71
    }
  ]
}
```

## Final Check

- Command: `corepack.cmd pnpm plugforge:final-check`
- Passed: No
- Elapsed: 12082ms

```text
      "stdout_excerpt": "{\n  \"data\": [\n    {\n      \"type\": \"document.created\",\n      \"description\": \"A document was created.\",\n      \"required_scope\": \"documents:read\"\n    },\n    {\n      \"type\": \"document.updated\",\n      \"description\": \"A document was updated.\",\n      \"required_scope\": \"documents:read\"\n    },\n    {\n      \"t"
    },
    {
      "name": "cli help",
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 62,
      "stderr_excerpt": null,
      "stdout_excerpt": "Ship Plugforge CLI\n\nUsage:\n  ship login --client-id <id> [--ship-url <url>] [--scope <scopes>]\n  ship scopes [--ship-url <url>]\n  ship me [--ship-url <url>]\n  ship docs ls [--ship-url <url>] [--limit 25] [--cursor <cursor>] [--type <type>]\n  ship docs get <document-id> [--ship-url <url>]\n  ship docs"
    },
    {
      "name": "plugforge fitness",
      "ok": false,
      "exit_code": 1,
      "elapsed_ms": 9292,
      "stderr_excerpt": "\u001b[31m⎯⎯⎯⎯⎯⎯\u001b[39m\u001b[1m\u001b[41m Unhandled Errors \u001b[49m\u001b[22m\u001b[31m⎯⎯⎯⎯⎯⎯\u001b[39m\n\u001b[31m\u001b[1m\nVitest caught 1 unhandled error during the test run.\nThis might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.\u001b[22m\u001b[39m\n\n\u001b[31m⎯⎯⎯⎯⎯⎯\u001b[39m\u001b[1m\u001b[41m Unhandled Error \u001b[49m\u001b[2",
      "stdout_excerpt": "> @ship/api@0.0.0 plugforge:fitness C:\\Users\\tyler\\ship\\api\n> vitest run src/platform/fitness.test.ts && vitest run src/platform/platform.test.ts\n\n\n\u001b[1m\u001b[46m RUN \u001b[49m\u001b[22m \u001b[36mv4.0.17 \u001b[39m\u001b[90mC:/Users/tyler/ship/api\u001b[39m\n\n \u001b[32m✓\u001b[39m src/platform/fitness.test.ts \u001b[2m(\u001b[22m\u001b[2m8 tests\u001b[22m\u001b[2m)\u001b"
    }
  ]
}
 ELIFECYCLE  Command failed with exit code 1.
[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Unhandled Errors [49m[22m[31m⎯⎯⎯⎯⎯⎯[39m
[31m[1m
Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.[22m[39m

[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Unhandled Error [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m
[31m[1mError[22m: [vitest-pool]: Worker forks emitted error.[39m
[90m [2m❯[22m EventEmitter.<anonymous> ../node_modules/.pnpm/vitest@4.0.17_@types+node@2_4e49cfd8fab5854e39624a9c8e4e2466/node_modules/vitest/dist/chunks/cli-api.Cx2DW4Bc.js:[2m8043:22[22m[39m
[90m [2m❯[22m EventEmitter.emit node:events:[2m509:28[22m[39m
[90m [2m❯[22m ChildProcess.emitUnexpectedExit ../node_modules/.pnpm/vitest@4.0.17_@types+node@2_4e49cfd8fab5854e39624a9c8e4e2466/node_modules/vitest/dist/chunks/cli-api.Cx2DW4Bc.js:[2m7610:22[22m[39m
[90m [2m❯[22m ChildProcess.emit node:events:[2m509:28[22m[39m
[90m [2m❯[22m Process.ChildProcess._handle.onexit node:internal/child_process:[2m295:12[22m[39m

[31m[1mCaused by: Error[22m: Worker exited unexpectedly[39m
[90m [2m❯[22m ChildProcess.emitUnexpectedExit ../node_modules/.pnpm/vitest@4.0.17_@types+node@2_4e49cfd8fab5854e39624a9c8e4e2466/node_modules/vitest/dist/chunks/cli-api.Cx2DW4Bc.js:[2m7609:33[22m[39m
[90m [2m❯[22m ChildProcess.emit node:events:[2m509:28[22m[39m
[90m [2m❯[22m Process.ChildProcess._handle.onexit node:internal/child_process:[2m295:12[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[39m
```


## Reviewer Notes

- Public platform routes are under `/api/v1/*`.
- First-party Ship UI routes remain under `/api/*`.
- Developer Portal app activity, webhook subscriptions, deliveries, and test events are session-authenticated admin views.
- Webhook delivery is at-least-once. Consumers should dedupe with the idempotency key.
