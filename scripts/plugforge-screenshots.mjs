#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const shipUrl = (process.env.SHIP_URL || 'https://d2rr1fze9v095b.cloudfront.net').replace(/\/$/, '');
const outputDir = process.env.OUTPUT_DIR || 'docs/screenshots/plugforge';
const email = process.env.SHIP_DEMO_EMAIL;
const password = process.env.SHIP_DEMO_PASSWORD;
const publicOnly = process.argv.includes('--public-only');

function usage() {
  console.log(`Plugforge screenshots

Captures live screenshots for the Plugforge demo and social post. Public pages
are always captured. Developer Portal screenshots require demo credentials.

Optional:
  SHIP_URL             Default: https://d2rr1fze9v095b.cloudfront.net
  OUTPUT_DIR           Default: docs/screenshots/plugforge
  SHIP_DEMO_EMAIL      Browser login email for Developer Portal screenshots
  SHIP_DEMO_PASSWORD   Browser login password for Developer Portal screenshots
  --public-only        Skip authenticated Developer Portal screenshots

Examples:
  corepack.cmd pnpm plugforge:screenshots -- --public-only
  $env:SHIP_DEMO_EMAIL="..."
  $env:SHIP_DEMO_PASSWORD="..."
  corepack.cmd pnpm plugforge:screenshots
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });
const failedLoginPath = path.join(outputDir, 'developer-portal-login-failed.png');
if (existsSync(failedLoginPath)) {
  rmSync(failedLoginPath);
}

async function capture(page, name, url, options = {}) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  if (options.waitForText) {
    await page.getByText(options.waitForText, { exact: false }).waitFor({ state: 'visible', timeout: 15_000 });
  }
  await page.screenshot({ path: path.join(outputDir, name), fullPage: options.fullPage ?? true });
  return { name, url, ok: true };
}

async function login(page) {
  const csrfResponse = await page.request.get(`${shipUrl}/api/csrf-token`);
  if (!csrfResponse.ok()) {
    throw new Error(`Could not fetch CSRF token: ${csrfResponse.status()}`);
  }
  const csrfBody = await csrfResponse.json();
  const loginResponse = await page.request.post(`${shipUrl}/api/auth/login`, {
    data: { email, password },
    headers: { 'X-CSRF-Token': csrfBody.token },
  });
  if (!loginResponse.ok()) {
    throw new Error(`Login failed: ${loginResponse.status()}`);
  }
  await page.goto(`${shipUrl}/settings/developers`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.getByRole('heading', { name: 'Developer Portal' }).waitFor({ state: 'visible', timeout: 30_000 });
}

async function captureDeveloperPortal(page) {
  const captures = [];
  try {
    await login(page);
  } catch (err) {
    await page.screenshot({ path: failedLoginPath, fullPage: true });
    throw err;
  }
  await page.screenshot({ path: path.join(outputDir, 'developer-portal.png'), fullPage: true });
  captures.push({ name: 'developer-portal.png', url: `${shipUrl}/settings/developers`, ok: true });

  const viewDetails = page.getByRole('button', { name: 'View details' });
  if (await viewDetails.count() > 0) {
    await viewDetails.first().click();
    await page.getByText('API Activity', { exact: false }).waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByText('Loading app activity', { exact: false }).waitFor({ state: 'hidden', timeout: 15_000 });
    await page.screenshot({ path: path.join(outputDir, 'developer-portal-expanded-app.png'), fullPage: true });
    captures.push({ name: 'developer-portal-expanded-app.png', url: `${shipUrl}/settings/developers`, ok: true });
  }

  return captures;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const captured = [];
const skipped = [];
const retained = [];

try {
  captured.push(await capture(page, 'openapi-json.png', `${shipUrl}/api/v1/openapi.json`));
  captured.push(await capture(page, 'scopes-registry.png', `${shipUrl}/api/v1/scopes`));
  captured.push(await capture(page, 'webhook-events-registry.png', `${shipUrl}/api/v1/webhooks/events`));

  if (!publicOnly && email && password) {
    captured.push(...await captureDeveloperPortal(page));
  } else {
    skipped.push('Developer Portal screenshots require SHIP_DEMO_EMAIL and SHIP_DEMO_PASSWORD.');
    for (const name of ['developer-portal.png', 'developer-portal-expanded-app.png']) {
      if (existsSync(path.join(outputDir, name))) {
        retained.push({ name, reason: 'Existing authenticated screenshot retained from a previous credentialed capture.' });
      }
    }
  }
} finally {
  await browser.close();
}

const manifest = {
  generated_at: new Date().toISOString(),
  ship_url: shipUrl,
  output_dir: outputDir,
  captured,
  retained,
  skipped,
};

writeFileSync(
  path.join(outputDir, 'README.md'),
  `# Plugforge Screenshots

Generated: \`${manifest.generated_at}\`

Base URL: \`${shipUrl}\`

## Captured

${captured.map((item) => `- [${item.name}](./${item.name})`).join('\n')}

${retained.length ? `## Retained

${retained.map((item) => `- [${item.name}](./${item.name}) - ${item.reason}`).join('\n')}
` : ''}

${skipped.length ? `## Skipped

${skipped.map((item) => `- ${item}`).join('\n')}
` : ''}
`,
);
writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(JSON.stringify(manifest, null, 2));
