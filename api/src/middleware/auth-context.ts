/**
 * Auth-context helper — collapses `req.userId!` / `req.workspaceId!` non-null
 * assertions into one safe destructure per handler.
 *
 * Why this exists: every authenticated route handler runs after `authMiddleware`
 * sets `req.userId` and `req.workspaceId`. But the Express Request augmentation
 * types both as `string | undefined` (correctly — they ARE undefined on public
 * routes like /login). Pre-Cat-1, every handler that needed them spelled out
 * `req.userId!` and `req.workspaceId!` — typically 2-4 times per handler.
 *
 * `authCtx(req)` does the runtime check ONCE and returns the values typed
 * non-optional. Used as `const { userId, workspaceId } = authCtx(req);` at
 * the top of each handler.
 *
 * This is a real type-system improvement, not a `!` shortcut: the runtime
 * check catches the case where someone accidentally registers a route without
 * `authMiddleware` — instead of a silent undefined-id query, it throws.
 */
import { Request } from 'express';

export function authCtx(req: Request): { userId: string; workspaceId: string } {
  if (!req.userId || !req.workspaceId) {
    throw new Error(
      'authCtx() called without authMiddleware — req.userId/workspaceId missing'
    );
  }
  return { userId: req.userId, workspaceId: req.workspaceId };
}
