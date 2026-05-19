# ShipShape — Railway Deployment Guide

Target: a publicly-accessible deploy of the ShipShape fork (`github.com/tylerxia8/ship`) with web, API, and Postgres on Railway. Estimated wall-clock: 30–45 min the first time.

This guide assumes you have a Railway account already (`railway.app` → sign in).

---

## Architecture on Railway

One Railway **project** contains three **services**:

| Service | Source | Role | Public? |
|---|---|---|---|
| `postgres` | Railway managed Postgres plugin | Database | No (internal network only) |
| `api` | This repo, root directory `api/` | Express server | Yes — `https://<project>-api.up.railway.app` |
| `web` | This repo, root directory `web/` | Vite static build | Yes — `https://<project>-web.up.railway.app` |

Postgres only exposes a `DATABASE_URL` env var to the API service over Railway's private network. The web build bakes the API public URL into the bundle at build time via `VITE_API_URL`.

---

## Branch to deploy

Deploy from the `shipshape/audit` branch **plus** all 7 improvement branches squash-merged into one **deploy** branch. Reason: Railway deploys from a single branch, but the brief asks reviewers to see the *combined* state of all improvements. The audit branch alone doesn't have the fixes.

```bash
# From your local fork:
git checkout shipshape/audit
git checkout -b shipshape/deploy

# Merge each improvement branch (no-ff so each merge is a single commit reviewers can identify).
# Skip 04b if you don't want to ship the functional indexes (low risk; recommended to include).
for b in shipshape/01-type-safety shipshape/02-bundle-size shipshape/03-api-perf shipshape/04-db-queries shipshape/04b-functional-indexes shipshape/05-test-coverage shipshape/06-runtime-errors shipshape/07-accessibility; do
  git merge --no-ff "$b" -m "merge $b into shipshape/deploy"
done

# Resolve any merge conflicts that arise — none are expected since branches are scoped,
# but the order matters if two branches touched the same file (e.g. dashboard.ts).

git push origin shipshape/deploy
```

If a merge conflicts, prefer the version from the later-numbered category branch (those are more recent fixes building on earlier ones). Type-safety must come first (Cat 1) because later branches rely on its stricter web tsconfig.

---

## Step 1 — Postgres plugin (2 min)

1. Open `railway.app` → **New Project** → name it `shipshape`.
2. **+ Create** → **Database** → **PostgreSQL**. Railway provisions Postgres 16 (or 17) — Ship works on 14+.
3. Click into the Postgres service → **Variables** tab. Confirm `DATABASE_URL` is set. Copy its value to verify it begins with `postgres://`.

---

## Step 2 — API service (10 min)

