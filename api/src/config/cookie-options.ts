/**
 * Shared cookie options for session/CSRF/auth cookies.
 *
 * SameSite default is 'strict' for same-origin prod (Treasury) and dev. When
 * the web is on a different origin than the api (reviewer deploy: Vercel +
 * Render), SameSite must be 'none' for the browser to send cookies on
 * cross-origin requests. Browsers require Secure=true alongside SameSite=none,
 * which is satisfied in production.
 *
 * Set COOKIE_SAMESITE=none in the API environment for cross-origin deploys.
 */
export function getCookieSameSite(): 'strict' | 'lax' | 'none' {
  const val = process.env.COOKIE_SAMESITE;
  if (val === 'none' || val === 'lax' || val === 'strict') return val;
  return 'strict';
}
