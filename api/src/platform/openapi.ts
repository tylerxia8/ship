import type { Request, Response } from 'express';
import type { PublicScope } from './scopes.js';
import { WEBHOOK_EVENTS } from './events.js';

type HttpMethod = 'get' | 'post';
type RequiredScope = PublicScope | null;
type JsonObject = Record<string, unknown>;
type OpenApiDocument = {
  openapi: '3.1.0';
  info: JsonObject;
  servers: JsonObject[];
  components: JsonObject;
  security: JsonObject[];
  paths: Record<string, Partial<Record<HttpMethod, JsonObject>>>;
};

interface PublicRouteMetadata {
  path: string;
  method: HttpMethod;
  tags: string[];
  summary: string;
  requiredScope: RequiredScope;
  security?: JsonObject[];
  parameters?: JsonObject[];
  responses: JsonObject;
}

const apiErrorResponse = {
  description: 'Public API error',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
};

const notFoundResponse = {
  description: 'Not found',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
};

const uuidPathParam = (name = 'id') => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
});

const documentPageResponse = {
  description: 'Documents page',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/PageOfDocuments' } } },
};

const scopePageResponse = {
  description: 'Public scope registry',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/PageOfScopes' } } },
};

const webhookEventPageResponse = {
  description: 'Webhook event registry',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/PageOfWebhookEvents' } } },
};

