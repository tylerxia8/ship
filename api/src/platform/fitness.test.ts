import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { Validator } from '@seriousme/openapi-schema-validator';
import { publicOpenApiDocument, publicRouteMetadata } from './openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '../../..');
type HttpMethod = 'get' | 'post';

type SdkExpectation = {
  file: string;
  method: string;
};

const sdkExpectations: Record<string, SdkExpectation> = {
  'GET /me': { file: 'sdk/src/client.ts', method: 'me(' },
  'GET /scopes': { file: 'sdk/src/client.ts', method: 'scopes(' },
  'GET /oauth/apps': { file: 'sdk/src/oauth-apps.ts', method: 'list(' },
  'POST /oauth/apps': { file: 'sdk/src/oauth-apps.ts', method: 'create(' },
  'POST /oauth/apps/{id}/rotate-secret': { file: 'sdk/src/oauth-apps.ts', method: 'rotateSecret(' },
  'POST /oauth/apps/{id}/deactivate': { file: 'sdk/src/oauth-apps.ts', method: 'deactivate(' },
  'GET /oauth/apps/{id}/audit': { file: 'sdk/src/oauth-apps.ts', method: 'audit(' },
  'GET /oauth/apps/{id}/webhook-subscriptions': { file: 'sdk/src/oauth-apps.ts', method: 'webhookSubscriptions(' },
  'GET /oauth/apps/{id}/webhook-deliveries': { file: 'sdk/src/oauth-apps.ts', method: 'webhookDeliveries(' },
  'POST /oauth/apps/{id}/webhook-deliveries/{deliveryId}/replay': { file: 'sdk/src/oauth-apps.ts', method: 'replayWebhookDelivery(' },
  'POST /oauth/apps/{id}/webhook-subscriptions/{subscriptionId}/test': { file: 'sdk/src/oauth-apps.ts', method: 'sendWebhookTest(' },
  'GET /documents': { file: 'sdk/src/documents.ts', method: 'list(' },
  'POST /documents': { file: 'sdk/src/documents.ts', method: 'create(' },
  'GET /documents/{id}': { file: 'sdk/src/documents.ts', method: 'get(' },
  'GET /webhooks/subscriptions': { file: 'sdk/src/webhook-client.ts', method: 'listSubscriptions(' },
  'POST /webhooks/subscriptions': { file: 'sdk/src/webhook-client.ts', method: 'createSubscription(' },
  'GET /webhooks/events': { file: 'sdk/src/webhook-client.ts', method: 'listEvents(' },
  'POST /webhooks/subscriptions/{id}/rotate-secret': { file: 'sdk/src/webhook-client.ts', method: 'rotateSubscriptionSecret(' },
  'POST /webhooks/subscriptions/{id}/deactivate': { file: 'sdk/src/webhook-client.ts', method: 'deactivateSubscription(' },
  'GET /webhooks/deliveries': { file: 'sdk/src/webhook-client.ts', method: 'listDeliveries(' },
  'POST /webhooks/deliveries/{id}/replay': { file: 'sdk/src/webhook-client.ts', method: 'replayDelivery(' },
};

