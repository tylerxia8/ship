import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { publicOpenApiDocument } from './openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '../../..');

function readRepo(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('Plugforge platform fitness checks', () => {
  it('keeps public platform routes from importing internal Express route handlers', () => {
    const platformRouteFiles = [
      'api/src/platform/api-v1.ts',
      'api/src/platform/routes/apps.ts',
      'api/src/platform/routes/documents.ts',
      'api/src/platform/routes/me.ts',
      'api/src/platform/routes/oauth.ts',
      'api/src/platform/routes/webhooks.ts',
    ];

    for (const file of platformRouteFiles) {
      const source = readRepo(file);
      expect(source, `${relative(repoRoot, join(repoRoot, file))} must not import api/src/routes`).not.toMatch(/from ['"](?:\.\.\/)+routes\//);
    }
  });

  it('keeps public OpenAPI paths paired with SDK client methods', () => {
    const documentsClient = readRepo('sdk/src/documents.ts');
    const webhooksClient = readRepo('sdk/src/webhook-client.ts');
    const paths = publicOpenApiDocument.paths;

    expect(paths['/documents'].get['x-required-scope']).toBe('documents:read');
    expect(documentsClient).toContain('list(');

    expect(paths['/documents/{id}'].get['x-required-scope']).toBe('documents:read');
    expect(documentsClient).toContain('get(');

    expect(paths['/documents'].post['x-required-scope']).toBe('documents:write');
    expect(documentsClient).toContain('create(');

    expect(paths['/webhooks/subscriptions'].get['x-required-scope']).toBe('webhooks:manage');
    expect(webhooksClient).toContain('listSubscriptions(');

    expect(paths['/webhooks/subscriptions'].post['x-required-scope']).toBe('webhooks:manage');
    expect(webhooksClient).toContain('createSubscription(');

    expect(paths['/webhooks/deliveries'].get['x-required-scope']).toBe('webhooks:manage');
    expect(webhooksClient).toContain('listDeliveries(');

    expect(paths['/webhooks/deliveries/{id}/replay'].post['x-required-scope']).toBe('webhooks:manage');
    expect(webhooksClient).toContain('replayDelivery(');
  });
});
