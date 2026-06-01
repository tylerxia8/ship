import { Router } from 'express';
import { z } from 'zod';
import { pool, queryOne } from '../../db/client.js';
import { authMiddleware } from '../../middleware/auth.js';
import { ApiError } from '../errors.js';
import { generateClientId, generateClientSecret, hashSecret } from '../crypto.js';
import { parseScopes } from '../scopes.js';

const router = Router();

const createOAuthAppSchema = z.object({
  name: z.string().min(1).max(120),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  requested_scopes: z.array(z.string()).default([]),
});

function publicOAuthApp(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    owner_user_id: row.owner_user_id,
    name: row.name,
    client_id: row.client_id,
    redirect_uris: row.redirect_uris,
    requested_scopes: row.requested_scopes,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

interface MembershipRow {
  role: string;
}

async function requireWorkspaceAdmin(userId: string, workspaceId: string): Promise<void> {
  const membership = await queryOne<MembershipRow>(
    'SELECT role FROM workspace_memberships WHERE user_id = $1 AND workspace_id = $2',
    [userId, workspaceId],
  );

  if (membership?.role !== 'admin') {
    throw new ApiError(403, 'forbidden', 'Only workspace admins can manage OAuth apps');
  }
}

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }

    await requireWorkspaceAdmin(userId, workspaceId);

    const result = await pool.query(
      `SELECT id, workspace_id, owner_user_id, name, client_id, redirect_uris,
              requested_scopes, active, created_at, updated_at
         FROM oauth_apps
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [workspaceId],
    );

    res.json({ data: result.rows.map(publicOAuthApp), next_cursor: null });
  } catch (err) {
    next(err);
  }
});

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }

    await requireWorkspaceAdmin(userId, workspaceId);

    const parsed = createOAuthAppSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid OAuth app request', {
        issues: parsed.error.flatten(),
      });
    }

    const requestedScopes = parseScopes(parsed.data.requested_scopes);
    if (requestedScopes.length !== parsed.data.requested_scopes.length) {
      throw new ApiError(400, 'validation_failed', 'One or more requested scopes are not registered');
    }

    const clientId = generateClientId();
    const clientSecret = generateClientSecret();

    const result = await pool.query(
      `INSERT INTO oauth_apps
        (workspace_id, owner_user_id, name, client_id, client_secret_hash, redirect_uris, requested_scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, workspace_id, owner_user_id, name, client_id, redirect_uris, requested_scopes, active, created_at`,
      [
        workspaceId,
        userId,
        parsed.data.name,
        clientId,
        hashSecret(clientSecret),
        parsed.data.redirect_uris,
        requestedScopes,
      ],
    );

    res.status(201).json({
      app: publicOAuthApp(result.rows[0]),
      client_secret: clientSecret,
      secret_display: 'shown_once',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
