/**
 * Administration (FR 8.1 users, FR 8.2 / NFR 4 audit log viewer).
 * The audit log is read-only here and in the database (trigger + grants).
 */
import { Router, type Request } from 'express';
import type { Prisma, User } from '../generated/prisma/client.js';
import {
  auditQuerySchema, createUserSchema, updateUserSchema, uuid, type AuditResponse, type UserSummary,
} from '@smilesync/shared';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { hashSecret, validateNewSecret } from '../auth/passwords.js';
import { authorize, requireAuth } from '../http/auth.js';
import { HttpError } from '../http/errors.js';

const toSummary = (u: User): UserSummary => ({
  id: u.id,
  username: u.username,
  role: u.role,
  isActive: u.isActive,
  chwCode: u.chwCode,
  assignedSite: u.assignedSite,
  licenseNumber: u.licenseNumber,
  specialty: u.specialty,
  adminLevel: u.adminLevel,
  lockedUntil: u.lockedUntil?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

function userId(req: Request): string {
  const v = req.params.id;
  if (typeof v !== 'string' || !uuid.safeParse(v).success) throw new HttpError(400, 'Invalid user id');
  return v;
}

const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

export function adminRouter(deps: { db: Db; config: Config; now: () => Date }): Router {
  const { db, config } = deps;
  const router = Router();
  const auth = requireAuth(db, config.JWT_SECRET, deps.now);
  const manage = (resourceIdFrom?: (r: Request) => string | undefined) =>
    authorize(db, 'user:manage', { resourceType: 'user', ...(resourceIdFrom ? { resourceIdFrom } : {}) });

  router.get('/admin/users', auth, manage(), async (_req, res) => {
    const users = await db.user.findMany({ orderBy: [{ role: 'asc' }, { username: 'asc' }] });
    res.json({ users: users.map(toSummary) });
  });

  router.post('/admin/users', auth, manage((r) => (typeof r.body?.username === 'string' ? r.body.username : undefined)), async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const problem = validateNewSecret(body.role, body.secret);
    if (problem) throw new HttpError(400, problem);
    try {
      const user = await db.user.create({
        data: {
          username: body.username,
          role: body.role,
          passwordHash: await hashSecret(body.secret, config.BCRYPT_COST),
          // Role-specific fields from the class diagram (B.2).
          ...(body.role === 'CHW' ? { chwCode: body.chwCode ?? null, assignedSite: body.assignedSite ?? null } : {}),
          ...(body.role === 'DENTIST' ? { licenseNumber: body.licenseNumber ?? null, specialty: body.specialty ?? null } : {}),
          ...(body.role === 'ADMIN' ? { adminLevel: body.adminLevel ?? null } : {}),
        },
      });
      res.status(201).json(toSummary(user));
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, 'That username or CHW code is already used');
      throw e;
    }
  });

  router.patch('/admin/users/:id', auth, manage((r) => r.params.id as string), async (req, res) => {
    const id = userId(req);
    const body = updateUserSchema.parse(req.body);
    if (id === req.actor!.id && body.isActive === false) throw new HttpError(400, 'You cannot deactivate your own account');
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, 'Not found');

    const data: Prisma.UserUpdateInput = {};
    let endSessions = false;
    if (body.isActive !== undefined) {
      data.isActive = body.isActive;
      if (!body.isActive) endSessions = true;
    }
    if (body.secret !== undefined) {
      const problem = validateNewSecret(user.role, body.secret);
      if (problem) throw new HttpError(400, problem);
      data.passwordHash = await hashSecret(body.secret, config.BCRYPT_COST);
      endSessions = true;
    }
    if (body.secret !== undefined || body.unlock) {
      data.failedLoginCount = 0;
      data.lockedUntil = null;
    }
    if (body.assignedSite !== undefined) data.assignedSite = body.assignedSite;
    if (body.specialty !== undefined) data.specialty = body.specialty;
    // Ends every token issued so far (FR 8.1): the user must log in again.
    if (endSessions) data.tokenVersion = { increment: 1 };

    res.json(toSummary(await db.user.update({ where: { id }, data })));
  });

  router.get('/admin/audit-log', auth, authorize(db, 'audit:read', { resourceType: 'audit_log' }), async (req, res) => {
    const q = auditQuerySchema.parse(req.query);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.username ? { user: { username: q.username } } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.outcome ? { outcome: q.outcome } : {}),
      ...(q.resourceId ? { resourceId: q.resourceId } : {}),
      ...(q.from || q.to
        ? { timestamp: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { username: true, role: true } } },
      }),
    ]);
    const body: AuditResponse = {
      items: rows.map((r) => ({
        id: r.id,
        timestamp: r.timestamp.toISOString(),
        username: r.user?.username ?? null,
        role: r.user?.role ?? null,
        action: r.action,
        outcome: r.outcome,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        ipAddress: r.ipAddress,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
    res.json(body);
  });

  return router;
}
