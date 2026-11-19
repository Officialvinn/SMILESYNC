/**
 * Endpoints from the sequence diagram (B.3) plus admin endpoints.
 * Access rules and auditing are live now (FR 1.2, FR 8.2); the handlers
 * arrive in later sprints and return 501 until then.
 */
import { Router, type Request } from 'express';
import { uuid } from '@smilesync/shared';
import type { Db } from '../db.js';
import { authorize, requireAuth } from '../http/auth.js';
import { HttpError, notImplemented } from '../http/errors.js';

export function plannedRouter(db: Db, jwtSecret: string, now: () => Date): Router {
  const router = Router();
  const auth = requireAuth(db, jwtSecret, now);

  const loadCase = async (req: Request) => {
    const id = req.params.id;
    if (!uuid.safeParse(id).success) throw new HttpError(400, 'Invalid case id');
    const c = await db.case.findUnique({ where: { id: id as string }, select: { id: true, submittedById: true } });
    return c ? { id: c.id, context: { submittedById: c.submittedById } } : null;
  };

  // CHW app (Sprint 2)
  router.post('/cases', auth, authorize(db, 'case:submit', { resourceType: 'case' }), notImplemented(2)); // step 12
  router.get('/cases/:id/triage', auth, authorize(db, 'case:readTriage', { resourceType: 'case', load: loadCase }), notImplemented(2)); // step 31

  // Dentist dashboard (Sprint 3)
  router.get('/cases', auth, authorize(db, 'case:listQueue', { resourceType: 'case' }), notImplemented(3)); // step 21
  router.get('/cases/:id', auth, authorize(db, 'case:read', { resourceType: 'case', load: loadCase }), notImplemented(3)); // step 25
  router.get('/cases/:id/images/:imageId', auth, authorize(db, 'case:readImages', { resourceType: 'case', load: loadCase }), notImplemented(3));
  router.put('/cases/:id/triage', auth, authorize(db, 'case:triage', { resourceType: 'case', load: loadCase }), notImplemented(3)); // step 27

  // Administration (Sprint 3)
  router.get('/admin/users', auth, authorize(db, 'user:manage', { resourceType: 'user' }), notImplemented(3));
  router.post('/admin/users', auth, authorize(db, 'user:manage', { resourceType: 'user' }), notImplemented(3));
  router.patch('/admin/users/:id', auth, authorize(db, 'user:manage', { resourceType: 'user' }), notImplemented(3));
  router.get('/admin/audit-log', auth, authorize(db, 'audit:read', { resourceType: 'audit_log' }), notImplemented(3));

  return router;
}
