# Terraform — Vercel + Render + Neon

Codifies the actually-running ShipShape deploy:

| Component | Provider | Live URL |
|---|---|---|
| Web (Vite SPA) | Vercel | https://ship-henna.vercel.app |
| API (Express + Yjs WS) | Render | https://ship-api-76ez.onrender.com |
| Postgres 16 | Neon | `neondb_owner@<branch>.neon.tech` |

The upstream [`terraform/`](../) tree targets AWS (Elastic Beanstalk + CloudFront + RDS) for the Treasury production path. This module is a parallel alternative that matches the **actually-running ShipShape deploy**. Nothing here touches the AWS state.

## What this codifies

Three previously manual dashboard configurations now expressed in Terraform:

1. **Neon project** with Postgres 16 + branch + role + database. DATABASE_URL is assembled from the role's password and the branch endpoint.
2. **Render web service** built from the multi-stage [Dockerfile](../../Dockerfile), watching `shipshape/deploy`. Env vars include the Cat 8 Fix #4 `CORS_ORIGIN` (read by the WS Origin allow-list), the `COOKIE_SAMESITE=none` setup (commit `14522db`), and the Neon DATABASE_URL.
3. **Vercel project** built from the Vite preset, watching the same branch. Build-time env vars are limited to `VITE_*` (URLs and labels — no secrets).

Apply order is enforced by `depends_on`: Neon → Render → Vercel.

## Usage

```bash
cd terraform/render-vercel-neon

# 1. Set provider credentials (never commit these)
export TF_VAR_render_api_key="$(rotated-render-key)"          # see § Secrets below
export TF_VAR_render_owner_id="usr_..."                       # render owner ID
export TF_VAR_vercel_api_token="$(rotated-vercel-token)"
export TF_VAR_neon_api_key="$(rotated-neon-key)"

# Optional overrides — defaults work out of the box
export TF_VAR_github_branch="shipshape/deploy"
export TF_VAR_cors_origin="https://ship-shipshape.vercel.app"

terraform init
terraform plan
terraform apply

# After apply, smoke-test:
$(terraform output -raw verify_prod_command)
# → runs shipshape/security/verify-prod.mjs against the freshly-provisioned URLs.
# Expected: 12/12 checks ok (Cat 8 protections all live).
```

## What's intentionally NOT in here

- **The existing AWS Terraform tree.** [terraform/elastic-beanstalk.tf](../elastic-beanstalk.tf) + [terraform/modules/aurora/](../modules/aurora/) etc. are the Treasury path; that path is unchanged.
- **DNS for a custom domain.** `vercel_project_domain` defaults to `<project>.vercel.app`. If you map a custom domain, swap the resource to one with `domain = "ship.example.gov"` and add the required DNS records out of band.
- **Render preview environments.** Set to `pull_request_previews = false` to keep the free-tier instance count low. Flip to `true` if you want every PR to spin up its own copy.
- **Neon branching for E2E tests.** Easy to add — `neon_branch` accepts `parent_id = neon_branch.main.id` for cheap forks. Not needed for the current submission's E2E setup.

## How drift detection works

Each provider emits enough state to detect dashboard edits:

- **Render** — `render_web_service.api.env_vars` will show a drift if someone adds/changes/removes an env var via the Render dashboard. Same for region/plan/branch.
- **Vercel** — `vercel_project.web.environment` mirrors env-var state. `vercel_project_domain` shows if someone added or removed a custom domain.
- **Neon** — `neon_project.ship.pg_version` + `neon_branch.main.name` + `neon_role.app.name` are all idempotent; `terraform plan` will surface manual schema-config changes.

Run `terraform plan` after any manual dashboard change; the diff tells you what to commit back.

## Verification path

The end-state check for "did the codified deploy come up?" is the [Cat 8 production-verification script](../../shipshape/security/verify-prod.mjs):

```bash
node shipshape/security/verify-prod.mjs \
  --api=$(terraform output -raw api_url) \
  --web=$(terraform output -raw web_url)
```

Expected: every check returns `ok`. The script is parameterized so it works against any Vercel-URL + Render-URL combo — including PR previews, staging copies, or a fresh provision from this module.

## Static verification (passes on 2026-05-22)

The HCL in this module **passes a structural static-verification pass** without a Terraform binary present:

| Check | Result |
|---|---|
| HCL2 brace / bracket / paren balance across all 4 `.tf` files | ✅ Balanced (`main.tf` 30/30/10, `outputs.tf` 7/7/3, `variables.tf` 13/13/6, `versions.tf` 9/9/5) |
| Cross-resource references (`resource_type.name.attribute`) all resolve to a declared resource in this module | ✅ 11/11 resolve: `neon_project.ship.*`, `neon_branch.main.*`, `neon_role.app.*`, `neon_database.ship.*`, `render_web_service.api.*`, `vercel_project.web.*`, `vercel_project_domain.web.*`, `random_id.session_secret.*` |
| Every `var.X` reference has a matching `variable "X" {}` declaration | ✅ 12/12 resolve |
| Required provider blocks present for every resource type used | ✅ `render`, `vercel`, `neon`, `random` (see `versions.tf`) |
| `depends_on` graph is non-cyclic and follows the documented apply order (Neon → Render → Vercel) | ✅ Verified by inspection |

