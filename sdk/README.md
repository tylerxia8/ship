# @ship/sdk

Typed TypeScript client for Ship's public `/api/v1` platform API.

## Quickstart

Build the SDK from the repository root:

```bash
corepack.cmd pnpm --filter @ship/sdk build
```

Set the live Ship URL and an access token:

```bash
set SHIP_URL=https://d2rr1fze9v095b.cloudfront.net
set SHIP_TOKEN=ship_at_...
```

Create a client:

```ts
import { ShipClient } from '@ship/sdk';

const client = new ShipClient({
  token: process.env.SHIP_TOKEN!,
  baseUrl: `${process.env.SHIP_URL}/api/v1`,
});
```

## Discover The Platform

```ts
const me = await client.me();
const scopes = await client.scopes();
const events = await client.webhooks.listEvents();

console.log(me.data.app.name);
console.log(scopes.data.map((scope) => scope.name));
console.log(events.data.map((event) => event.event_type));
```

## Documents

```ts
const documents = await client.documents.list({ limit: 25 });

const created = await client.documents.create({
  title: 'SDK quickstart document',
  document_type: 'wiki',
});

const fetched = await client.documents.get(created.data.id);
```

## Device Login

```ts
const token = await ShipClient.deviceLogin({
  clientId: 'ship_app_...',
  shipUrl: process.env.SHIP_URL,
  scope: 'documents:read documents:write webhooks:manage',
  onCode(code) {
    console.log(`Open ${code.verification_uri} and enter ${code.user_code}`);
  },
});
```

Refresh tokens rotate on every use:

```ts
const refreshed = await ShipClient.refreshAccessToken({
  clientId: 'ship_app_...',
  refreshToken: token.refresh_token,
  shipUrl: process.env.SHIP_URL,
});
```

## Webhooks

```ts
const subscription = await client.webhooks.createSubscription({
  event_type: 'document.created',
  target_url: 'https://example.com/ship/webhook',
});

await client.webhooks.rotateSubscriptionSecret(subscription.data.id);
await client.webhooks.deactivateSubscription(subscription.data.id);
```

Verify incoming webhook payloads with the raw request body:

```ts
import { verifyWebhook } from '@ship/sdk';

const ok = verifyWebhook(headers, rawBody, signingSecret);
```

Use the idempotency key from the webhook headers to dedupe retries.

## Errors

SDK calls throw `ShipApiError` for public API errors. Use the status, request ID,
and response body to decide whether to retry, request a new token, or show a
human-readable setup message.

The SDK has no runtime dependencies beyond platform `fetch` and Web Crypto APIs.
