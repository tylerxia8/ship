import { pool } from '../../db/client.js';
import { eventBus } from '../events.js';

export interface CreatePublicDocumentInput {
  workspaceId: string;
  userId: string;
  appId: string;
  clientId: string;
  documentType: string;
  title: string;
  content: unknown;
  properties: Record<string, unknown>;
}

export function publicDocument(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    document_type: row.document_type,
    title: row.title,
    content: row.content,
    properties: row.properties ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createPublicDocument(input: CreatePublicDocumentInput): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `INSERT INTO documents
      (workspace_id, document_type, title, content, properties, visibility, created_by)
     VALUES ($1, $2, $3, $4, $5, 'workspace', $6)
     RETURNING id, workspace_id, document_type, title, content, properties, created_at, updated_at`,
    [
      input.workspaceId,
      input.documentType,
      input.title,
      input.content,
      input.properties,
      input.userId,
    ],
  );

  const document = publicDocument(result.rows[0]);
  await eventBus.publish({
    workspaceId: input.workspaceId,
    type: 'document.created',
    idempotencyKey: `document.created:${document.id}`,
    payload: {
      id: `document.created:${document.id}`,
      type: 'document.created',
      created_at: new Date().toISOString(),
      data: {
        document,
        actor: {
          user_id: input.userId,
          app_id: input.appId,
          client_id: input.clientId,
        },
      },
    },
  });

  return document;
}
