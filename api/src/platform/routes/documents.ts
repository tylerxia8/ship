import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { publicBearerAuth } from '../auth.js';
import { ApiError } from '../errors.js';
import { requireScope } from '../scopes.js';
import { decodeCursor, encodeCursor } from '../pagination.js';
import { createPublicDocument, publicDocument } from '../domain/documents.js';
import type { PublicScope } from '../scopes.js';

type PublicDocumentResourceOptions = {
  fixedDocumentType?: string;
  listScope: PublicScope;
  writeScope: PublicScope;
  defaultDocumentType: 'wiki' | 'issue' | 'program' | 'project' | 'sprint' | 'person' | 'weekly_plan' | 'weekly_retro';
};

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

export function createPublicDocumentResourceRouter(options: PublicDocumentResourceOptions): Router {
  const router = Router();

  router.get('/', publicBearerAuth, requireScope(options.listScope), async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid documents list query', {
        issues: parsed.error.flatten(),
      });
    }

    const auth = req.publicAuth!;
    const cursor = decodeCursor(parsed.data.cursor);
    if (parsed.data.cursor && !cursor) {
      throw new ApiError(400, 'validation_failed', 'Invalid documents cursor');
    }

    const params: unknown[] = [auth.workspaceId, parsed.data.limit + 1];
    let where = `
      workspace_id = $1
      AND archived_at IS NULL
      AND deleted_at IS NULL
      AND visibility = 'workspace'
    `;

    const documentType = options.fixedDocumentType ?? parsed.data.type;
    if (documentType) {
      params.push(documentType);
      where += ` AND document_type = $${params.length}`;
    }

    if (cursor) {
      params.push(cursor.timestamp, cursor.id);
      where += ` AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }

    const result = await pool.query(
      `SELECT id, workspace_id, document_type, title, content, properties, created_at, updated_at
         FROM documents
        WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      params,
    );

    const rows = result.rows.slice(0, parsed.data.limit);
    const last = rows[rows.length - 1];
    const hasNext = result.rows.length > parsed.data.limit && last;

    res.json({
      data: rows.map(publicDocument),
      next_cursor: hasNext ? encodeCursor({ id: last.id, timestamp: last.created_at.toISOString?.() ?? String(last.created_at) }) : null,
    });
  } catch (err) {
    next(err);
  }
  });

  router.get('/:id', publicBearerAuth, requireScope(options.listScope), async (req, res, next) => {
  try {
    const params: unknown[] = [req.params.id, req.publicAuth!.workspaceId];
    const typeFilter = options.fixedDocumentType ? 'AND document_type = $3' : '';
    if (options.fixedDocumentType) params.push(options.fixedDocumentType);

    const result = await pool.query(
      `SELECT id, workspace_id, document_type, title, content, properties, created_at, updated_at
         FROM documents
        WHERE id = $1
          AND workspace_id = $2
          ${typeFilter}
          AND archived_at IS NULL
          AND deleted_at IS NULL
          AND visibility = 'workspace'`,
      params,
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

  router.post('/', publicBearerAuth, requireScope(options.writeScope), async (req, res, next) => {
  try {
    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid document create request', {
        issues: parsed.error.flatten(),
      });
    }

    const auth = req.publicAuth!;
    const document = await createPublicDocument({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      appId: auth.appId,
      clientId: auth.clientId,
      documentType: options.fixedDocumentType ?? parsed.data.document_type ?? options.defaultDocumentType,
      title: parsed.data.title,
      content: parsed.data.content ?? { type: 'doc', content: [] },
      properties: parsed.data.properties,
    });

    res.status(201).json({ data: document });
  } catch (err) {
    next(err);
  }
  });

  return router;
}

const router = createPublicDocumentResourceRouter({
  listScope: 'documents:read',
  writeScope: 'documents:write',
  defaultDocumentType: 'wiki',
});

export default router;