export const publicRouteMetadata: PublicRouteMetadata[] = [
  {
    path: '/me',
    method: 'get',
    tags: ['Me'],
    summary: 'Get the authenticated public API user',
    requiredScope: null,
    responses: {
      '200': { description: 'Authenticated user and app context' },
      '401': apiErrorResponse,
    },
  },
  {
    path: '/scopes',
    method: 'get',
    tags: ['Scopes'],
    summary: 'List public API scopes',
    requiredScope: null,
    security: [],
    responses: { '200': scopePageResponse },
  },
  {
    path: '/oauth/apps',
    method: 'get',
    tags: ['OAuth Apps'],
    summary: 'List OAuth apps for the current workspace admin',
    requiredScope: null,
    responses: { '200': { description: 'OAuth apps page' }, '401': apiErrorResponse, '403': apiErrorResponse },
  },
  {
    path: '/oauth/apps',
    method: 'post',
    tags: ['OAuth Apps'],
    summary: 'Register an OAuth app',
    requiredScope: null,
    responses: {
      '201': { description: 'Created OAuth app with client secret shown once' },
      '400': apiErrorResponse,
      '401': apiErrorResponse,
      '403': apiErrorResponse,
    },
  },
  {
    path: '/oauth/apps/{id}/rotate-secret',
    method: 'post',
    tags: ['OAuth Apps'],
    summary: 'Rotate an OAuth app client secret',
    requiredScope: null,
    parameters: [uuidPathParam()],
    responses: {
      '200': { description: 'Rotated OAuth app with client secret shown once' },
      '401': apiErrorResponse,
      '403': apiErrorResponse,
      '404': notFoundResponse,
    },
  },
  {
    path: '/oauth/apps/{id}/deactivate',
    method: 'post',
    tags: ['OAuth Apps'],
    summary: 'Deactivate an OAuth app',
    requiredScope: null,
    parameters: [uuidPathParam()],
    responses: {
      '200': { description: 'Deactivated OAuth app' },
      '401': apiErrorResponse,
      '403': apiErrorResponse,
      '404': notFoundResponse,
    },
  },
  {
    path: '/oauth/apps/{id}/audit',
    method: 'get',
    tags: ['OAuth Apps'],
    summary: 'List public API audit rows for an OAuth app',
    requiredScope: null,
    parameters: [uuidPathParam()],
    responses: { '200': { description: 'Public API audit rows for the app' }, '404': notFoundResponse },
  },
  {
    path: '/oauth/apps/{id}/webhook-subscriptions',
    method: 'get',
    tags: ['OAuth Apps'],
    summary: 'List webhook subscriptions for an OAuth app in the Developer Portal',
    requiredScope: null,
    parameters: [uuidPathParam()],
    responses: { '200': { description: 'Webhook subscriptions for the app' }, '404': notFoundResponse },
  },
  {
    path: '/oauth/apps/{id}/webhook-deliveries',
    method: 'get',
    tags: ['OAuth Apps'],
    summary: 'List webhook delivery attempts for an OAuth app in the Developer Portal',
    requiredScope: null,
    parameters: [uuidPathParam()],
    responses: { '200': { description: 'Webhook delivery attempts for the app' }, '404': notFoundResponse },
  },
  {
    path: '/oauth/apps/{id}/webhook-deliveries/{deliveryId}/replay',
    method: 'post',
    tags: ['OAuth Apps'],
    summary: 'Replay a webhook delivery from the Developer Portal',
    requiredScope: null,
    parameters: [uuidPathParam(), uuidPathParam('deliveryId')],
    responses: { '202': { description: 'Replay accepted' }, '404': notFoundResponse },
  },
  {
    path: '/oauth/apps/{id}/webhook-subscriptions/{subscriptionId}/test',
    method: 'post',
    tags: ['OAuth Apps'],
    summary: 'Send a test webhook event for a subscription from the Developer Portal',
    requiredScope: null,
    parameters: [uuidPathParam(), uuidPathParam('subscriptionId')],
    responses: { '202': { description: 'Test delivery attempted' }, '404': notFoundResponse },
  },
  {
    path: '/documents',
    method: 'get',
    tags: ['Documents'],
    summary: 'List documents',
    requiredScope: 'documents:read',
    parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
      { name: 'cursor', in: 'query', schema: { type: 'string' } },
      { name: 'type', in: 'query', schema: { type: 'string' } },
    ],
    responses: { '200': documentPageResponse, '400': apiErrorResponse, '401': apiErrorResponse, '403': apiErrorResponse },
  },
  {
    path: '/documents',
    method: 'post',
    tags: ['Documents'],
    summary: 'Create a document',
    requiredScope: 'documents:write',
    responses: {
      '201': { description: 'Created document' },
      '400': apiErrorResponse,
      '401': apiErrorResponse,
      '403': apiErrorResponse,
    },
  },
  {
    path: '/documents/{id}',
    method: 'get',
    tags: ['Documents'],
    summary: 'Get a document by id',
    requiredScope: 'documents:read',
    parameters: [uuidPathParam()],
    responses: { '200': { description: 'Document' }, '401': apiErrorResponse, '403': apiErrorResponse, '404': notFoundResponse },
  },
  {
    path: '/issues',
    method: 'get',
    tags: ['Issues'],
    summary: 'List issues',
    requiredScope: 'issues:read',
    parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
      { name: 'cursor', in: 'query', schema: { type: 'string' } },
    ],
    responses: { '200': documentPageResponse, '400': apiErrorResponse, '401': apiErrorResponse, '403': apiErrorResponse },
  },
  {
    path: '/issues',
    method: 'post',
    tags: ['Issues'],
    summary: 'Create an issue',
    requiredScope: 'issues:write',
    responses: {
      '201': { description: 'Created issue' },
      '400': apiErrorResponse,
      '401': apiErrorResponse,
      '403': apiErrorResponse,
    },
  },
  {
    path: '/issues/{id}',
    method: 'get',
    tags: ['Issues'],
    summary: 'Get an issue by id',
    requiredScope: 'issues:read',
    parameters: [uuidPathParam()],
    responses: { '200': { description: 'Issue' }, '401': apiErrorResponse, '403': apiErrorResponse, '404': notFoundResponse },
  },
  {
    path: '/sprints',
    method: 'get',
    tags: ['Sprints'],
    summary: 'List sprints',
    requiredScope: 'sprints:read',
    parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
      { name: 'cursor', in: 'query', schema: { type: 'string' } },
    ],
    responses: { '200': documentPageResponse, '400': apiErrorResponse, '401': apiErrorResponse, '403': apiErrorResponse },
  },
  {
    path: '/sprints',
    method: 'post',
    tags: ['Sprints'],
    summary: 'Create a sprint',
    requiredScope: 'sprints:write',
    responses: {
      '201': { description: 'Created sprint' },
      '400': apiErrorResponse,
      '401': apiErrorResponse,
      '403': apiErrorResponse,
    },
  },
  {
    path: '/sprints/{id}',
    method: 'get',
    tags: ['Sprints'],
    summary: 'Get a sprint by id',
    requiredScope: 'sprints:read',
    parameters: [uuidPathParam()],
    responses: { '200': { description: 'Sprint' }, '401': apiErrorResponse, '403': apiErrorResponse, '404': notFoundResponse },
  },
  {
    path: '/webhooks/subscriptions',
    method: 'get',
    tags: ['Webhooks'],
    summary: 'List webhook subscriptions for the authenticated app',
    requiredScope: 'webhooks:manage',
    responses: { '200': { description: 'Webhook subscriptions page' }, '401': apiErrorResponse, '403': apiErrorResponse },
  },
  {
    path: '/webhooks/subscriptions',
    method: 'post',
    tags: ['Webhooks'],
    summary: 'Create a webhook subscription',
    requiredScope: 'webhooks:manage',
    responses: {
      '201': { description: 'Created subscription with signing secret shown once' },
      '400': apiErrorResponse,
      '401': apiErrorResponse,
      '403': apiErrorResponse,
    },
  },
  {
    path: '/webhooks/events',
    method: 'get',
    tags: ['Webhooks'],
    summary: 'List webhook event types',
    requiredScope: null,
    security: [],
    responses: { '200': webhookEventPageResponse },
  },
  {
    path: '/webhooks/subscriptions/{id}/rotate-secret',
    method: 'post',
    tags: ['Webhooks'],
    summary: 'Rotate a webhook subscription signing secret',
    requiredScope: 'webhooks:manage',
    parameters: [uuidPathParam()],
    responses: { '200': { description: 'Rotated subscription with signing secret shown once' }, '404': notFoundResponse },
  },
  {
    path: '/webhooks/subscriptions/{id}/deactivate',
    method: 'post',
    tags: ['Webhooks'],
    summary: 'Deactivate a webhook subscription',
    requiredScope: 'webhooks:manage',
    parameters: [uuidPathParam()],
    responses: { '200': { description: 'Deactivated subscription' }, '404': notFoundResponse },
  },
  {
    path: '/webhooks/deliveries',
    method: 'get',
    tags: ['Webhooks'],
    summary: 'List webhook delivery attempts for the authenticated app',
    requiredScope: 'webhooks:manage',
    responses: { '200': { description: 'Webhook delivery attempts page' } },
  },
  {
    path: '/webhooks/deliveries/{id}/replay',
    method: 'post',
    tags: ['Webhooks'],
    summary: 'Replay a webhook delivery',
    requiredScope: 'webhooks:manage',
    parameters: [uuidPathParam()],
    responses: { '202': { description: 'Replay accepted' }, '404': notFoundResponse },
  },
];

