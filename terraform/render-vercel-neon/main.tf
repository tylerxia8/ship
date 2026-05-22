# =============================================================================
# Vercel + Render + Neon — codified live deploy.
#
# This Terraform replaces the manual dashboard clicking that originally stood
# up ship-henna.vercel.app + ship-api-76ez.onrender.com + the Neon project.
# Apply order is enforced by `depends_on`: Neon → Render → Vercel.
#
# Why this order matters:
#   1. Neon must exist first so we can derive DATABASE_URL.
#   2. Render needs DATABASE_URL to build/migrate the API.
#   3. Vercel needs VITE_API_URL pointing at the Render service.
#
# All three providers expose drift detection — `terraform plan` after a
# dashboard edit shows what changed.
# =============================================================================

locals {
  # Generate a session secret only if the input is empty. This keeps the
  # plan idempotent across applies.
  session_secret_final = (
    var.session_secret != ""
    ? var.session_secret
    : random_id.session_secret.hex
  )
}

resource "random_id" "session_secret" {
  # 32 bytes → 64 hex chars; matches what `openssl rand -hex 32` produces.
  byte_length = 32
  # Rotate by tainting this resource explicitly — never on every apply.
  keepers = {
    # Add fields here to force rotation, e.g. quarter = "2026Q3"
  }
}

# ─── Neon: Postgres 16 project + main branch + role + database ─────────────────

resource "neon_project" "ship" {
  name       = var.project_name
  org_id     = var.neon_org_id
  region_id  = var.neon_region
  pg_version = 16

  # Free tier caps point-in-time-restore at 6 hours (21600s). Paid tiers
  # allow up to 30 days. Stay at the free-tier ceiling so this module works
  # against any account; bump to 86400 (1d) or higher on a paid tier.
  history_retention_seconds = 21600
}

# Neon auto-creates a "main" branch, a "neondb_owner" role, and a "neondb"
# database when neon_project is created — declaring those as Terraform
# resources would 409 ("already exists"). Instead we just read the
# connection URI directly off neon_project, which embeds host + role +
# password + db_name. Verified against kislerdm/neon v0.13.0 schema via
# `terraform providers schema -json` — neon_project exports `connection_uri`,
# `database_host`, `database_password`, etc.
locals {
  database_url = neon_project.ship.connection_uri
}

# ─── Render: web service for the Express API ──────────────────────────────────

resource "render_web_service" "api" {
  name   = "${var.project_name}-api"
  region = var.render_region
  plan   = "starter" # free-tier on Render's classic plan tree
  # Build directly from the GitHub repo + branch. Render polls the branch
  # head and rebuilds on every push (same as the manual dashboard config
  # backing https://ship-api-76ez.onrender.com today).
  runtime_source = {
    docker = {
      branch                = var.github_branch
      repo_url              = "https://github.com/${var.github_repo}"
      dockerfile_path       = "./Dockerfile"
      docker_context        = "./"
      auto_deploy           = true # redeploy on push (verified live as of dbad63a)
      pull_request_previews = false
    }
  }
  health_check_path = "/health"

  env_vars = {
    NODE_ENV = { value = "production" }
    PORT     = { value = "8080" }

    # Derived from the Neon resources above.
    DATABASE_URL = { value = local.database_url }

    # Sensitive — Render encrypts at rest.
    SESSION_SECRET = { value = local.session_secret_final }

    # Cat 8 Fix #4: WS Origin allow-list reads CORS_ORIGIN. Setting this to
    # the Vercel project URL keeps the WS handshake working in prod.
    CORS_ORIGIN = { value = var.cors_origin }

    # Cross-origin cookie setup (commit 14522db on shipshape/deploy):
    # SameSite=None + Secure are required when web (Vercel) and api (Render)
    # are on different origins.
    COOKIE_SAMESITE = { value = "none" }
  }

  depends_on = [neon_project.ship]
}

# ─── Vercel: web frontend (Vite SPA) ──────────────────────────────────────────

resource "vercel_project" "web" {
  name      = "${var.project_name}-web"
  framework = "vite"

  # Default Vercel project creation enables "standard_protection", which puts
  # the deployment behind a Vercel-account auth wall. For a public demo URL
  # (and to match the existing ship-henna.vercel.app behavior, which is
  # publicly accessible), set this to "none".
  vercel_authentication = {
    deployment_type = "none"
  }

  # Vite outputs to web/dist; vercel.json at the repo root handles the build
  # command + output directory (see commit 5dc95ad for the VITE_API_URL
  # env-clearing fix). Vercel rejects root_directory = "." with
  # invalid_root_directory; omitting the field defaults to repo root, which
  # is what we want.

  git_repository = {
    type              = "github"
    repo              = var.github_repo
    production_branch = var.github_branch
  }

  # Build-time env vars baked into the Vite bundle. Vite only inlines
  # VITE_*-prefixed vars (Cat 8 secrets-in-client-bundle check verifies
  # this); these are URLs and labels, NOT secrets.
  # render_web_service.url already includes the https:// scheme.
  environment = [
    {
      key    = "VITE_API_URL"
      value  = render_web_service.api.url
      target = ["production", "preview"]
    },
    {
      key    = "VITE_WS_URL"
      value  = "wss://${trimprefix(render_web_service.api.url, "https://")}"
      target = ["production", "preview"]
    },
    {
      key    = "VITE_APP_ENV"
      value  = "production"
      target = ["production"]
    },
  ]

  depends_on = [render_web_service.api]
}

resource "vercel_project_domain" "web" {
  # Vercel auto-provisions <project>.vercel.app; override here only if a
  # custom domain is mapped. Left as the default project domain to mirror
  # what's live today (ship-henna.vercel.app).
  project_id = vercel_project.web.id
  domain     = "${var.project_name}.vercel.app"
}
