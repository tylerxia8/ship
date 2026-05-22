# =============================================================================
# Outputs for downstream consumers (CI/CD, smoke tests, the security probe).
# =============================================================================

output "web_url" {
  description = "Vercel-hosted web frontend URL."
  value       = "https://${vercel_project_domain.web.domain}"
}

output "api_url" {
  description = "Render-hosted API URL."
  # render_web_service.url already includes the https:// scheme.
  value = render_web_service.api.url
}

output "verify_prod_command" {
  description = "Drop-in command to verify Cat 8 protections against this deploy."
  value = format(
    "node shipshape/security/verify-prod.mjs --api=%s --web=https://%s",
    render_web_service.api.url,
    vercel_project_domain.web.domain,
  )
}

output "neon_project_id" {
  description = "Neon project ID for branch/restore operations."
  value       = neon_project.ship.id
}

output "database_url" {
  description = "Postgres connection string (sensitive)."
  value       = local.database_url
  sensitive   = true
}
