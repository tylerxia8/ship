# Plugforge API Examples

Set a base URL and bearer token:

```bash
$env:SHIP_URL = "http://localhost:3000"
$env:SHIP_TOKEN = "ship_at_..."
```

## Discover Scopes And Events

```bash
curl "$env:SHIP_URL/api/v1/scopes"
curl "$env:SHIP_URL/api/v1/webhooks/events"
```

## Current App Context

```bash
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/me"
```

## Documents

```bash
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/documents?limit=10"
```

```bash
curl -X POST "$env:SHIP_URL/api/v1/documents" `
  -H "Authorization: Bearer $env:SHIP_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{ "title": "Plugforge API example", "document_type": "wiki" }'
```

Use `next_cursor` from a list response to fetch the next page:

```bash
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/documents?limit=10&cursor=<next_cursor>"
```

## Webhooks

```bash
curl -X POST "$env:SHIP_URL/api/v1/webhooks/subscriptions" `
  -H "Authorization: Bearer $env:SHIP_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{ "event_type": "document.created", "target_url": "https://example.com/ship/webhook" }'
```

```bash
curl -H "Authorization: Bearer $env:SHIP_TOKEN" `
  "$env:SHIP_URL/api/v1/webhooks/deliveries"
```

```bash
curl -X POST "$env:SHIP_URL/api/v1/webhooks/subscriptions/<subscription-id>/rotate-secret" `
  -H "Authorization: Bearer $env:SHIP_TOKEN"
```

```bash
curl -X POST "$env:SHIP_URL/api/v1/webhooks/subscriptions/<subscription-id>/deactivate" `
  -H "Authorization: Bearer $env:SHIP_TOKEN"
```

```bash
curl -X POST "$env:SHIP_URL/api/v1/webhooks/deliveries/<delivery-id>/replay" `
  -H "Authorization: Bearer $env:SHIP_TOKEN"
```

## CLI Equivalents

```bash
node integrations/cli/src/index.mjs scopes --ship-url $env:SHIP_URL
node integrations/cli/src/index.mjs webhooks events --ship-url $env:SHIP_URL
node integrations/cli/src/index.mjs docs create "Plugforge API example" --ship-url $env:SHIP_URL
node integrations/cli/src/index.mjs webhooks deliveries --ship-url $env:SHIP_URL
```
