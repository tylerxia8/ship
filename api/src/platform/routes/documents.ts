import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { publicBearerAuth } from '../auth.js';
import { ApiError } from '../errors.js';
import { requireScope } from '../scopes.js';
import { decodeCursor, encodeCursor } from '../pagination.js';
import { publishWebhookEvent } from '../webhooks.js';

const router = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  type: z.string().optional(),
});

const createDocumentSchema = z.object({
  title: z.string().min(1).max(255).default('Untitled'),
  document_type: z.enum(['wiki', 'issue', 'program', 'project', 'sprint', 'person', 'weekly_plan', 'weekly_retro']).default('wiki'),
  content: z.unknown().optional(),
  properties: z.record(z.unknown()).default({}),
});

function publicDocument(row: Record<string, unknown>): Record<string, unknown> {
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

router.get('/', publicBearerAuth, requireScope('documents:read'), async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid documents list query', {
        issues: parsed.error.flatten(),
      });
    }

    const auth = req.publicAuth!;
    const cursor = decodeCursor(parsed.data.cursor);
    const params: unknown[] = [auth.workspaceId, parsed.data.limit + 1];
    let where = `
      workspace_id = $1
      AND archived_at IS NULL
      AND deleted_at IS NULL
      AND visibility = 'workspace'
    `;

    if (parsed.data.type) {
      params.push(parsed.data.type);
      where += ` AND document_type = $${params.length}`;
    }

    if (cursor) {
      params.push(cursor.timestamp, cursor.id);
      where += ` AND (updated_at, id) < ($${params.length - 1}::timestamp, $${params.length}::uuid)`;
    }

    const result = await pool.query(
      `SELECT id, workspace_id, document_type, title, content, properties, created_at, updated_at
         FROM documents
        WHERE ${where}
        ORDER BY updated_at DESC, id DESC
        LIMIT $2`,
      params,
    );

    const rows = result.rows.slice(0, parsed.data.limit);
    const last = rows[rows.length - 1];
    const hasNext = result.rows.length > parsed.data.limit && last;

    res.json({
      data: rows.map(publicDocument),
      next_cursor: hasNext ? encodeCursor({ id: last.id, timestamp: last.updated_at.toISOString?.() ?? String(last.updated_at) }) : null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', publicBearerAuth, requireScope('documents:read'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, workspace_id, document_type, title, content, properties, created_at, updated_at
         FROM documents
        WHERE id = $1
          AND workspace_id = $2
          AND archived_at IS NULL
          AND deleted_at IS NULL
          AND visibility = 'workspace'`,
      [req.params.id, req.publicAuth!.workspaceId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError(404, 'not_found', 'Document not found');
    }

    res.json({ data: publicDocument(row) });
  } catch (err) {
    next(err);
  }
});

router.post('/', publicBearerAuth, requireScope('documents:write'), async (req, res, next) => {
  try {
    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid document create request', {
        issues: parsed.error.flatten(),
      });
    }

    const auth = req.publicAuth!;
    const result = await pool.query(
      `INSERT INTO documents
        (workspace_id, document_type, title, content, properties, visibility, created_by)
       VALUES ($1, $2, $3, $4, $5, 'workspace', $6)
       RETURNING id, workspace_id, document_type, title, content, properties, created_at, updated_at`,
      [
        auth.workspaceId,
        parsed.data.document_type,
        parsed.data.title,
        parsed.data.content ?? { type: 'doc', content: [] },
        parsed.data.properties,
        auth.userId,
      ],
    );

    const document = publicDocument(result.rows[0]);
    await publishWebhookEvent({
      workspaceId: auth.workspaceId,
      eventType: 'document.created',
      idempotencyKey: `document.created:${result.rows[0].id}`,
      data: {
        id: `document.created:${result.rows[0].id}`,
        type: 'document.created',
        created_at: new Date().toISOString(),
        data: {
          document,
          actor: {
            user_id: auth.userId,
            app_id: auth.appId,
            client_id: auth.clientId,
          },
        },
      },
    });

    res.status(201).json({ data: document });
  } catch (err) {
    next(err);
  }
});

export default router;
