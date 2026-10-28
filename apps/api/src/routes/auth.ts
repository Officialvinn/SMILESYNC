/**
 * FR 1.1 login and token refresh. Every attempt is audited (FR 8.2).
 * Five wrong attempts lock the account for 15 minutes, which matters
 * because a 6-digit PIN is short.
 */
import { Router } from 'express';
import { loginRequestSchema, type LoginResponse } from '@smilesync/shared';
import { recordAudit } from '../audit.js';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { hashSecret, verifySecret } from '../auth/passwords.js';
import { signToken } from '../auth/tokens.js';
import { HttpError } from '../http/errors.js';
import { authorize, requireAuth } from '../http/auth.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60_000;
const INVALID = 'Invalid username or password';

export function authRouter(db: Db, config: Config, now: () => Date): Router {
  const router = Router();
  // Compared against when the username is unknown, so response time does not reveal which usernames exist.
  const dummyHash = hashSecret('not-a-real-password', config.BCRYPT_COST);

  router.post('/login', async (req, res) => {
    const { username, password } = loginRequestSchema.parse(req.body);
    const ip = req.ip;
    const user = await db.user.findUnique({ where: { username } });

    if (!user) {
      await verifySecret(password, await dummyHash);
      await recordAudit(db, { userId: null, action: 'auth:login', outcome: 'DENIED', resourceType: 'user', resourceId: username, ipAddress: ip });
      throw new HttpError(401, INVALID);
    }

    const at = now();
    const audit = (outcome: 'ALLOWED' | 'DENIED', action = 'auth:login') =>
      recordAudit(db, { userId: user.id, action, outcome, resourceType: 'user', resourceId: user.id, ipAddress: ip });

    if (user.lockedUntil && user.lockedUntil > at) {
      await audit('DENIED', 'auth:login:locked');
      throw new HttpError(401, 'Too many failed attempts. Try again in 15 minutes or ask an administrator.');
    }

    const ok = await verifySecret(password, user.passwordHash);
    if (!ok || !user.isActive) {
      if (!ok) {
        const failed = user.failedLoginCount + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        await db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(at.getTime() + LOCKOUT_MS) : user.lockedUntil },
        });
      }
      await audit('DENIED', user.isActive ? 'auth:login' : 'auth:login:inactive');
      throw new HttpError(401, INVALID);
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    }
    await audit('ALLOWED');
    const { token, expiresAt } = signToken({ sub: user.id, role: user.role, tv: user.tokenVersion }, config.JWT_SECRET, at);
    const body: LoginResponse = {
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: user.id, username: user.username, role: user.role },
    };
    res.json(body);
  });

  const auth = requireAuth(db, config.JWT_SECRET);

  /** FR 1.1: the CHW app refreshes its token on each sync. */
  router.post('/refresh', auth, authorize(db, 'auth:refresh', { resourceType: 'user', audit: false }), (req, res) => {
    const a = req.actor!;
    const { token, expiresAt } = signToken({ sub: a.id, role: a.role, tv: a.tokenVersion }, config.JWT_SECRET, now());
    const body: LoginResponse = { token, expiresAt: expiresAt.toISOString(), user: { id: a.id, username: a.username, role: a.role } };
    res.json(body);
  });

  router.get('/me', auth, (req, res) => {
    const a = req.actor!;
    res.json({ id: a.id, username: a.username, role: a.role });
  });

  return router;
}
