/**
 * Dentist dashboard endpoints (sequence diagram B.3 steps 21-28).
 *
 *   GET /cases                         FR 6.1, 6.3: queue with filters and sort
 *   GET /cases/{id}                    FR 6.2: case detail
 *   GET /cases/{id}/images/{imageId}   FR 6.2: one photo, decrypted on the fly
 *   PUT /cases/{id}/triage             FR 7.1, 7.2: priority and notes
 *
 * Dentists never receive the patient's name (data minimisation, NFR 6).
 * Every call is audited by authorize() (FR 8.2).
 */
import { Router, type Request } from 'express';
import type { Prisma } from '../generated/prisma/client.js';
import {
  queueQuerySchema, triageRequestSchema, uuid, type CaseDetail, type QueueItem, type QueueResponse,
} from '@smilesync/shared';
import type { Db } from '../db.js';
import { authorize, requireAuth } from '../http/auth.js';
import { HttpError } from '../http/errors.js';
import type { ImageStore } from '../storage/imageStore.js';
import { triageResult } from './cases.js';

function param(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || !uuid.safeParse(v).success) throw new HttpError(400, `Invalid ${name}`);
  return v;
}

const iso = (d: Date) => d.toISOString();

/** What the queue and the case view need, and nothing more: no name. */
const caseSelect = {
  id: true,
  status: true,
  priority: true,
  createdAt: true,
  syncedAt: true,
  patient: { select: { anonId: true, age: true, sex: true, location: true, consentDate: true } },
  assessment: { select: { painLevel: true, duration: true } },
  _count: { select: { images: true } },
} satisfies Prisma.CaseSelect;

type CaseRow = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

function toQueueItem(c: CaseRow): QueueItem {
  return {
    id: c.id,
    anonId: c.patient.anonId,
    age: c.patient.age,
    sex: c.patient.sex,
    location: c.patient.location,
    painLevel: c.assessment?.painLevel ?? null,
    duration: c.assessment?.duration ?? null,
    createdAt: iso(c.createdAt),
    syncedAt: iso(c.syncedAt),
    status: c.status === 'REVIEWED' ? 'REVIEWED' : 'SYNCED',
    priority: c.priority,
    imageCount: c._count.images,
  };
}

/** JPEG from the phone; PNG for synthetic seed images. */
function imageType(b: Buffer): string {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  return 'image/jpeg';
}

export function dashboardRouter(deps: { db: Db; jwtSecret: string; now: () => Date; images: ImageStore }): Router {
  const { db, now, images } = deps;
  const router = Router();
  const auth = requireAuth(db, deps.jwtSecret, now);

  const loadCase = async (req: Request) => {
    const id = param(req, 'id');
    const c = await db.case.findUnique({ where: { id }, select: { id: true, submittedById: true } });
    return c ? { id: c.id, context: { submittedById: c.submittedById } } : null;
  };

  router.get('/cases', auth, authorize(db, 'case:listQueue', { resourceType: 'case' }), async (req, res) => {
    const q = queueQuerySchema.parse(req.query);
    const where: Prisma.CaseWhereInput = {
      status: q.status === 'ALL' ? { in: ['SYNCED', 'REVIEWED'] } : q.status,
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.location ? { patient: { location: q.location } } : {}),
      ...(q.from || q.to
        ? { syncedAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } }
        : {}),
    };
    const orderBy: Prisma.CaseOrderByWithRelationInput[] =
      q.sort === 'pain'
        ? [{ assessment: { painLevel: 'desc' } }, { syncedAt: 'asc' }]
        : q.sort === 'priority'
          ? [{ priority: { sort: 'desc', nulls: 'last' } }, { syncedAt: 'asc' }]
          : [{ syncedAt: q.sort === 'oldest' ? 'asc' : 'desc' }];
    orderBy.push({ id: 'asc' });

    const [total, rows] = await Promise.all([
      db.case.count({ where }),
      db.case.findMany({ where, orderBy, select: caseSelect, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    const body: QueueResponse = { items: rows.map(toQueueItem), total, page: q.page, pageSize: q.pageSize };
    res.json(body);
  });

  router.get('/cases/:id', auth, authorize(db, 'case:read', { resourceType: 'case', load: loadCase }), async (req, res) => {
    const c = await db.case.findUniqueOrThrow({
      where: { id: req.params.id as string },
      select: {
        ...caseSelect,
        reviewedAt: true,
        submittedBy: { select: { username: true } },
        reviewedBy: { select: { username: true } },
        images: { select: { id: true, viewType: true, sizeKB: true, capturedAt: true }, orderBy: [{ viewType: 'asc' }, { capturedAt: 'asc' }] },
        notes: { select: { id: true, noteText: true, referralAdvice: true, createdAt: true, author: { select: { username: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    const body: CaseDetail = {
      ...toQueueItem(c),
      consentDate: iso(c.patient.consentDate),
      submittedBy: c.submittedBy.username,
      reviewedAt: c.reviewedAt ? iso(c.reviewedAt) : null,
      reviewedBy: c.reviewedBy?.username ?? null,
      images: c.images.map((i) => ({ id: i.id, viewType: i.viewType, sizeKB: i.sizeKB, capturedAt: iso(i.capturedAt) })),
      notes: c.notes.map((n) => ({ id: n.id, noteText: n.noteText, referralAdvice: n.referralAdvice, createdAt: iso(n.createdAt), author: n.author.username })),
    };
    res.json(body);
  });

  router.get('/cases/:id/images/:imageId', auth, authorize(db, 'case:readImages', { resourceType: 'case', load: loadCase }), async (req, res) => {
    const imageId = param(req, 'imageId');
    const img = await db.oralImage.findFirst({ where: { id: imageId, caseId: req.params.id as string }, select: { id: true, filePath: true } });
    if (!img) throw new HttpError(404, 'Not found');
    const bytes = await images.read(img.filePath, img.id);
    // Decrypted patient photo: never cached by the browser or a proxy.
    res.set({ 'Content-Type': imageType(bytes), 'Cache-Control': 'no-store', 'Content-Disposition': 'inline' });
    res.send(bytes);
  });

  router.put('/cases/:id/triage', auth, authorize(db, 'case:triage', { resourceType: 'case', load: loadCase }), async (req, res) => {
    const caseId = req.params.id as string;
    const t = triageRequestSchema.parse(req.body);
    await db.$transaction(async (tx) => {
      if (t.note) {
        const existing = await tx.clinicalNote.findUnique({ where: { id: t.note.id }, select: { caseId: true } });
        if (existing && existing.caseId !== caseId) throw new HttpError(409, 'This note id is already used');
        if (!existing) {
          await tx.clinicalNote.create({
            data: { id: t.note.id, caseId, authorId: req.actor!.id, noteText: t.note.noteText, referralAdvice: t.note.referralAdvice ?? null, createdAt: now() },
          });
        }
      }
      await tx.case.update({
        where: { id: caseId },
        data: { status: 'REVIEWED', priority: t.priority, reviewedById: req.actor!.id, reviewedAt: now() },
      });
    });
    res.json(await triageResult(db, caseId));
  });

  return router;
}
