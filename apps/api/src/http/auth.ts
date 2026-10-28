/**
 * FR 1.1 authentication and FR 1.2 role checks for every route.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { can, roleMayEver, type Action, type Actor, type ResourceContext } from '@smilesync/shared';
import { recordAudit } from '../audit.js';
import type { Db } from '../db.js';
import { verifyToken } from '../auth/tokens.js';
import { HttpError } from './errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor & { username: string; tokenVersion: number };
  }
}

/** Requires a valid token for an active account whose token has not been revoked. */
export function requireAuth(db: Db, jwtSecret: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer (.+)$/.exec(header);
    const claims = match?.[1] ? verifyToken(match[1], jwtSecret) : null;
    if (!claims) return next(new HttpError(401, 'Please log in'));

    const user = await db.user.findUnique({ where: { id: claims.sub } });
    // Deactivated (FR 8.1), role changed, or token revoked by a reset.
    if (!user || !user.isActive || user.tokenVersion !== claims.tv || user.role !== claims.role) {
      return next(new HttpError(401, 'Please log in'));
    }
    req.actor = { id: user.id, role: user.role, isActive: user.isActive, username: user.username, tokenVersion: user.tokenVersion };
    next();
  };
}

export interface AuthorizeOptions {
  /** Written to the audit log. */
  resourceType: string;
  /** Loads ownership facts; return null when the resource does not exist. */
  load?: (req: Request) => Promise<{ id: string; context: ResourceContext } | null>;
  /** Default true. Only auth:refresh skips the audit log. */
  audit?: boolean;
}

/**
 * Checks the shared permission table (FR 1.2) and writes the audit entry
 * (FR 8.2), including for denied attempts.
 */
export function authorize(db: Db, action: Action, opts: AuthorizeOptions): RequestHandler {
  return async (req, _res, next) => {
    const actor = req.actor;
    if (!actor) return next(new HttpError(401, 'Please log in'));
    const audit = (outcome: 'ALLOWED' | 'DENIED' | 'NOT_FOUND', resourceId?: string) =>
      opts.audit === false
        ? Promise.resolve()
        : recordAudit(db, { userId: actor.id, action, outcome, resourceType: opts.resourceType, resourceId, ipAddress: req.ip });

    // Roles that may never do this get 403 without learning whether the resource exists.
    if (!roleMayEver(actor.role, action)) {
      await audit('DENIED', firstParam(req));
      return next(new HttpError(403, 'You do not have permission to do this'));
    }

    let context: ResourceContext = {};
    let resourceId: string | undefined;
    if (opts.load) {
      const loaded = await opts.load(req);
      if (!loaded) {
        await audit('NOT_FOUND', firstParam(req));
        return next(new HttpError(404, 'Not found'));
      }
      context = loaded.context;
      resourceId = loaded.id;
    }

    if (!can(actor, action, context)) {
      await audit('DENIED', resourceId);
      return next(new HttpError(403, 'You do not have permission to do this'));
    }
    await audit('ALLOWED', resourceId);
    next();
  };
}

function firstParam(req: Request): string | undefined {
  const v = Object.values(req.params ?? {})[0];
  return typeof v === 'string' ? v : undefined;
}
