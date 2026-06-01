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
      app: result.rows[0],
      client_secret: clientSecret,
      secret_display: 'shown_once',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
