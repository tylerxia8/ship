import crypto from 'crypto';
import { test, expect, Page } from './fixtures/isolated-env';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
}

test.describe('Plugforge OAuth', () => {
  test('completes Authorization Code + PKCE through browser consent', async ({ page, apiServer }) => {
    await login(page);

    const csrfResponse = await page.request.get(`${apiServer.url}/api/csrf-token`);
    expect(csrfResponse.ok()).toBe(true);
    const { token: csrfToken } = await csrfResponse.json();

    const appResponse = await page.request.post(`${apiServer.url}/api/v1/oauth/apps`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        name: 'Plugforge Playwright PKCE App',
        redirect_uris: ['https://example.com/callback'],
        requested_scopes: ['documents:read'],
      },
    });
    expect(appResponse.status()).toBe(201);
    const appBody = await appResponse.json();
    expect(appBody.app.client_id).toMatch(/^ship_app_/);
    expect(appBody.client_secret).toMatch(/^ship_sk_/);
    expect(appBody.app.client_secret_hash).toBeUndefined();

    const verifier = `pw-${crypto.randomBytes(32).toString('base64url')}`;
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const authorizeUrl = new URL(`${apiServer.url}/oauth/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', appBody.app.client_id);
    authorizeUrl.searchParams.set('redirect_uri', 'https://example.com/callback');
    authorizeUrl.searchParams.set('scope', 'documents:read');
    authorizeUrl.searchParams.set('state', 'playwright-pkce');
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    await page.goto(authorizeUrl.toString());
    await expect(page.getByRole('heading', { name: /authorize/i })).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.waitForURL(/https:\/\/example\.com\/callback\?/);

    const redirect = new URL(page.url());
    expect(redirect.searchParams.get('state')).toBe('playwright-pkce');
    const code = redirect.searchParams.get('code');
    expect(code).toMatch(/^ship_code_/);

    const tokenResponse = await page.request.post(`${apiServer.url}/oauth/token`, {
      data: {
        grant_type: 'authorization_code',
        client_id: appBody.app.client_id,
        client_secret: appBody.client_secret,
        code,
        redirect_uri: 'https://example.com/callback',
        code_verifier: verifier,
      },
    });
    expect(tokenResponse.status()).toBe(200);
    const tokenBody = await tokenResponse.json();
    expect(tokenBody.access_token).toMatch(/^ship_at_/);

    const meResponse = await page.request.get(`${apiServer.url}/api/v1/me`, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    });
    expect(meResponse.status()).toBe(200);
    const meBody = await meResponse.json();
    expect(meBody.user.email).toBe('dev@ship.local');
    expect(meBody.app.client_id).toBe(appBody.app.client_id);
    expect(meBody.app.scopes).toEqual(['documents:read']);
  });
});
