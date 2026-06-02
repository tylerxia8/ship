# Plugforge Examples

Small examples for developers trying Ship's public platform API.

## Setup

Build the SDK first:

```powershell
corepack.cmd pnpm --filter @ship/sdk build
```

Set a live or local Ship URL and a public API token:

```powershell
$env:SHIP_URL = "https://d2rr1fze9v095b.cloudfront.net"
$env:SHIP_TOKEN = "ship_at_..."
```

## Examples

Create a document:

```powershell
node examples/plugforge/node-doc-create.mjs
```

List webhook event types and recent deliveries:

```powershell
node examples/plugforge/webhook-events-and-deliveries.mjs
```

Run a minimal webhook receiver that verifies Ship signatures:

```powershell
$env:SHIP_WEBHOOK_SECRET = "ship_whsec_..."
node examples/plugforge/webhook-receiver.mjs
```
