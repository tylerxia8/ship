# Plugforge Evidence Pack

Generated: `2026-06-08T14:46:08.445Z`

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
| `/health` | Yes | 200 | 293ms |
| `/api/v1/openapi.json` | Yes | 200 | 285ms |
| `/api/v1/scopes` | Yes | 200 | 215ms |
| `/api/v1/webhooks/events` | Yes | 200 | 217ms |

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
- Elapsed: 1647ms

```text
  "authenticated_checks": false,
  "checked_at": "2026-06-08T14:45:30.284Z",
  "results": [
    {
      "name": "GET /health",
      "path": "/health",
      "ok": true,
      "status": 200,
      "elapsed_ms": 227
    },
    {
      "name": "GET /api/v1/openapi.json",
      "path": "/api/v1/openapi.json",
      "ok": true,
      "status": 200,
      "elapsed_ms": 180
    },
    {
      "name": "GET /api/v1/scopes",
      "path": "/api/v1/scopes",
      "ok": true,
      "status": 200,
      "elapsed_ms": 106
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
      "elapsed_ms": 70
    }
  ]
}
```

## Final Check

- Command: `corepack.cmd pnpm plugforge:final-check`
- Passed: Yes
- Elapsed: 37867ms

```text
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 76,
      "stderr_excerpt": null,
      "stdout_excerpt": "Ship Plugforge CLI\n\nUsage:\n  ship login --client-id <id> [--ship-url <url>] [--scope <scopes>]\n  ship scopes [--ship-url <url>]\n  ship me [--ship-url <url>]\n  ship docs ls [--ship-url <url>] [--limit 25] [--cursor <cursor>] [--type <type>]\n  ship docs get <document-id> [--ship-url <url>]\n  ship docs"
    },
    {
      "name": "sdk unit tests",
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 3048,
      "stderr_excerpt": null,
      "stdout_excerpt": "> ship@0.0.0 plugforge:sdk-test C:\\Users\\tyler\\ship\n> corepack pnpm --filter @ship/sdk test\n\n\n> @ship/sdk@0.0.0 test C:\\Users\\tyler\\ship\\sdk\n> vitest run\n\n\n\u001b[1m\u001b[46m RUN \u001b[49m\u001b[22m \u001b[36mv4.0.17 \u001b[39m\u001b[90mC:/Users/tyler/ship/sdk\u001b[39m\n\n \u001b[32m✓\u001b[39m tests/webhooks.test.ts \u001b[2m(\u001b[22m\u001b[2m4 tests\u001b[22m\u001b[2m"
    },
    {
      "name": "plugforge fitness",
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 15786,
      "stderr_excerpt": null,
      "stdout_excerpt": "> @ship/api@0.0.0 plugforge:fitness C:\\Users\\tyler\\ship\\api\n> vitest run src/platform/fitness.test.ts && vitest run src/platform/webhooks.signer.test.ts && vitest run src/platform/platform.test.ts\n\n\n\u001b[1m\u001b[46m RUN \u001b[49m\u001b[22m \u001b[36mv4.0.17 \u001b[39m\u001b[90mC:/Users/tyler/ship/api\u001b[39m\n\n \u001b[32m✓\u001b[39m src/platfo"
    },
    {
      "name": "performance evidence",
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 5002,
      "stderr_excerpt": null,
      "stdout_excerpt": "> ship@0.0.0 plugforge:perf C:\\Users\\tyler\\ship\n> corepack pnpm --filter @ship/sdk build && node scripts/plugforge-signature-perf.mjs && node scripts/plugforge-sdk-size.mjs\n\n\n> @ship/sdk@0.0.0 build C:\\Users\\tyler\\ship\\sdk\n> tsc\n\n{\n  \"target_ms_per_call\": 1,\n  \"iterations\": 50000,\n  \"elapsed_ms\": 85"
    },
    {
      "name": "cost snapshot",
      "ok": true,
      "exit_code": 0,
      "elapsed_ms": 11135,
      "stderr_excerpt": null,
      "stdout_excerpt": "> ship@0.0.0 plugforge:costs C:\\Users\\tyler\\ship\n> node scripts/plugforge-cost-snapshot.mjs \"--\" \"--measure-ci\"\n\n{\n  \"generated_at\": \"2026-06-08T14:46:08.143Z\",\n  \"measured_ci_commands\": true,\n  \"measured_ttfe\": false,\n  \"epic7_llm_spend_tracking\": {\n    \"llm_spend_usd_day\": 0.336628,\n    \"baseline_"
    }
  ]
}
```


## Reviewer Notes

- Public platform routes are under `/api/v1/*`.
- First-party Ship UI routes remain under `/api/*`.
- Developer Portal app activity, webhook subscriptions, deliveries, and test events are session-authenticated admin views.
- Webhook delivery is at-least-once. Consumers should dedupe with the idempotency key.