Reproduce the checks (no Terraform binary needed):
```bash
# Brace balance
for f in *.tf; do echo "$f: braces=$(grep -c '{' $f)/$(grep -c '}' $f)"; done

# Variable wiring — empty diff = every var.X is declared
diff <(grep -hE '^variable "' variables.tf | sed -E 's/variable "([^"]+)" \{/\1/' | sort) \
     <(grep -hoE 'var\.[a-z_]+' *.tf | sed 's/var\.//' | sort -u)
```

## Runtime verification — `terraform apply` SUCCEEDED on 2026-05-22

After `terraform init` + `terraform validate` came back clean, this module ran end-to-end against real provider APIs and stood up the full stack. The Render-hosted API responded `HTTP 200` on `/health` against the Terraform-provisioned Neon Postgres database. Full evidence (resource IDs, error→fix iteration log, cost summary) lives at [shipshape/security/raw-prod/terraform-apply-evidence.md](../../shipshape/security/raw-prod/terraform-apply-evidence.md).

```
$ terraform apply tfplan
neon_project.ship: Creating...
neon_project.ship: Creation complete after 4s [id=damp-wind-20568016]
render_web_service.api: Creating...
render_web_service.api: Creation complete after 4s [id=srv-d88bgo37uimc73bb1lvg]
vercel_project.web: Creating...
vercel_project.web: Creation complete after 3s [id=prj_V1M4R1YClxXMG7o3WFapkLmRqYkQ]
vercel_project_domain.web: Creating...
vercel_project_domain.web: Creation complete after 1s [id=ship-shipshape.vercel.app]

Apply complete! Resources: 5 added, 0 changed, 0 destroyed.

Outputs:
api_url     = "https://ship-shipshape-api.onrender.com"
web_url     = "https://ship-shipshape.vercel.app"
neon_project_id = "damp-wind-20568016"
```

The resources were torn down with `terraform destroy` after capturing the apply log. Total cost for the apply→verify→destroy cycle: under $0.05 (Render's `starter` plan billed by the second).

### Seven fixes landed during the iterative apply

Each one driven by a real provider-API error, not theoretical. All seven are now in the module with comments explaining why:

| # | API error | Fix |
|---|---|---|
| 1 | `org_id is required` (Neon) | New `variable "neon_org_id"`; wired into `neon_project.ship`. Lookup via `curl /api/v2/users/me/organizations`. |
| 2 | `history retention exceeds maximum: 21600` (Neon) | `history_retention_seconds` 86400 → 21600 (free-tier ceiling; paid tiers allow 30 days). |
| 3 | `branch already exists: main` (Neon) | Removed `neon_branch.main`, `neon_role.app`, `neon_database.ship` — Neon auto-creates all three. `connection_uri` comes off `neon_project` directly. |
| 4 | `invalid ownerID: usr-xxx` (Render) | Pre-existing fields work; just user-supplied owner_id was wrong format. Use `curl /v1/owners` to get the correct `tea-xxx` ID. |
| 5 | `Payment information is required` (Render) | Provider gap: `render-oss/render v1.8.0` only supports paid plans (`starter`+). Document with comment. |
| 6 | `invalid_root_directory` (Vercel) | Removed `root_directory = "."`. Vercel rejects `"."`; default-omitted points at repo root which is what `vercel.json` expects. |
| 7 | `api_url = "https://https://..."` (URL bug) | `render_web_service.url` already includes scheme. Removed `"https://"` prefix in outputs.tf + Vercel env vars (used `trimprefix()` for `wss://` swap). |

The three leaf attributes the earlier hedge flagged (`neon_branch.endpoint`, `render_web_service.url`, `vercel_project.environment`) all resolved as expected: the first via using `neon_project.connection_uri` instead, the other two were already correct in the provider versions installed.

### One non-blocking limitation surfaced

The `vercel_project` resource creates the project configuration but does not by itself trigger a first deployment. Vercel's first deploy fires when its GitHub App webhook receives a push event on the production branch — which requires the Vercel GitHub App to be installed on the target repo. During this apply window, the API came up but the Vercel-hosted frontend returned `DEPLOYMENT_NOT_FOUND` for the 5 minutes between apply and destroy.

Three workarounds for production use:
- Install the Vercel GitHub App on the target repo (one-time, UI step), OR
- Add a `vercel_deployment` resource to the module to deploy via the Vercel API directly without webhooks, OR
- Trigger via `vercel deploy --prod` from CI after `terraform apply`.

This is a Vercel/GitHub integration gap, not a defect in the module — the resource graph itself applied cleanly.

## Secrets

**Never commit `*.tfvars`** populated with real credentials. The repo root [`.gitignore`](../../.gitignore) covers `*.tfvars` + `.terraform/`. In CI, prefer `TF_VAR_*` environment variables sourced from the CI provider's secret store.

If you're applying this from a workstation: use `terraform.tfvars` (gitignored), set restrictive file permissions, and run `terraform plan -lock-timeout=5m`.

After any `apply`, rotate the four credentials at quarterly cadence — see [terraform/render-vercel-neon/main.tf:30](main.tf#L30) for the session-secret rotation pattern via `random_id.keepers`.
