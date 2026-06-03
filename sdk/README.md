# @ship/sdk

Typed TypeScript client for Ship's public `/api/v1` platform API.

## Package Status

For this assignment, `@ship/sdk` is implemented as a publish-ready workspace
package in this repository. The production packaging step is publishing this
package to npm under the same name. Until then, a clean-machine reviewer can
build and use it from the monorepo:

```bash
git clone https://github.com/tylerxia8/ship.git
cd ship
git checkout plugforge/main
corepack.cmd pnpm install
corepack.cmd pnpm --filter @ship/sdk build
```

## Time-To-First-Event Drill

The signature drill proves the full platform loop with the SDK:

1. Create a webhook subscription through `ShipClient`.
2. Create a document through `ShipClient`.
3. Receive the signed webhook in the terminal.
4. Verify the signature with `verifyWebhook`.
5. Confirm the delivery log through `ShipClient`.

```bash
corepack.cmd pnpm install
set SHIP_URL=http://localhost:3000
set SHIP_TOKEN=ship_at_...
corepack.cmd pnpm plugforge:ttfe
```

The script fails above `TTFE_TARGET_MS`, which defaults to `60000` for CI.
Set `TTFE_TARGET_MS=1800000` to run against the 30-minute human challenge
threshold. For a deployed Ship URL, use a publicly reachable webhook receiver.

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

console.log(me.app.client_id);
console.log(scopes.data.map((scope) => scope.name));
console.log(events.data.map((event) => event.type));
```

## Documents

```ts
const documents = await client.documents.list({ limit: 25 });

const created = await client.documents.create({
  title: 'SDK quickstart document',
  document_type: 'wiki',
});

const fetched = await client.documents.get(created.data.id);

for await (const document of client.documents.iterate({ limit: 50 })) {
  console.log(document.title);
}
```

## Issues And Sprints

`client.issues` and `client.sprints` are typed facades over the public document
API, so their method signatures stay aligned with the OpenAPI document routes.

```ts
const issue = await client.issues.create({
  title: 'Triage OAuth verifier failure',
  properties: { status: 'todo' },
});

const sprint = await client.sprints.create({
  title: 'Launch readiness',
});

for await (const item of client.issues.iterate()) {
  console.log(item.id, item.title);
}
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

## Authorization Code + PKCE

```ts
const flow = ShipClient.authorizationCodeFlow({
  clientId: 'ship_app_...',
  redirectUri: 'https://example.com/callback',
  shipUrl: process.env.SHIP_URL,
  scope: 'documents:read',
});

console.log(flow.authorizationUrl);

const token = await flow.exchange('https://example.com/callback?code=...&state=...');
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

## Token Stores

```ts
import { FileTokenStore, InMemoryTokenStore, BrowserLocalStorageTokenStore } from '@ship/sdk';

const tokenStore = new InMemoryTokenStore();
await tokenStore.set(token);

const storedClient = new ShipClient({
  tokenStore,
  baseUrl: `${process.env.SHIP_URL}/api/v1`,
});
```

## Errors

SDK calls throw `ShipSDKError`. `error.toUnion()` returns a discriminated union
with `kind: 'auth' | 'rate_limit' | 'not_found' | 'validation' | 'server' |
'network'` for exhaustive switching.

The SDK has no runtime dependencies beyond platform `fetch` plus Node-compatible
crypto/fs APIs for webhook verification and file token storage.
