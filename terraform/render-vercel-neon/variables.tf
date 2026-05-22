# =============================================================================
# Inputs for the Vercel + Render + Neon stack.
# Provider credentials are required; everything else has sensible defaults.
#
# Never commit a populated render.tfvars / .auto.tfvars to this repo — the
# repo's root .gitignore covers *.tfvars. Use TF_VAR_<name> env vars in CI.
# =============================================================================

# ---------- Provider credentials (required) ----------------------------------

variable "render_api_key" {
  description = "Render account API key. https://dashboard.render.com/account/api-keys"
  type        = string
  sensitive   = true
}

variable "render_owner_id" {
  description = "Render owner ID (team or user). Look up via `curl -H 'Authorization: Bearer $TOKEN' https://api.render.com/v1/owners`."
  type        = string
}

variable "vercel_api_token" {
  description = "Vercel personal access token. https://vercel.com/account/tokens"
  type        = string
  sensitive   = true
}

variable "vercel_team_id" {
  description = "Vercel team ID (null for personal account). https://vercel.com/account"
  type        = string
  default     = null
}

variable "neon_api_key" {
  description = "Neon API key. https://console.neon.tech/app/settings/api-keys"
  type        = string
  sensitive   = true
}

# ---------- Project / repo wiring --------------------------------------------

variable "project_name" {
  description = "Short slug used across providers (must be DNS-safe)."
  type        = string
  default     = "ship-shipshape"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "project_name must be lowercase alphanumeric + dashes."
  }
}

variable "github_repo" {
  description = "Repo to auto-deploy from. Format: owner/name."
  type        = string
  default     = "tylerxia8/ship"
}

variable "github_branch" {
  description = "Branch to auto-deploy. Both Render and Vercel watch this."
  type        = string
  default     = "shipshape/deploy"
}

# ---------- Region selection -------------------------------------------------

variable "render_region" {
  description = "Render region for the API service."
  type        = string
  default     = "oregon"
}

variable "neon_region" {
  description = "Neon Postgres region. Should ideally match render_region's continent for low latency."
  type        = string
  default     = "aws-us-west-2"
}

# ---------- Application secrets ----------------------------------------------

variable "session_secret" {
  description = "Express session secret. If empty, a random 64-char hex string is generated."
  type        = string
  sensitive   = true
  default     = ""
}

variable "cors_origin" {
  description = "Allowed CORS origin (also used by Cat 8 Fix #4's WS Origin allow-list). Should point at the Vercel deployment URL."
  type        = string
  default     = "https://ship-henna.vercel.app"
}
