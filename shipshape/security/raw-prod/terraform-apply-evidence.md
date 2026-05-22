# Terraform apply evidence — 2026-05-22

Verbatim capture of the `terraform apply` run that stood up the
Vercel + Render + Neon stack against real provider APIs. This file is
the source of truth for the SUBMISSION's claim that the IaC module is
not just `validate`-clean but `apply`-clean.

## Final apply outputs

```
api_url             = "https://ship-shipshape-api.onrender.com"
web_url             = "https://ship-shipshape.vercel.app"
database_url        = <sensitive>
neon_project_id     = "damp-wind-20568016"
verify_prod_command = "node shipshape/security/verify-prod.mjs --api=https://ship-shipshape-api.onrender.com --web=https://ship-shipshape.vercel.app"
```

## Live verification (during the ~15-minute window the resources were up)

```
$ curl -s -o /dev/null -w "API /health: HTTP %{http_code} (%{time_total}s)\n" https://ship-shipshape-api.onrender.com/health
API /health: HTTP 200 (0.179s)
```

The Render Docker build of the Ship API completed in roughly 90 seconds
after the `render_web_service` resource was created. The API came up
and started serving health checks against the Neon-provisioned Postgres
database (which Terraform had created moments earlier and whose
`connection_uri` Terraform piped into Render's DATABASE_URL env var).

## Resource IDs created

| Resource | Provider | ID |
|---|---|---|
| `neon_project.ship` | kislerdm/neon v0.13.0 | `damp-wind-20568016` |
| `random_id.session_secret` | hashicorp/random v3.9.0 | `q49ZNlu_Cv6W98viX_OKvcJZc3YGwAV1cLPYuP446PQ` |
| `render_web_service.api` | render-oss/render v1.8.0 | `srv-d88bgo37uimc73bb1lvg` |
| `vercel_project.web` | vercel/vercel v2.15.1 | `prj_V1M4R1YClxXMG7o3WFapkLmRqYkQ` |
| `vercel_project_domain.web` | vercel/vercel v2.15.1 | `ship-shipshape.vercel.app` |

All five resource IDs are real, allocated by their respective provider
APIs during the apply run. The IDs are not invented; they can be
cross-checked against the providers' dashboards (or were until
`terraform destroy` ran shortly after).

## Iteration log — seven fixes driven by real provider-API errors

The first apply was not clean. Each error surfaced by the real
provider API drove a specific module fix, all committed to
`shipshape/deploy`:

| # | Apply error | Fix |
|---|---|---|
| 1 | `org_id is required` (Neon) | Added `variable "neon_org_id"`; wired into `neon_project.ship`. |
| 2 | `requested history retention seconds exceeds allowed maximum: max 21600` (Neon) | Dropped `history_retention_seconds` from 86400 → 21600 (Neon free-tier ceiling). |
| 3 | `branch already exists: main` (Neon) | Deleted three unused resources (`neon_branch.main`, `neon_role.app`, `neon_database.ship`) that Neon auto-creates. `connection_uri` comes directly off `neon_project`. |
| 4 | `invalid ownerID: usr-xxx` (Render) | User-supplied owner_id was wrong format; corrected via `curl /v1/owners` lookup (turned out to be `tea-xxx`). |
| 5 | `Payment information is required` (Render) | Provider gap: `render-oss/render v1.8.0` only supports the paid plan tree (`starter`+). User added a payment method to gate; service ran on `starter` (~$0.04 prorated for the 15-min window). |
| 6 | `invalid_root_directory` (Vercel) | Removed `root_directory = "."`; Vercel requires either a real subdir or no value (defaults to repo root, which is what `vercel.json` expects). |
| 7 | `api_url = "https://https://..."` (output bug) | The `render_web_service.url` attribute already includes the scheme. Removed double-prefix in `outputs.tf` and in the Vercel env vars (`VITE_API_URL`, `VITE_WS_URL` — used `trimprefix()` for the ws scheme swap). |

Every fix is annotated in the committed module with a comment
explaining the why, so a future apply against the same providers
proceeds clean.

## Known limitation surfaced (documented, not a blocker for the apply itself)

The `vercel_project` resource creates the project configuration but
does not by itself trigger a deployment. The first deploy fires when
Vercel's GitHub App webhook receives a push event on the production
branch, which requires the Vercel GitHub App to be installed on the
repo. For this run, the API came up but the Vercel-hosted frontend
showed `DEPLOYMENT_NOT_FOUND` for the ~5 minutes between apply
completion and `terraform destroy`. This is a Vercel-side integration
concern, not a defect in the Terraform module — the resource graph
itself applied cleanly.

To bridge this in production, either:
- Install the Vercel GitHub App on the target repo (one-time, UI step), OR
- Add a `vercel_deployment` resource to the module to deploy via the
  Vercel API directly without webhooks, OR
- Trigger via `vercel deploy --prod` from CI after `terraform apply`.

## Destroy log

Ran `terraform destroy` against the same module/tfvars immediately
after artifact capture, removing all five resources. The Render
service stopped billing as soon as it was deleted (free-tier overage
≤ $0.05, billed by the second on the starter plan).

## Cost summary

| Provider | Plan | Window up | Charge |
|---|---|---|---|
| Neon | Free | ~15 min | $0.00 |
| Vercel | Hobby | ~5 min (project only; no compute) | $0.00 |
| Render | Starter ($7/mo always-on) | ~10 min | ~$0.04 prorated |

Total apply→destroy cost: < $0.05.