const components = {
  securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer' },
  },
  headers: {
    XRateLimitLimit: {
      description: 'Request limit for the current rate-limit window.',
      schema: { type: 'integer' },
    },
    XRateLimitRemaining: {
      description: 'Requests remaining in the current rate-limit window.',
      schema: { type: 'integer' },
    },
    XRateLimitReset: {
      description: 'Unix timestamp when the current rate-limit window resets.',
      schema: { type: 'integer' },
    },
    RetryAfter: {
      description: 'Seconds to wait before retrying after a 429 response.',
      schema: { type: 'integer' },
    },
  },
  schemas: {
    ApiError: {
      type: 'object',
      required: ['code', 'message', 'request_id'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object' },
        request_id: { type: 'string' },
      },
    },
    PageOfDocuments: {
      type: 'object',
      required: ['data', 'next_cursor'],
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/Document' } },
        next_cursor: { type: ['string', 'null'] },
      },
    },
    ScopeDefinition: {
      type: 'object',
      required: ['name', 'description'],
      properties: {
        name: {
          type: 'string',
          enum: ['documents:read', 'documents:write', 'issues:read', 'issues:write', 'sprints:read', 'sprints:write', 'webhooks:manage'],
        },
        description: { type: 'string' },
      },
    },
    PageOfScopes: {
      type: 'object',
      required: ['data', 'next_cursor'],
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/ScopeDefinition' } },
        next_cursor: { type: ['string', 'null'] },
      },
    },
    Document: {
      type: 'object',
      required: ['id', 'workspace_id', 'document_type', 'title', 'properties', 'created_at', 'updated_at'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        workspace_id: { type: 'string', format: 'uuid' },
        document_type: { type: 'string' },
        title: { type: 'string' },
        content: {},
        properties: { type: 'object' },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },
    WebhookSubscription: {
      type: 'object',
      required: ['id', 'event_type', 'target_url', 'active', 'created_at', 'updated_at'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        event_type: { type: 'string', enum: WEBHOOK_EVENTS },
        target_url: { type: 'string', format: 'uri' },
        active: { type: 'boolean' },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },
    WebhookEventDefinition: {
      type: 'object',
      required: ['type', 'description', 'required_scope'],
      properties: {
        type: { type: 'string', enum: WEBHOOK_EVENTS },
        description: { type: 'string' },
        required_scope: {
          type: 'string',
          enum: ['documents:read', 'documents:write', 'issues:read', 'issues:write', 'sprints:read', 'sprints:write', 'webhooks:manage'],
        },
      },
    },
    PageOfWebhookEvents: {
      type: 'object',
      required: ['data', 'next_cursor'],
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/WebhookEventDefinition' } },
        next_cursor: { type: ['string', 'null'] },
      },
    },
  },
};

