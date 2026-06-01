import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors.js';

export const PUBLIC_SCOPES = [
  'documents:read',
  'documents:write',
  'issues:read',
  'issues:write',
  'sprints:read',
  'sprints:write',
  'webhooks:manage',
] as const;

export type PublicScope = typeof PUBLIC_SCOPES[number];

export interface ScopeDefinition {
  name: PublicScope;
  description: string;
}

export const ScopeRegistry: Record<PublicScope, ScopeDefinition> = {
  'documents:read': {
    name: 'documents:read',
    description: 'Read documents visible to the authorized user.',
  },
  'documents:write': {
    name: 'documents:write',
    description: 'Create and update documents as the authorized user.',
  },
  'issues:read': {
    name: 'issues:read',
    description: 'Read issue documents and issue properties.',
  },
  'issues:write': {
    name: 'issues:write',
    description: 'Create and update issue documents.',
  },
  'sprints:read': {
    name: 'sprints:read',
    description: 'Read week/sprint documents and sprint properties.',
  },
  'sprints:write': {
    name: 'sprints:write',
    description: 'Create and update week/sprint documents.',
  },
  'webhooks:manage': {
    name: 'webhooks:manage',
    description: 'Create, update, replay, and inspect webhook subscriptions.',
  },
};

export function parseScopes(scopes: unknown): PublicScope[] {
  if (!Array.isArray(scopes)) return [];
  return scopes.filter((scope): scope is PublicScope => (
    typeof scope === 'string' && scope in ScopeRegistry
  ));
}

export function requireScope(scope: PublicScope) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const granted = req.publicAuth?.scopes ?? [];
    if (!granted.includes(scope)) {
      next(new ApiError(403, 'forbidden', `Missing required scope: ${scope}`, { missing_scope: scope }));
      return;
    }
    req.publicAuthScopeUsed = scope;
    next();
  };
}
