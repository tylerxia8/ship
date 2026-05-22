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
  name                      = var.project_name
  region_id                 = var.neon_region
  pg_version                = 16
  history_retention_seconds = 86400 # 1 day point-in-time-restore window
}

resource "neon_branch" "main" {
  project_id = neon_project.ship.id
  name       = "main"
}

resource "neon_role" "app" {
  project_id = neon_project.ship.id
  branch_id  = neon_branch.main.id
  name       = "neondb_owner"
}

resource "neon_database" "ship" {
  project_id = neon_project.ship.id
  branch_id  = neon_branch.main.id
  name       = "neondb"
  owner_name = neon_role.app.name
}

# Neon emits the connection string from the role's password + branch endpoint.
# We assemble DATABASE_URL the same way the Neon console does.
locals {
  database_url = format(
    "postgresql://%s:%s@%s/%s?sslmode=require",
    neon_role.app.name,
    neon_role.app.password,
    neon_branch.main.endpoint, # branch host:port — provider-derived
    neon_database.ship.name,
  )
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

  depends_on = [
    neon_role.app,
    neon_database.ship,
  ]
}

# ─── Vercel: web frontend (Vite SPA) ──────────────────────────────────────────

resource "vercel_project" "web" {
  name      = "${var.project_name}-web"
  framework = "vite"

  # Vite outputs to web/dist; Vercel's vite preset reads vercel.json at the
  # repo root for any overrides (see commit 5dc95ad for the VITE_API_URL
  # env-clearing fix).
  root_directory = "."

  git_repository = {
    type              = "github"
    repo              = var.github_repo
    production_branch = var.github_branch
  }

  # Build-time env vars baked into the Vite bundle. Vite only inlines
  # VITE_*-prefixed vars (Cat 8 secrets-in-client-bundle check verifies
  # this); these are URLs and labels, NOT secrets.
  environment = [
    {
      key    = "VITE_API_URL"
      value  = "https://${render_web_service.api.url}"
      target = ["production", "preview"]
    },
    {
      key    = "VITE_WS_URL"
      value  = "wss://${render_web_service.api.url}"
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
