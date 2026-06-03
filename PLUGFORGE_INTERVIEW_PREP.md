# Plugforge Interview Prep

Use these as spoken answers, not memorized paragraphs. The strongest version is
concrete: name the route, name the middleware, name the interface boundary, then
say what tradeoff you chose.

## Technical Topics

### Walk me through how an authenticated request reaches a domain service.

An external app calls `/api/v1/*` with a bearer token. The public router attaches
platform concerns before calling the shared domain service:

1. **AuthN:** `api/src/platform/auth.ts` validates the bearer token, checks
   expiry, and populates request context with app, user, token, and scopes.
2. **Rate limit:** `api/src/platform/ratelimit.ts` applies per-app and per-token
   token buckets and adds `X-RateLimit-*` headers.
3. **AuthZ:** `api/src/platform/scopes.ts` runs `requireScope("documents:read")`
   or the route's declared scope. Missing scope returns a 403 with the missing
   scope named.
4. **Audit:** `api/src/platform/audit.ts` records route, app `client_id`, user,
   scope, status, and latency.
5. **Domain:** the route calls shared domain code such as
   `api/src/platform/domain/documents.ts`.
6. **Webhook publication:** writes publish from the domain layer through
   `IEventBus`, not from the route layer. That keeps UI, API, CLI, and future
   integrations consistent.

Each piece is separate middleware because each has a different reason to change.
Auth token parsing, rate-limit policy, scope registry, error shape, and audit
logging are independent platform contracts. Keeping them separate made the
fitness tests easier too: every route must declare a scope and return the public
`ApiError` shape.

### Why Auth Code + PKCE for web apps and Device Grant for the CLI?

Browser apps need a redirect-based flow because the user is already in a
browser and can consent there. PKCE protects the authorization code by binding it
to a verifier the client generated before redirect. If an attacker steals the
authorization code from a redirect or log, they still cannot redeem it without
the `code_verifier`.

A CLI is different. It cannot receive a normal browser redirect reliably, and it
must not ask a developer to paste a long-lived secret into a terminal. Device
Authorization Grant lets the CLI show a short user code, poll with a
`device_code`, honor `authorization_pending` and `slow_down`, then store tokens
through the SDK token store.

The key sentence: **PKCE replaces trust in a static client secret with proof that
the same client that started the flow is redeeming the code.** That matters for
public clients where secrets cannot be kept secret.

### Show me your webhook signature scheme.

Ship signs the exact raw request body with HMAC-SHA256:

```text
Ship-Signature: t=<unix-seconds>,v1=<hex-hmac-sha256>
signed payload: <timestamp>.<rawBody>
```

The SDK exposes:

```ts
verifyWebhook(headers, rawBody, secret, toleranceSec = 300)
```

The timestamp prevents replay attacks. Without it, an attacker who captured one
valid webhook could resend the same body and signature later. The default
tolerance is five minutes. Valid signatures pass; tampered bodies, missing `v1`,
and old timestamps fail.

Clock drift is the tradeoff. Small drift inside the tolerance is fine. If the
server or subscriber clock drifts beyond five minutes, legitimate deliveries can
be rejected. In production I would put NTP/managed clock sync on both sides,
monitor signature rejection rates, and allow subscribers to tune tolerance only
with care. I would not silently disable timestamp checking.

### How do you stop the OpenAPI spec from drifting?

The spec is generated from route metadata in-process, not hand-written. Public
routes carry their method, path, scope, request schema, response schema, and list
pagination metadata beside the handler. `api/src/platform/openapi.ts` turns that
metadata into OpenAPI 3.1, and `docs/openapi.json` is an exported static copy.

The fitness test walks the public surface and fails when:

- a `/api/v1/*` route has no OpenAPI path or method,
- a public route does not declare a scope,
- a failure path does not return `{ code, message, request_id }`,
- a list endpoint does not return `{ data, next_cursor }`,
- the generated spec does not validate as OpenAPI 3.1,
- the SDK does not expose the method the spec promises.

The idea is simple: the implementation is the source of truth, but the contract
is tested as if a stranger were consuming it.

### The agent is now a platform citizen. What did it cost and buy?

It cost extra plumbing: OAuth app registration, token handling, SDK client calls,
scope declarations, audit rows, and some migration away from direct service
calls. It also meant the agent has to handle public API errors instead of
assuming privileged internal access.

It bought a much cleaner architecture. The agent now uses the same `@ship/sdk`,
same `/api/v1` routes, same scopes, same rate limits, same OpenAPI contract, and
same audit trail as Slack, GitHub, or a third-party developer. That proves the
platform is real. It also keeps the platform LLM-free: model cost scales with
explicit agent turns, not platform traffic.

### Sketch user creates document in UI to Slack message in channel.

The path is:

```text
Ship UI
  -> internal document route or public SDK client
  -> shared document domain service
  -> IEventBus publishes document.created
  -> event registry validates document.created schema
  -> subscription matcher finds Slack integration subscription
  -> webhook signer builds Ship-Signature and Idempotency-Key
  -> IWebhookDeliverer sends POST
  -> Slack integration verifies with @ship/sdk verifyWebhook()
  -> Slack OAuth client posts message to channel
  -> delivery log records status, excerpt, latency
```

The important boundaries are UI/API to domain service, domain to `IEventBus`,
event bus to webhook delivery, signed webhook to external integration, and
integration to Slack's API. The route layer never manually emits the webhook;
publication belongs to the domain write.

## Mindset And Growth

### Which slice taught you the most about API design?

The TTFE slice taught me the most. A public API can look good endpoint by
endpoint and still feel bad in a real loop. The five-line story forced the
contract to work as a developer experiences it: install SDK, log in, create a
document, tail a signed event.

If I started over, I would build the drill earlier and let it drive naming,
errors, and SDK ergonomics from day one.

### Where did you cut scope, and how did you decide?

I kept the smallest version that still deserves to be called a platform:
OAuth, scoped public API, generated spec, SDK, signed webhooks, CLI drill, and
developer visibility. I cut deeper production infrastructure: queue-backed
webhooks, Redis-backed rate limiting, full Slack/GitHub polish, and plugin
runtime.

The decision rule was: does this help a stranger complete the five-line loop? If
yes, it was core. If it only made the platform more enterprise-ready, it became
documented future work.

### What contract decision do you regret most?

The contract I would revisit first is the error code set. The MVP shape is good:
`{ code, message, details?, request_id }`. But the code enum is intentionally
small. Past Week 6, I would split some cases more precisely, especially OAuth
errors versus general auth errors and webhook delivery errors versus validation
errors.

It matters because SDK users switch on error kinds. If the server is too vague,
the SDK either hides important distinctions or leaks raw details.

### Walk through a bug the TTFE drill caught that unit tests missed.

The kind of bug TTFE catches is cross-boundary drift. Unit tests can pass for
OAuth, documents, webhooks, and the SDK separately, while the actual loop fails
because one stage changed shape: a token is not persisted, a cursor leaks into
consumer code, a webhook secret is not returned once, or a signature helper is
called with transformed JSON instead of the raw body.

The discipline change was to treat the drill as the contract test, not just a
demo. Unit tests prove pieces. The drill proves composition. After that, every
public API change has to answer: does the five-line story still work?

## Short Closing Answer

My north star was not "how many endpoints can Ship expose?" It was "how quickly
can an outside developer create a useful loop?" That is why OAuth, scopes,
generated OpenAPI, the SDK, signed webhooks, and the CLI drill are all connected.
They are separate pieces, but they serve one contract: a stranger can integrate
with Ship and trust what happens.