function withPublicResponseHeaders(responses: JsonObject): JsonObject {
  const responsesWithRateLimit = {
    ...responses,
    ...(responses['429'] ? {} : { '429': apiErrorResponse }),
  };

  return Object.fromEntries(Object.entries(responsesWithRateLimit).map(([status, response]) => {
    const responseObject = response && typeof response === 'object' && !Array.isArray(response)
      ? response as JsonObject
      : {};
    return [status, {
      ...responseObject,
      headers: {
        ...(responseObject.headers as JsonObject | undefined),
        'X-RateLimit-Limit': { $ref: '#/components/headers/XRateLimitLimit' },
        'X-RateLimit-Remaining': { $ref: '#/components/headers/XRateLimitRemaining' },
        'X-RateLimit-Reset': { $ref: '#/components/headers/XRateLimitReset' },
        ...(status === '429' ? { 'Retry-After': { $ref: '#/components/headers/RetryAfter' } } : {}),
      },
    }];
  }));
}

function openApiOperation(route: PublicRouteMetadata): JsonObject {
  return {
    tags: route.tags,
    summary: route.summary,
    'x-required-scope': route.requiredScope,
    ...(route.security ? { security: route.security } : {}),
    ...(route.parameters ? { parameters: route.parameters } : {}),
    responses: withPublicResponseHeaders(route.responses),
  };
}

function openApiPathsFromMetadata(routes: PublicRouteMetadata[]): OpenApiDocument['paths'] {
  const paths: OpenApiDocument['paths'] = {};
  for (const route of routes) {
    const pathItem = paths[route.path] ?? {};
    pathItem[route.method] = openApiOperation(route);
    paths[route.path] = pathItem;
  }
  return paths;
}

export function generatePublicOpenApiDocument(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Ship Public API',
      version: '1.0.0',
      description: 'Versioned public API for OAuth apps and external Ship integrations.',
    },
    servers: [{ url: '/api/v1' }],
    components,
    security: [{ bearerAuth: [] }],
    paths: openApiPathsFromMetadata(publicRouteMetadata),
  };
}

export const publicOpenApiDocument = generatePublicOpenApiDocument();

export function servePublicOpenApi(_req: Request, res: Response): void {
  res.setHeader('Content-Type', 'application/json');
  res.json(publicOpenApiDocument);
}
