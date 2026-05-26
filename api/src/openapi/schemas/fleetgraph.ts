/**
 * FleetGraph schemas - project intelligence agent chat and findings.
 */

import { z, registry } from '../registry.js';
import { DateTimeSchema, UuidSchema } from './common.js';

export const FleetGraphConfidenceSchema = z.enum(['high', 'medium', 'low']).openapi({
  description: 'Agent confidence for a finding',
});

registry.register('FleetGraphConfidence', FleetGraphConfidenceSchema);

export const FleetGraphFindingStatusSchema = z.enum(['open', 'dismissed', 'snoozed', 'resolved']).openapi({
  description: 'Lifecycle state for a FleetGraph finding',
});

registry.register('FleetGraphFindingStatus', FleetGraphFindingStatusSchema);

export const FleetGraphFindingSchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema,
  scope_type: z.string(),
  scope_id: UuidSchema,
  finding_hash: z.string(),
  title: z.string(),
  body: z.string(),
  confidence: FleetGraphConfidenceSchema,
  citations: z.array(z.string()),
  suggested_actions: z.array(z.record(z.unknown())),
  status: FleetGraphFindingStatusSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
  last_seen_at: DateTimeSchema,
}).openapi('FleetGraphFinding');

registry.register('FleetGraphFinding', FleetGraphFindingSchema);

export const CreateFleetGraphFindingSchema = z.object({
  scopeType: z.string(),
  scopeId: UuidSchema,
  findingHash: z.string(),
  title: z.string(),
  body: z.string(),
  confidence: FleetGraphConfidenceSchema,
  citations: z.array(z.string()).default([]),
  suggestedActions: z.array(z.record(z.unknown())).default([]),
}).openapi('CreateFleetGraphFinding');

registry.register('CreateFleetGraphFinding', CreateFleetGraphFindingSchema);

export const FleetGraphScanRequestSchema = z.object({
  scopeType: z.enum(['issue', 'sprint', 'program', 'project', 'person', 'workspace']),
  scopeId: UuidSchema,
  threadId: z.string().optional(),
}).openapi('FleetGraphScanRequest');

registry.register('FleetGraphScanRequest', FleetGraphScanRequestSchema);

export const FleetGraphScanResponseSchema = z.object({
  ok: z.literal(true),
  threadId: z.string(),
  output: z.object({
    kind: z.enum(['chat', 'notification']),
    text: z.string(),
    citations: z.array(z.string()),
  }).optional(),
  intent: z.object({
    kind: z.string(),
    confidence: FleetGraphConfidenceSchema,
  }).optional(),
  reasoning: z.object({
    confidence: FleetGraphConfidenceSchema,
    findingHash: z.string(),
    citations: z.array(z.string()),
    suggestedActions: z.array(z.record(z.unknown())),
  }).optional(),
  elapsed_ms: z.number(),
}).openapi('FleetGraphScanResponse');

registry.register('FleetGraphScanResponse', FleetGraphScanResponseSchema);

export const FleetGraphFindingsResponseSchema = z.object({
  findings: z.array(FleetGraphFindingSchema.extend({
    scope_title: z.string().optional(),
    scope_document_type: z.string().optional(),
  })),
  total: z.number().int(),
}).openapi('FleetGraphFindingsResponse');

registry.register('FleetGraphFindingsResponse', FleetGraphFindingsResponseSchema);

registry.registerPath({
  method: 'post',
  path: '/fleetgraph/scan',
  tags: ['FleetGraph'],
  summary: 'Run a manual FleetGraph proactive scan',
  description: 'Runs the FleetGraph proactive graph once for the provided scope and persists a finding when warranted.',
  request: {
    body: {
      content: {
        'application/json': { schema: FleetGraphScanRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Scan completed',
      content: { 'application/json': { schema: FleetGraphScanResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/fleetgraph/findings',
  tags: ['FleetGraph'],
  summary: 'List FleetGraph findings',
  description: 'Returns durable FleetGraph findings for the authenticated workspace.',
  request: {
    query: z.object({
      status: z.enum(['open', 'dismissed', 'snoozed', 'resolved', 'all']).optional(),
    }),
  },
  responses: {
    200: {
      description: 'FleetGraph findings',
      content: { 'application/json': { schema: FleetGraphFindingsResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/fleetgraph/findings',
  tags: ['FleetGraph'],
  summary: 'Create or refresh a FleetGraph finding',
  description: 'Used by the FleetGraph agent service to persist proactive findings. Requires a service-account bearer token.',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateFleetGraphFindingSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Finding persisted',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            finding: FleetGraphFindingSchema,
          }),
        },
      },
    },
    403: {
      description: 'Only the FleetGraph agent service account can create findings',
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/fleetgraph/findings/{id}',
  tags: ['FleetGraph'],
  summary: 'Update FleetGraph finding status',
  request: {
    params: z.object({ id: UuidSchema }),
    body: {
      content: {
        'application/json': {
          schema: z.object({ status: FleetGraphFindingStatusSchema }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Finding updated',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            finding: FleetGraphFindingSchema,
          }),
        },
      },
    },
  },
});
