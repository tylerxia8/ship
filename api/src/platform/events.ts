import { z } from 'zod';
import { publishWebhookEvent } from './webhooks.js';
import type { PublicScope } from './scopes.js';

const baseEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  created_at: z.string().datetime(),
  data: z.record(z.unknown()),
});

export const WEBHOOK_EVENTS = [
  'document.created',
  'document.updated',
  'document.deleted',
  'issue.created',
  'issue.assigned',
  'issue.status_changed',
  'sprint.started',
  'sprint.completed',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENTS[number];

export const WebhookEventRegistry: Record<WebhookEventType, {
  type: WebhookEventType;
  description: string;
  required_scope: PublicScope;
  schema: z.ZodType<Record<string, unknown>>;
}> = {
  'document.created': {
    type: 'document.created',
    description: 'A document was created.',
    required_scope: 'documents:read',
    schema: baseEventSchema.extend({ type: z.literal('document.created') }),
  },
  'document.updated': {
    type: 'document.updated',
    description: 'A document was updated.',
    required_scope: 'documents:read',
    schema: baseEventSchema.extend({ type: z.literal('document.updated') }),
  },
  'document.deleted': {
    type: 'document.deleted',
    description: 'A document was deleted.',
    required_scope: 'documents:read',
    schema: baseEventSchema.extend({ type: z.literal('document.deleted') }),
  },
  'issue.created': {
    type: 'issue.created',
    description: 'An issue was created.',
    required_scope: 'issues:read',
    schema: baseEventSchema.extend({ type: z.literal('issue.created') }),
  },
  'issue.assigned': {
    type: 'issue.assigned',
    description: 'An issue assignee changed.',
    required_scope: 'issues:read',
    schema: baseEventSchema.extend({ type: z.literal('issue.assigned') }),
  },
  'issue.status_changed': {
    type: 'issue.status_changed',
    description: 'An issue status changed.',
    required_scope: 'issues:read',
    schema: baseEventSchema.extend({ type: z.literal('issue.status_changed') }),
  },
  'sprint.started': {
    type: 'sprint.started',
    description: 'A sprint started.',
    required_scope: 'sprints:read',
    schema: baseEventSchema.extend({ type: z.literal('sprint.started') }),
  },
  'sprint.completed': {
    type: 'sprint.completed',
    description: 'A sprint completed.',
    required_scope: 'sprints:read',
    schema: baseEventSchema.extend({ type: z.literal('sprint.completed') }),
  },
};

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  workspaceId: string;
  type: WebhookEventType;
  idempotencyKey: string;
  payload: TPayload;
}

export interface IEventBus {
  publish(event: DomainEvent): Promise<void>;
}

export class InProcessEventBus implements IEventBus {
  async publish(event: DomainEvent): Promise<void> {
    const definition = WebhookEventRegistry[event.type];
    definition.schema.parse(event.payload);
    await publishWebhookEvent({
      workspaceId: event.workspaceId,
      eventType: event.type,
      idempotencyKey: event.idempotencyKey,
      data: event.payload,
    });
  }
}

export interface EventQueue {
  enqueue(event: DomainEvent): Promise<void>;
}

export class QueueBackedEventBus implements IEventBus {
  constructor(private readonly queue: EventQueue) {}

  async publish(event: DomainEvent): Promise<void> {
    const definition = WebhookEventRegistry[event.type];
    definition.schema.parse(event.payload);
    await this.queue.enqueue(event);
  }
}

export const eventBus: IEventBus = new InProcessEventBus();

export function publicWebhookEventDefinitions(): Array<{
  type: WebhookEventType;
  description: string;
  required_scope: PublicScope;
}> {
  return WEBHOOK_EVENTS.map((eventType) => {
    const definition = WebhookEventRegistry[eventType];
    return {
      type: definition.type,
      description: definition.description,
      required_scope: definition.required_scope,
    };
  });
}
