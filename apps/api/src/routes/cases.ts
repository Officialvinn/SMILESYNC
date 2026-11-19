/**
 * The CHW app's sync endpoints (sequence diagram B.3 steps 12 and 31).
 *
 *   PUT  /cases/{id}/images/{imageId}  one compressed photo, raw bytes + SHA-256
 *   POST /cases                        the case JSON; stored only when every photo is here
 *   GET  /cases/{id}/triage            the dentist's result, pulled on each sync (FR 7.3)
 *
 * See packages/shared/src/sync/httpTransport.ts for the client side.
 */
import { createHash } from 'node:crypto';
import express, { Router, type Request } from 'express';
import {
  MAX_SUBMISSION_BYTES, SHA256_HEADER, caseSubmissionSchema, uuid, type TriageResult,
} from '@smilesync/shared';
import type { Db } from '../db.js';
import { authorize, requireAuth } from '../http/auth.js';
import { HttpError } from '../http/errors.js';
import type { FieldCrypto } from '../security/fieldCrypto.js';
import { ImageStore } from '../storage/imageStore.js';

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function param(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || !uuid.safeParse(v).success) throw new HttpError(400, `Invalid ${name}`);
  return v;
}

/** FR 7.3: the result the CHW app pulls (also returned after a dentist's triage). */
export async function triageResult(db: Db, caseId: string): Promise<TriageResult> {
  const c = await db.case.findUniqueOrThrow({ where: { id: caseId }, include: { notes: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });
  return {
    caseId: c.id,
    status: c.status === 'REVIEWED' ? 'REVIEWED' : 'SYNCED',
    priority: c.priority,
    reviewedAt: c.reviewedAt?.toISOString() ?? null,
    notes: c.notes.map((n) => ({ id: n.id, noteText: n.noteText, referralAdvice: n.referralAdvice, createdAt: n.createdAt.toISOString() })),
  };
}

export function casesRouter(deps: { db: Db; jwtSecret: string; now: () => Date; crypto: FieldCrypto; images: ImageStore }): Router {
  const { db, now, crypto, images } = deps;
  const router = Router();
  const auth = requireAuth(db, deps.jwtSecret, now);

  /** FR 3.3, FR 5.2: one photo per request; retries of a stored photo are skipped with 200. */
  router.put(
    '/cases/:id/images/:imageId',
    auth,
    authorize(db, 'case:submit', { resourceType: 'image', auditAction: 'case:uploadImage', resourceIdFrom: (r) => r.params.imageId as string }),
    express.raw({ type: 'application/octet-stream', limit: MAX_SUBMISSION_BYTES }),
    async (req, res) => {
      const caseId = param(req, 'id');
      const imageId = param(req, 'imageId');
      const claimed = req.get(SHA256_HEADER)?.toLowerCase();
      if (!claimed || !/^[a-f0-9]{64}$/.test(claimed)) throw new HttpError(400, `Missing ${SHA256_HEADER} header`);
      const body = req.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, 'Empty photo');
      if (sha256(body) !== claimed) throw new HttpError(400, 'The photo was damaged in transit. It will be sent again.');

      const stored = await db.oralImage.findUnique({ where: { id: imageId }, include: { case: { select: { submittedById: true } } } });
      if (stored) {
        const same = stored.caseId === caseId && stored.case.submittedById === req.actor!.id && stored.sha256 === claimed;
        if (!same) throw new HttpError(409, 'This photo id is already used');
        res.status(200).json({ imageId, stored: true });
        return;
      }
      await images.putIncoming(req.actor!.id, imageId, body);
      res.status(201).json({ imageId, stored: false });
    },
  );

  /** FR 4.2 / FR 5.2 / FR 5.3: idempotent, all-or-nothing case upload. */
  router.post(
    '/cases',
    auth,
    authorize(db, 'case:submit', {
      resourceType: 'case',
      resourceIdFrom: (r) => (typeof r.body?.id === 'string' ? r.body.id : undefined),
    }),
    async (req, res) => {
      const actorId = req.actor!.id;
      const sub = caseSubmissionSchema.parse(req.body);

      const existing = await db.case.findUnique({ where: { id: sub.id }, select: { submittedById: true, status: true } });
      if (existing) {
        // The server's copy wins: a repeat (even a changed one) changes nothing.
        if (existing.submittedById !== actorId) throw new HttpError(409, 'This case id is already used');
        res.status(200).json({ caseId: sub.id, status: existing.status });
        return;
      }

      const missingImageIds: string[] = [];
      let imageBytes = 0;
      for (const meta of sub.images) {
        const bytes = await images.readIncoming(actorId, meta.id);
        if (!bytes || sha256(bytes) !== meta.sha256) {
          missingImageIds.push(meta.id);
          continue;
        }
        if (Math.ceil(bytes.length / 1024) !== meta.sizeKB) throw new HttpError(400, `Photo ${meta.id} size does not match`);
        imageBytes += bytes.length;
      }
      if (missingImageIds.length > 0) {
        res.status(409).json({ error: 'Photos missing', missingImageIds });
        return;
      }

      const total = imageBytes + Buffer.byteLength(JSON.stringify(sub));
      if (total > MAX_SUBMISSION_BYTES) throw new HttpError(413, 'This case is larger than 2 MB');

      const p = sub.patient;
      if (await db.patient.findFirst({ where: { OR: [{ id: p.id }, { anonId: p.anonId }] }, select: { id: true } })) {
        throw new HttpError(409, 'This patient record already exists');
      }

      await db.$transaction(async (tx) => {
        await tx.patient.create({
          data: {
            id: p.id,
            anonId: p.anonId,
            nameEncrypted: crypto.encrypt(p.name),
            age: p.age,
            location: p.location,
            sex: p.sex ?? null,
            consentGiven: p.consentGiven,
            consentDate: new Date(p.consentDate),
            registeredById: actorId,
          },
        });
        await tx.case.create({
          data: { id: sub.id, patientId: p.id, submittedById: actorId, status: 'SYNCED', createdAt: new Date(sub.createdAt), syncedAt: now() },
        });
        await tx.symptomAssessment.create({
          data: { id: sub.assessment.id, caseId: sub.id, painLevel: sub.assessment.painLevel, duration: sub.assessment.duration },
        });
        for (const meta of sub.images) {
          // Moved inside the transaction: if the commit fails, the next retry
          // finds the photos missing and the phone uploads them again.
          const filePath = await images.promote(actorId, meta.id);
          await tx.oralImage.create({
            data: { id: meta.id, caseId: sub.id, filePath, sizeKB: meta.sizeKB, viewType: meta.viewType, capturedAt: new Date(meta.capturedAt), sha256: meta.sha256 },
          });
        }
      });
      res.status(201).json({ caseId: sub.id, status: 'SYNCED' });
    },
  );

  const loadCase = async (req: Request) => {
    const id = param(req, 'id');
    const c = await db.case.findUnique({ where: { id }, select: { id: true, submittedById: true } });
    return c ? { id: c.id, context: { submittedById: c.submittedById } } : null;
  };

  /** FR 7.3: pulled by the CHW app on each sync. Only the submitting CHW may read it. */
  router.get('/cases/:id/triage', auth, authorize(db, 'case:readTriage', { resourceType: 'case', load: loadCase }), async (req, res) => {
    res.json(await triageResult(db, req.params.id as string));
  });

  return router;
}
