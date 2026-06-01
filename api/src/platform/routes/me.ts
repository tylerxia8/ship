import { Router } from 'express';
import { queryOne } from '../../db/client.js';
import { publicBearerAuth } from '../auth.js';

const router = Router();

interface MeRow {
  id: string;
  email: string;
  name: string;
  workspace_id: string;
  workspace_name: string;
}

router.get('/', publicBearerAuth, async (req, res, next) => {
  try {
    const auth = req.publicAuth!;
    const user = await queryOne<MeRow>(
      `SELECT u.id, u.email, u.name, w.id AS workspace_id, w.name AS workspace_name
         FROM users u
         JOIN workspaces w ON w.id = $2
        WHERE u.id = $1`,
      [auth.userId, auth.workspaceId],
    );

    res.json({
      user: user ? {
        id: user.id,
        email: user.email,
        name: user.name,
      } : null,
      workspace: user ? {
        id: user.workspace_id,
        name: user.workspace_name,
      } : null,
      app: {
        client_id: auth.clientId,
        scopes: auth.scopes,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
