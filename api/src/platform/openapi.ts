import type { Request, Response } from 'express';

export const publicOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Ship Public API',
    version: '1.0.0',
    description: 'Versioned public API for OAuth apps and external Ship integrations.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
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
          event_type: { type: 'string', enum: ['document.created'] },
          target_url: { type: 'string', format: 'uri' },
          active: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/me': {
      get: {
        tags: ['Me'],
        summary: 'Get the authenticated public API user',
        'x-required-scope': null,
        responses: {
          '200': { description: 'Authenticated user and app context' },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/oauth/apps': {
      get: {
        tags: ['OAuth Apps'],
        summary: 'List OAuth apps for the current workspace admin',
        'x-required-scope': null,
        responses: {
          '200': { description: 'OAuth apps page' },
        },
      },
      post: {
        tags: ['OAuth Apps'],
        summary: 'Register an OAuth app',
        'x-required-scope': null,
        responses: {
          '201': { description: 'Created OAuth app with client secret shown once' },
        },
      },
    },
    '/oauth/apps/{id}/rotate-secret': {
      post: {
        tags: ['OAuth Apps'],
        summary: 'Rotate an OAuth app client secret',
        'x-required-scope': null,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Rotated OAuth app with client secret shown once' },
          '404': { description: 'OAuth app not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/oauth/apps/{id}/deactivate': {
      post: {
        tags: ['OAuth Apps'],
        summary: 'Deactivate an OAuth app',
        'x-required-scope': null,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Deactivated OAuth app' },
          '404': { description: 'OAuth app not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/documents': {
      get: {
        tags: ['Documents'],
        summary: 'List documents',
        'x-required-scope': 'documents:read',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Documents page', content: { 'application/json': { schema: { $ref: '#/components/schemas/PageOfDocuments' } } } },
        },
      },
      post: {
        tags: ['Documents'],
        summary: 'Create a document',
        'x-required-scope': 'documents:write',
        responses: {
          '201': { description: 'Created document' },
        },
      },
    },
    '/documents/{id}': {
      get: {
        tags: ['Documents'],
        summary: 'Get a document by id',
        'x-required-scope': 'documents:read',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Document' },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/webhooks/subscriptions': {
      get: {
        tags: ['Webhooks'],
        summary: 'List webhook subscriptions for the authenticated app',
        'x-required-scope': 'webhooks:manage',
        responses: {
          '200': { description: 'Webhook subscriptions page' },
        },
      },
      post: {
        tags: ['Webhooks'],
        summary: 'Create a webhook subscription',
        'x-required-scope': 'webhooks:manage',
        responses: {
          '201': { description: 'Created subscription with signing secret shown once' },
        },
      },
    },
    '/webhooks/subscriptions/{id}/rotate-secret': {
      post: {
        tags: ['Webhooks'],
        summary: 'Rotate a webhook subscription signing secret',
        'x-required-scope': 'webhooks:manage',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Rotated subscription with signing secret shown once' },
          '404': { description: 'Subscription not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/webhooks/subscriptions/{id}/deactivate': {
      post: {
        tags: ['Webhooks'],
        summary: 'Deactivate a webhook subscription',
        'x-required-scope': 'webhooks:manage',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Deactivated subscription' },
          '404': { description: 'Subscription not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/webhooks/deliveries': {
      get: {
        tags: ['Webhooks'],
        summary: 'List webhook delivery attempts for the authenticated app',
        'x-required-scope': 'webhooks:manage',
        responses: {
          '200': { description: 'Webhook delivery attempts page' },
        },
      },
    },
    '/webhooks/deliveries/{id}/replay': {
      post: {
        tags: ['Webhooks'],
        summary: 'Replay a webhook delivery',
        'x-required-scope': 'webhooks:manage',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '202': { description: 'Replay accepted' },
          '404': { description: 'Delivery not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
  },
} as const;

export function servePublicOpenApi(_req: Request, res: Response): void {
  res.setHeader('Content-Type', 'application/json');
  res.json(publicOpenApiDocument);
}