function readRepo(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function operation(path: string, method: 'get' | 'post'): Record<string, unknown> {
  const route = publicOpenApiDocument.paths[path]?.[method];
  expect(route, `${method.toUpperCase()} ${path} must exist in public OpenAPI`).toBeDefined();
  return route!;
}

function specOperations(): Array<{ path: string; method: HttpMethod; operation: Record<string, unknown> }> {
  return Object.entries(publicOpenApiDocument.paths).flatMap(([path, pathItem]) => (
    Object.entries(pathItem).map(([method, op]) => ({
      path,
      method: method as HttpMethod,
      operation: op as Record<string, unknown>,
    }))
  ));
}

function responseSchemaName(operationObject: Record<string, unknown>, status: string): string | undefined {
  const responses = operationObject.responses as Record<string, unknown> | undefined;
  const response = responses?.[status] as Record<string, unknown> | undefined;
  const content = response?.content as Record<string, unknown> | undefined;
  const json = content?.['application/json'] as Record<string, unknown> | undefined;
  const schema = json?.schema as Record<string, unknown> | undefined;
  const ref = schema?.$ref;
  return typeof ref === 'string' ? ref.split('/').pop() : undefined;
}

describe('Plugforge platform fitness checks', () => {
  it('keeps the generated OpenAPI artifact in sync with the public contract', () => {
    const generated = readRepo('docs/openapi.json');
    const expected = `${JSON.stringify(publicOpenApiDocument, null, 2)}\n`;

    expect(generated).toBe(expected);
  });

  it('generates public OpenAPI paths from route metadata', () => {
    const metadataOperations = new Set(
      publicRouteMetadata.map((route) => `${route.method.toUpperCase()} ${route.path}`),
    );
    const openApiOperations = new Set<string>();

    for (const [path, pathItem] of Object.entries(publicOpenApiDocument.paths)) {
      for (const method of Object.keys(pathItem)) {
        openApiOperations.add(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(openApiOperations).toEqual(metadataOperations);

    for (const route of publicRouteMetadata) {
      expect(operation(route.path, route.method)['x-required-scope']).toBe(route.requiredScope);
    }
  });

  it('enumerates every public route with scope metadata, error shapes, and list pagination', () => {
    const metadataOperations = new Map(
      publicRouteMetadata.map((route) => [`${route.method.toUpperCase()} ${route.path}`, route]),
    );

    for (const { path, method, operation: op } of specOperations()) {
      const key = `${method.toUpperCase()} ${path}`;
      const route = metadataOperations.get(key);
      expect(route, `${key} must have route metadata`).toBeDefined();
      expect(op, `${key} must declare x-required-scope, even when public`).toHaveProperty('x-required-scope');
      expect(op['x-required-scope']).toBe(route?.requiredScope ?? null);

      const responses = op.responses as Record<string, unknown>;
      const failureStatuses = Object.keys(responses).filter((status) => /^[45]\d\d$/.test(status));
      expect(failureStatuses.length, `${key} must document at least one public failure response`).toBeGreaterThan(0);
      for (const status of failureStatuses) {
        expect(responseSchemaName(op, status), `${key} ${status} must return ApiError`).toBe('ApiError');
      }

      const successSchema = responseSchemaName(op, '200');
      if (method === 'get' && successSchema === 'PageOfDocuments') {
        const parameters = op.parameters as Array<Record<string, unknown>> | undefined;
        expect(parameters?.some((param) => param.name === 'cursor'), `${key} must accept cursor`).toBe(true);
      }
    }
  });

  it('documents rate-limit headers on every public response', () => {
    for (const { path, method, operation: op } of specOperations()) {
      const key = `${method.toUpperCase()} ${path}`;
      const responses = op.responses as Record<string, Record<string, unknown>>;

      for (const [status, response] of Object.entries(responses)) {
        const headers = response.headers as Record<string, unknown> | undefined;
        expect(headers?.['X-RateLimit-Limit'], `${key} ${status} must declare X-RateLimit-Limit`).toBeDefined();
        expect(headers?.['X-RateLimit-Remaining'], `${key} ${status} must declare X-RateLimit-Remaining`).toBeDefined();
        expect(headers?.['X-RateLimit-Reset'], `${key} ${status} must declare X-RateLimit-Reset`).toBeDefined();
        if (status === '429') {
          expect(headers?.['Retry-After'], `${key} 429 must declare Retry-After`).toBeDefined();
        }
      }
    }
  });

  it('validates the public OpenAPI document against the OpenAPI schema', async () => {
    const validator = new Validator();
    const result = await validator.validate(publicOpenApiDocument);

    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(validator.version).toBe('3.1');
  });

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

  it('keeps webhook publication behind the domain event bus', () => {
    const documentsRoute = readRepo('api/src/platform/routes/documents.ts');
    const documentDomain = readRepo('api/src/platform/domain/documents.ts');
    const eventBus = readRepo('api/src/platform/events.ts');

    expect(documentsRoute).not.toContain('publishWebhookEvent');
    expect(documentsRoute).not.toContain('../webhooks');
    expect(documentDomain).toContain('eventBus.publish');
    expect(eventBus).toContain('interface IEventBus');
    expect(eventBus).toContain('class InProcessEventBus');
  });

  it('keeps public OpenAPI paths paired with SDK client methods', () => {
    const documentsClient = readRepo('sdk/src/documents.ts');
    const documentResources = readRepo('sdk/src/document-resources.ts');
    const webhooksClient = readRepo('sdk/src/webhook-client.ts');
    const oauthAppsClient = readRepo('sdk/src/oauth-apps.ts');
    const rootClient = readRepo('sdk/src/client.ts');
    const authClient = readRepo('sdk/src/auth.ts');
    const tokenStore = readRepo('sdk/src/token-store.ts');
    const sdkTypes = readRepo('sdk/src/types.ts');
    const sdkErrors = readRepo('sdk/src/errors.ts');
    const sdkWebhookVerifier = readRepo('sdk/src/webhooks.ts');
    const sourceCache = new Map<string, string>([
      ['sdk/src/client.ts', rootClient],
      ['sdk/src/documents.ts', documentsClient],
      ['sdk/src/oauth-apps.ts', oauthAppsClient],
      ['sdk/src/webhook-client.ts', webhooksClient],
    ]);
    for (const { path, method } of specOperations()) {
      const key = `${method.toUpperCase()} ${path}`;
      const expectation = sdkExpectations[key];
      expect(expectation, `${key} must have an SDK method expectation`).toBeDefined();
      if (!expectation) continue;
      const source = sourceCache.get(expectation.file) ?? readRepo(expectation.file);
      sourceCache.set(expectation.file, source);
      expect(source, `${key} must be represented by ${expectation.file}`).toContain(expectation.method);
    }

    expect(documentsClient).toContain('async *iterate');

    expect(rootClient).toContain('readonly issues: IssuesClient');
    expect(rootClient).toContain('readonly sprints: SprintsClient');
    expect(rootClient).toContain('static authorizationCodeFlow');
    expect(rootClient).toContain('static deviceLogin');
    expect(documentResources).toContain('class IssuesClient');
    expect(documentResources).toContain("type: 'issue'");
    expect(documentResources).toContain('class SprintsClient');
    expect(documentResources).toContain("type: params.type ?? 'sprint'");
    expect(authClient).toContain('code_challenge_method');
    expect(authClient).toContain('code_verifier');
    expect(tokenStore).toContain('class InMemoryTokenStore');
    expect(tokenStore).toContain('class FileTokenStore');
    expect(tokenStore).toContain('class BrowserLocalStorageTokenStore');
    expect(sdkTypes).toContain('interface ITokenStore');
    expect(sdkErrors).toContain('type ShipSDKErrorUnion');
    expect(sdkErrors).toContain("kind: 'rate_limit'");
    expect(sdkWebhookVerifier).toContain('export function verifyWebhook');
    expect(sdkWebhookVerifier).toContain('Math.abs(now - timestamp) > toleranceSec');
    expect(sdkWebhookVerifier).toContain('parts.v1');
    expect(sdkWebhookVerifier).toContain('timingSafeEqual');
  });
});
