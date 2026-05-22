# =============================================================================
# Provider pins for the Vercel + Render + Neon deployment.
#
# The upstream terraform/ tree targets AWS (Elastic Beanstalk + CloudFront +
# RDS) per the original Treasury infrastructure. This module is a parallel
# alternative for the actually-running ShipShape deploy:
#
#   web  → Vercel (https://ship-henna.vercel.app)
#   api  → Render (https://ship-api-76ez.onrender.com)
#   db   → Neon   (neondb_owner @ Postgres 16, serverless branching)
#
# These three providers can be initialized side-by-side; nothing in this
# module touches the existing AWS state.
# =============================================================================

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    # https://registry.terraform.io/providers/render-oss/render/latest
    render = {
      source  = "render-oss/render"
      version = "~> 1.4"
    }
    # https://registry.terraform.io/providers/vercel/vercel/latest
    vercel = {
      source  = "vercel/vercel"
      version = "~> 2.0"
    }
    # https://registry.terraform.io/providers/kislerdm/neon/latest
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.6"
    }
    # https://registry.terraform.io/providers/hashicorp/random/latest
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "render" {
  # API token from https://dashboard.render.com/account/api-keys
  # Set via TF_VAR_render_api_key or via render.tfvars (gitignored).
  api_key  = var.render_api_key
  owner_id = var.render_owner_id
}

provider "vercel" {
  # API token from https://vercel.com/account/tokens
  api_token = var.vercel_api_token
  team      = var.vercel_team_id # optional; null for personal account
}

provider "neon" {
  # API key from https://console.neon.tech/app/settings/api-keys
  api_key = var.neon_api_key
}
