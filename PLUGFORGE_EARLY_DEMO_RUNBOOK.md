# Plugforge Early Submission Demo Runbook

Use this for the early-submission recording. Target length: 3-5 minutes.

## Before Recording

Open these tabs:

1. `PLUGFORGE_EARLY_SUBMISSION.md`
2. `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
3. `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
4. `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
5. `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`
6. GitHub Actions run for the latest PlugForge Drill:
   `https://github.com/tylerxia8/ship/actions/runs/26963501333`
7. A terminal in `c:\Users\tyler\ship`

Keep credentials private while recording. If login is needed, sign in before
starting the screen capture or crop the password field.

## Terminal Prep

Run these before recording so slow setup does not eat the video:

```powershell
corepack.cmd pnpm plugforge:live-smoke
corepack.cmd pnpm plugforge:proof-gate
```

Keep the successful output visible or ready in terminal history.

## Recording Flow

### 1. Opening

Say:

> This is the Ship Plugforge early submission. The goal was to turn Ship from a
> first-party app into a small developer platform: OAuth apps, scoped public
> APIs, generated OpenAPI, a typed SDK, signed webhooks, and a developer portal.

Show `PLUGFORGE_EARLY_SUBMISSION.md`.

Say:

> This file is the reviewer entry point. It links the live app, OpenAPI, scope
> registry, webhook event registry, and the concrete proof IDs from the live
> deployment.

### 2. Developer Portal

Switch to the Developer Portal.

Say:

> Here is the developer portal. A workspace admin can register OAuth apps, see
> the client ID, request scopes, rotate secrets, manage subscriptions, and review
> webhook delivery and audit evidence. Raw secrets are shown once and are not
> recoverable from the database.

Show:

- The registered Plugforge app.
- The app scopes.
- Any visible webhook subscription, delivery, or audit sections.

### 3. Public Contract

Switch to `/api/v1/openapi.json`.

Say:

> The public API contract is served live at `/api/v1/openapi.json`. It is
> generated from route metadata, not hand-written. The fitness tests validate the
> OpenAPI schema and check route, scope, error, pagination, and SDK parity.

Switch to `/api/v1/scopes`.

Say:

> Scopes are data. The public middleware asks for named scopes like
> `documents:read`, `documents:write`, and `webhooks:manage`; insufficient-scope
> errors name the missing scope explicitly.

Switch to `/api/v1/webhooks/events`.

Say:

> Webhook event types are also data. Document writes publish through the domain
> event bus and produce signed `document.created` deliveries.

### 4. Five-Line Developer Story

Show `PLUGFORGE_FIVE_LINE_STORY.md` or say:

> The developer story compresses to five lines: install the SDK, log in with the
> CLI, create a document, tail webhooks, and receive a verified
> `document.created` event.

Optional visual:

```text
pnpm install @ship/sdk
ship login
ship docs create --title "hello"
ship webhooks tail
document.created event arrives, signature verified
```

Say:

> The CI drill is the scripted version of this loop.

### 5. Proof Commands

Switch to terminal and run or show:

```powershell
corepack.cmd pnpm plugforge:live-smoke
corepack.cmd pnpm plugforge:proof-gate
```

Say:

> The live smoke proves the deployed endpoints are reachable. The proof gate is
> the growth edge I added after feedback: it checks that evidence files,
> reviewer links, proof scripts, CI drill settings, final-check evidence, and
> the latest successful GitHub Actions drill all line up with the current branch
> tip.

### 6. CI Proof

Switch to GitHub Actions run `26963501333`.

Say:

> This GitHub Actions run passed on the latest Plugforge commit. It runs the
> Time-to-First-Event drill and the 20-run flake drill, then uploads proof
> artifacts. That means the demo path is not just a screen recording; it is
> backed by repeatable CI evidence.

### 7. Closing

Say:

> The early submission is intentionally small but complete: OAuth app
> registration, scoped public resources, generated contract, SDK and CLI access,
> signed webhooks, delivery observability, and a repeatable proof gate. The main
> lesson from the feedback was to turn working demos into behavior backed by
> tests, enforcement, and evidence. That is now part of the project.

## If Something Breaks During Recording

- If the portal is slow, switch to `PLUGFORGE_EARLY_SUBMISSION.md` and use the
  captured proof IDs.
- If terminal commands are slow, show the previously successful output and the
  GitHub Actions run.
- Do not show raw secrets, bearer tokens, or passwords.
