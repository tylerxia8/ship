# Plugforge API Examples

Set a base URL and bearer token:

```powershell
$env:SHIP_URL = "https://d2rr1fze9v095b.cloudfront.net"
$env:SHIP_TOKEN = "ship_at_..."
```

For local development, use `http://localhost:3000` instead.

## Discover Scopes And Events

```powershell
curl "$env:SHIP_URL/api/v1/scopes"
curl "$env:SHIP_URL/api/v1/webhooks/events"
```

## Current App Context

```powershell
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/me"
```

## Documents

```powershell
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/documents?limit=10"
```

```powershell
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/documents/<document-id>"
```

```powershell
curl -X POST "$env:SHIP_URL/api/v1/documents" `
  -H "Authorization: Bearer $env:SHIP_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{ "title": "Plugforge API example", "document_type": "wiki" }'
```

Use `next_cursor` from a list response to fetch the next page:

```powershell
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/documents?limit=10&cursor=<next_cursor>"
```

## Webhooks

```powershell
curl -X POST "$env:SHIP_URL/api/v1/webhooks/subscriptions" `
  -H "Authorization: Bearer $env:SHIP_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{ "event_type": "document.created", "target_url": "https://example.com/ship/webhook" }'
```

```powershell
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/webhooks/deliveries"
```

```powershell
curl -X POST "$env:SHIP_URL/api/v1/webhooks/subscriptions/<subscription-id>/rotate-secret" `
  -H "Authorization: Bearer $env:SHIP_TOKEN"
```

```powershell
curl -X POST "$env:SHIP_URL/api/v1/webhooks/subscriptions/<subscription-id>/deactivate" `
  -H "Authorization: Bearer $env:SHIP_TOKEN"
```

```powershell
curl -X POST "$env:SHIP_URL/api/v1/webhooks/deliveries/<delivery-id>/replay" `
  -H "Authorization: Bearer $env:SHIP_TOKEN"
```

## CLI Equivalents

```powershell
node integrations/cli/src/index.mjs scopes --ship-url $env:SHIP_URL
node integrations/cli/src/index.mjs webhooks events --ship-url $env:SHIP_URL
node integrations/cli/src/index.mjs docs ls --limit 10 --type wiki --ship-url $env:SHIP_URL
node integrations/cli/src/index.mjs docs get <document-id> --ship-url $env:SHIP_URL
node integrations/cli/src/index.mjs docs create "Plugforge API example" --ship-url $env:SHIP_URL
node integrations/cli/src/index.mjs webhooks deliveries --ship-url $env:SHIP_URL
```

## Common Failure Examples

These examples are useful when testing that an integration handles expected
platform failures instead of treating every error as a generic outage.

### Missing Token

```powershell
curl "$env:SHIP_URL/api/v1/documents"
```

Expected result: `401 Unauthorized`. The response identifies that a bearer token
is required.

### Missing Scope

Use a token that only has `documents:read`, then attempt a write:

```powershell
curl -X POST "$env:SHIP_URL/api/v1/documents" `
  -H "Authorization: Bearer $env:SHIP_READ_ONLY_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{ "title": "Should fail", "document_type": "wiki" }'
```

Expected result: `403 Forbidden` with scope details. The client should ask for a
token with `documents:write`.

### Invalid Cursor

```powershell
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/documents?cursor=not-a-real-cursor"
```

Expected result: `400 Bad Request`. The client should restart pagination from
the first page.

### Rate Limited

Send many requests quickly with the same token:

```powershell
1..150 | ForEach-Object {
  curl -H "Authorization: Bearer $env:SHIP_TOKEN" "$env:SHIP_URL/api/v1/me"
}
```

Expected result: `429 Too Many Requests` once the token exceeds its minute
bucket. The client should honor rate-limit headers and retry later.

### Deactivated App

Disable an OAuth app in the Developer Portal, then use one of its existing
tokens:

```powershell
curl -H "Authorization: Bearer $env:SHIP_TOKEN" "$env:SHIP_URL/api/v1/me"
```

Expected result: token rejection. The integration owner should create or
reactivate an approved app before retrying.