1. **+ Create** → **GitHub Repo** → select `tylerxia8/ship`. (If Railway doesn't see the repo, install the Railway GitHub app and grant it access.)
2. After Railway provisions the service, click **Settings**:
   - **Root Directory**: `api`
   - **Branch**: `shipshape/deploy`
   - **Build Command**: `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @ship/shared build && corepack pnpm --filter @ship/api build`
   - **Start Command**: `corepack pnpm --filter @ship/api exec node dist/db/migrate.js && corepack pnpm --filter @ship/api start`
     - The `&&` runs migrations on every boot. Migrations are idempotent (the `schema_migrations` table tracks state), so this is safe.
   - **Healthcheck Path**: `/health` (existing endpoint).
3. **Variables** tab — add:
   - `NODE_ENV` = `production`
   - `PORT` = `3000` (Railway will inject `$PORT` but the code falls back to 3000; setting explicit is clearer)
   - `DATABASE_URL` — click **Reference** → select the `postgres` service → choose `DATABASE_URL`. Railway creates an internal-network reference.
   - `CORS_ORIGIN` — leave blank for now. Set it in step 4 after the web service has a public URL.
   - `SESSION_SECRET` — generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste.
   - `SHIPSHAPE_AUDIT` — **do not set in prod.** This flag is only for measurement.
4. **Settings** → **Networking** → **Generate Domain**. Railway gives you `https://shipshape-api.up.railway.app` (or similar). Copy this URL.
5. Wait for the first deploy. Check **Logs** for `API server running on http://localhost:3000` and absence of migration errors.
6. Smoke test: `curl https://<api-domain>/health` should return `{"status":"ok"}`.

---

## Step 3 — Seed the database (5 min)

```bash
# From your local machine, with the Railway CLI installed:
corepack pnpm dlx @railway/cli login
corepack pnpm dlx @railway/cli link  # interactively pick the shipshape project

# Run the seed script against the production Postgres:
corepack pnpm dlx @railway/cli run --service api -- corepack pnpm --filter @ship/api db:seed
```

This populates the demo users (`dev@ship.local` / `admin123`, etc.) and ~250 documents. Verify by hitting `POST /api/auth/login` with `dev@ship.local` + `admin123` and watching for a `session_id` cookie in the response.

---

## Step 4 — Web service (10 min)

1. **+ Create** → **GitHub Repo** → same `tylerxia8/ship` repo, but it'll be a separate service.
2. **Settings**:
   - **Root Directory**: `web`
   - **Branch**: `shipshape/deploy`
   - **Build Command**: `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @ship/shared build && corepack pnpm --filter @ship/web build`
   - **Start Command**: `corepack pnpm dlx serve -s dist -l ${PORT:-8080}`
     - `serve` is a tiny static-file server. Vite outputs to `web/dist/`. The `-s` flag enables SPA mode (all routes fall back to `index.html` so React Router works).
3. **Variables** — these are **build-time** (Vite reads them at `vite build`, then bakes the value into the bundle):
   - `VITE_API_URL` = `https://<api-domain>` (from step 2.4)
4. **Settings** → **Networking** → **Generate Domain**. Copy the web URL.
5. Wait for the first deploy. Open the web URL in a browser. You should see the Ship login page.

---

## Step 5 — Wire CORS (2 min)

1. Back to the **api** service → **Variables**:
   - `CORS_ORIGIN` = the web URL from step 4.4.
2. Save. Railway will trigger a redeploy. Wait for green.

---

## Step 6 — End-to-end smoke test (5 min)

1. Open the web URL in a fresh browser session (incognito to avoid stale cookies).
2. Login as `dev@ship.local` / `admin123`.
3. Verify each of the seven changed flows still works:
   - **Cat 1 (type-safety)** — open `/dashboard`. If undefined-access bugs crept in, the page would blank with a console error. Should render.
   - **Cat 2 (bundle)** — DevTools Network tab. The initial JS payload should be ≈219 KB gz (vs. baseline 589 KB). Filter to `*.js` and read the gzipped size column.
   - **Cat 3 (perf)** — DevTools Network → check `/api/auth/me` initial latency. Should be ~50–100 ms on Railway's free tier (US East from a US client).
   - **Cat 4 (DB queries)** — Open `/my-week` and watch the Network tab. You should see exactly **2** queries land on `/api/dashboard/my-work` (not the prior 4). Actually it'll still be 1 HTTP request — the 4→2 change is in the SQL backing it. To verify, hit the `/api/dashboard/my-work` endpoint and confirm it returns workspace + issues + projects + sprints in one response payload.
   - **Cat 5 (tests)** — no runtime check; verified in CI / commit history.
   - **Cat 6 (runtime errors)** — try `curl -X POST -d "not json" -H "Content-Type: application/json" https://<api-domain>/api/issues` (with a valid auth cookie). Should return a JSON 400, not an HTML stack trace.
   - **Cat 7 (a11y)** — DevTools → Lighthouse → accessibility audit on `/my-week`. Should score 100.

---

## Step 7 — Update the submission with the live URL

```bash
# In docs:
git checkout shipshape/07-accessibility
# Replace the TBD placeholder in SUBMISSION.md (deliverables table row 7).
# Replace <deployed-railway-url> in demo-video-script.md.
# Replace github.com/tylerxia8/ship in the BODY of social-posts.md drafts with the live URL
# (keep the repo link in the comments/second-tier).
git commit -am "shipshape: live deploy URL in submission docs"
git push
```

Then cherry-pick this commit to every shipshape branch so the live URL is visible no matter which branch a reviewer checks out:

```bash
HASH=$(git rev-parse HEAD)
for b in shipshape/audit shipshape/01-type-safety shipshape/02-bundle-size shipshape/03-api-perf shipshape/04-db-queries shipshape/04b-functional-indexes shipshape/05-test-coverage shipshape/06-runtime-errors shipshape/deploy; do
  git checkout "$b"
  git cherry-pick "$HASH"
  git push origin "$b"
done
git checkout shipshape/07-accessibility
```

---

## Common issues

- **Build OOM on Railway's free tier (512 MB).** Web build can spike past 512 MB with the TipTap + Yjs dependency graph. Mitigation: upgrade to Railway's **Hobby** plan ($5/mo) for 8 GB build memory, or set `NODE_OPTIONS=--max-old-space-size=400` and accept slower builds. The fork's bundle is materially smaller after Cat 2 changes so this is unlikely to bite.
- **CORS errors after deploy.** Check `CORS_ORIGIN` on the api service — must be the **exact** web URL including `https://` and no trailing slash. The express-cors middleware does an exact-string match.
- **Postgres connection limits.** Railway's free-tier Postgres has 20 connection slots. The pg pool in `api/src/db/client.ts` uses `max=20` in prod (set in `02ed... commit`) — exactly at the limit. If you see `too many connections`, drop `max` to `15` for Railway specifically by adding `PG_POOL_MAX=15` env var and reading it in `client.ts` (one-line change). The audit measured prod max=20 against a local Postgres without connection limits.
- **Migrations fail with "permission denied" on Railway Postgres.** The Postgres plugin creates the `postgres` user as the owner; `api/src/db/migrate.ts` uses whatever user `DATABASE_URL` carries. Should just work — if it doesn't, check that `DATABASE_URL` was set via Reference, not pasted manually.
- **Web 404s on every route except `/`.** Means `serve -s` flag isn't set (SPA fallback off). Re-check the start command.
- **First request is slow (~3s).** Railway's free tier puts services to sleep after idle. Upgrade to Hobby ($5/mo) for always-on, or just warn reviewers the first hit is cold-start.

---

## Cost expectation

Free tier on Railway gives **$5/mo of credit**. Three services (Postgres + 2 Node services) at low traffic typically run **$3–$8/mo** combined. For a 5-day reviewer window the cost is essentially zero. Set a hard $10/mo budget cap in the Railway billing dashboard if you want belt-and-suspenders.

---

## Rollback plan

If something breaks after a redeploy:
- Railway → service → **Deployments** tab → click any prior deployment → **Redeploy**. Reverts to that exact commit's build artifact. Takes ~30 s.
- Alternatively, `git revert <bad-commit>` on `shipshape/deploy` and push. Railway auto-deploys.
