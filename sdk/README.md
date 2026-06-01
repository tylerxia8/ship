# @ship/sdk

Typed TypeScript client for Ship's public `/api/v1` platform API.

## Build

```bash
corepack.cmd pnpm --filter @ship/sdk build
```

## Basic Usage

```ts
import { ShipClient } from '@ship/sdk';

const client = new ShipClient({
  token: process.env.SHIP_TOKEN!,
  baseUrl: 'http://localhost:3000/api/v1',
});

const me = await client.me();
const scopes = await client.scopes();
const documents = await client.documents.list({ limit: 25 });
```

## Device Login

```ts
const token = await ShipClient.deviceLogin({
  clientId: 'ship_app_...',
  shipUrl: 'http://localhost:3000',
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
  shipUrl: 'http://localhost:3000',
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

The SDK has no runtime dependencies beyond platform `fetch` and Web Crypto APIs.
