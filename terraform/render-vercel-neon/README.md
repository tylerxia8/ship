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

## Runtime verification — `terraform init` + `terraform validate` clean on 2026-05-22

After the static-verification pass, I installed Terraform 1.15.4 via a streaming binary download and ran the full init + validate cycle. **Both passed.**

```
$ terraform init
Initializing provider plugins ...
- Installed render-oss/render v1.8.0   (within ~> 1.4)
- Installed vercel/vercel v2.15.1      (within ~> 2.0)
- Installed kislerdm/neon v0.13.0      (within ~> 0.6)
- Installed hashicorp/random v3.9.0    (within ~> 3.6)
Terraform has been successfully initialized!

$ terraform validate
Success! The configuration is valid.
```

The committed [.terraform.lock.hcl](.terraform.lock.hcl) pins the verified provider versions and their package hashes so subsequent `terraform init` runs use the exact same providers (or fail loudly if they're tampered with).

### One leaf-attribute fix landed during validate

The validate pass surfaced exactly one of the three attributes the README previously flagged: `neon_branch.endpoint` does not exist on `kislerdm/neon v0.13.0`. Inspecting the actual provider schema revealed that **`neon_project` itself exports `connection_uri`** directly — no need to assemble the URL from role + branch attributes.

Fix landed in `main.tf`:

```diff
- locals {
-   database_url = format(
-     "postgresql://%s:%s@%s/%s?sslmode=require",
-     neon_role.app.name,
-     neon_role.app.password,
-     neon_branch.main.endpoint, # ← did not exist
-     neon_database.ship.name,
-   )
- }
+ locals {
+   database_url = neon_project.ship.connection_uri  # ← canonical attribute
+ }
```

Simpler AND correct.

### The other two attributes flagged in the earlier hedge

| Attribute | Status | Notes |
|---|---|---|
| `neon_branch.endpoint` | ✅ Resolved (use `neon_project.connection_uri`) | This commit. |
| `render_web_service.url` | ✅ Still works as written — `render-oss/render v1.8.0` exposes `url` on `render_web_service` | Validate pass confirms. |
| `vercel_project.environment` | ✅ Still works as written — `vercel/vercel v2.15.1` accepts the list-of-objects shape used | Validate pass confirms. |

### What `validate` still doesn't guarantee

`terraform validate` checks configuration validity (attribute names, type compatibility, reference graph) but does NOT actually call the provider APIs. The next step — `terraform plan` against real provider credentials — would catch any runtime issues (auth, region availability, name collisions). That requires the user to supply credentials.

When you `terraform init` for the first time, expect to potentially adjust:

- **`neon_branch.endpoint`** — the connection-host attribute name may be `connection_uri`, `endpoint`, or `endpoints[0].host` depending on provider version. Inspect `terraform state show neon_branch.main` after the first apply and adjust [main.tf:60](main.tf#L60) accordingly.
- **`render_web_service.url`** — Render's provider exposes the service URL as either `url` or `service_details[0].url`. Adjust [outputs.tf:8](outputs.tf#L8) if `terraform plan` errors on the reference.
- **`vercel_project.environment`** — the env-var schema went through a list→set shape change across v1.x → v2.x. If `plan` errors on this, the registry docs at https://registry.terraform.io/providers/vercel/vercel/latest/docs/resources/project#environment will show the current shape.

These are surgical edits, not architectural rework. The provider blocks, resource graph, and `depends_on` order are correct; only the leaf attribute names may shift across provider versions.

## Secrets

**Never commit `*.tfvars`** populated with real credentials. The repo root [`.gitignore`](../../.gitignore) covers `*.tfvars` + `.terraform/`. In CI, prefer `TF_VAR_*` environment variables sourced from the CI provider's secret store.

If you're applying this from a workstation: use `terraform.tfvars` (gitignored), set restrictive file permissions, and run `terraform plan -lock-timeout=5m`.

After any `apply`, rotate the four credentials at quarterly cadence — see [terraform/render-vercel-neon/main.tf:30](main.tf#L30) for the session-secret rotation pattern via `random_id.keepers`.
