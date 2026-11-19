/**
 * FR 4.1, 4.2, 5.1-5.3: the questionnaire completes a draft, which becomes a
 * Pending case; the SQLite SyncStore behaves like the reference MemorySyncStore.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SyncEngine, caseSubmissionSchema, type SyncTransport, type TriageResult, type UploadOutcome, type UploadPayload,
} from '@smilesync/shared';
import { openMemoryDb, seqRandom, testUuid } from '../../test/nodeSqlite';
import { CaseLockedError, CaseRepo, IncompleteCaseError } from './caseRepo';
import { migrate } from './localDb';
import { buildPatient, recordConsent } from './registration';
import { SqliteSyncStore } from './syncStore';

const CHW = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const random = seqRandom();
let clock = new Date('2026-11-19T08:00:00.000Z');
const now = () => clock.toISOString();
const tick = () => (clock = new Date(clock.getTime() + 60_000));

let db: ReturnType<typeof openMemoryDb>;
let repo: CaseRepo;

beforeEach(async () => {
  db = openMemoryDb();
  await migrate(db);
  repo = new CaseRepo(db, { uuid: testUuid, now });
});

const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill);

async function draft(chw = CHW, withAssessment = true) {
  const r = buildPatient({ name: 'Synthetic Achieng', age: '29', location: 'Kisumu', sex: 'FEMALE' }, recordConsent(new Date(now())), {
    uuid: testUuid,
    randomBytes: random,
  });
  if (!r.ok) throw new Error('fixture');
  const caseId = await repo.startCase(r.patient, chw);
  for (const [i, view] of (['FRONT', 'UPPER_ARCH', 'LOWER_ARCH'] as const).entries()) {
    await repo.saveImage(caseId, { viewType: view, bytes: bytes(2000 + i, i + 1), sha256: String(i).repeat(64), capturedAt: now() });
  }
  if (withAssessment) await repo.saveAssessment(caseId, { painLevel: 6, duration: 'DAYS_1_TO_7' });
  tick();
  return caseId;
}

describe('questionnaire and submit (FR 4.1, FR 4.2)', () => {
  it('saves pain and duration on a draft, and a second save replaces the first', async () => {
    const id = await draft();
    await repo.saveAssessment(id, { painLevel: 9, duration: 'LESS_THAN_1_DAY' });
    expect((await repo.getCase(id, CHW))!.assessment).toMatchObject({ painLevel: 9, duration: 'LESS_THAN_1_DAY' });
  });

  it.each([0, 11, 3.5])('rejects pain level %s', async (painLevel) => {
    const id = await draft(CHW, false);
    await expect(repo.saveAssessment(id, { painLevel, duration: 'DAYS_1_TO_7' })).rejects.toThrow();
  });

  it('cannot submit without the questionnaire or without the 3 photos', async () => {
    const noAnswers = await draft(CHW, false);
    await expect(repo.submitCase(noAnswers, CHW)).rejects.toBeInstanceOf(IncompleteCaseError);
    const noPhotos = await draft();
    const front = (await repo.listImages(noPhotos)).find((i) => i.viewType === 'FRONT')!;
    await repo.deleteImage(noPhotos, front.id);
    await expect(repo.submitCase(noPhotos, CHW)).rejects.toBeInstanceOf(IncompleteCaseError);
  });

  it('submitting makes the case Pending and locks it', async () => {
    const id = await draft();
    await repo.submitCase(id, CHW);
    expect(await repo.getCase(id, CHW)).toMatchObject({ isDraft: false, status: 'PENDING' });
    await expect(repo.saveAssessment(id, { painLevel: 1, duration: 'DAYS_1_TO_7' })).rejects.toBeInstanceOf(CaseLockedError);
  });
});

describe('SqliteSyncStore', () => {
  it('lists only submitted cases of this CHW, oldest first; drafts are never sent', async () => {
    const a = await draft();
    const b = await draft();
    await draft(); // stays a draft
    const other = await draft(OTHER);
    await repo.submitCase(b, CHW);
    await repo.submitCase(a, CHW);
    await repo.submitCase(other, OTHER);
    const store = new SqliteSyncStore(db, CHW);
    expect((await store.listByStatus('PENDING')).map((c) => c.id)).toEqual([a, b]);
  });

  it('loadPayload builds a valid submission with the photo bytes', async () => {
    const id = await draft();
    await repo.submitCase(id, CHW);
    const p = await new SqliteSyncStore(db, CHW).loadPayload(id);
    expect(caseSubmissionSchema.parse(p.submission)).toEqual(p.submission);
    expect(p.submission.patient).toMatchObject({ name: 'Synthetic Achieng', age: 29, location: 'Kisumu', sex: 'FEMALE', consentGiven: true });
    expect(p.submission.assessment).toMatchObject({ painLevel: 6, duration: 'DAYS_1_TO_7' });
    expect(p.submission.images.map((i) => [i.viewType, i.sizeKB])).toEqual([['FRONT', 2], ['UPPER_ARCH', 2], ['LOWER_ARCH', 2]]);
    expect(p.images[1]!.bytes).toEqual(bytes(2001, 2));
    expect(p.images.map((i) => i.id)).toEqual(p.submission.images.map((i) => i.id));
  });

  it('records failures, marks synced, and applies triage (server wins), surviving a restart', async () => {
    const id = await draft();
    await repo.submitCase(id, CHW);
    const store = new SqliteSyncStore(db, CHW);
    await store.recordFailure(id, { attempts: 2, lastAttemptAt: now(), nextAttemptAt: '2026-11-19T09:00:00.000Z', error: 'No connection', needsAttention: false });
    expect((await store.listByStatus('PENDING'))[0]).toMatchObject({ attempts: 2, lastError: 'No connection', nextAttemptAt: '2026-11-19T09:00:00.000Z', needsAttention: false });

    await store.markSynced(id, now());
    const synced = (await store.listByStatus('SYNCED'))[0]!;
    expect(synced).toMatchObject({ status: 'SYNCED', attempts: 0, lastError: null, nextAttemptAt: null });

    const result: TriageResult = {
      caseId: id, status: 'REVIEWED', priority: 'URGENT', reviewedAt: '2026-11-19T10:00:00.000Z',
      notes: [{ id: testUuid(), noteText: 'See a dentist this week.', referralAdvice: null, createdAt: '2026-11-19T10:00:00.000Z' }],
    };
    await store.applyTriage(id, result);
    await store.markSynced(id, now()); // a late duplicate must not move it back
    const reopened = new SqliteSyncStore(db, CHW); // app restart
    expect((await reopened.listByStatus('REVIEWED'))[0]).toMatchObject({ status: 'REVIEWED', priority: 'URGENT', notes: result.notes });
  });

  it('the real SyncEngine runs on it: offline, then online, then a result', async () => {
    const id = await draft();
    await repo.submitCase(id, CHW);
    let online = false;
    const sent: UploadPayload[] = [];
    const transport: SyncTransport = {
      async uploadCase(p): Promise<UploadOutcome> {
        if (!online) throw new (await import('@smilesync/shared')).NetworkError();
        sent.push(p);
        return { kind: 'created' };
      },
      async fetchTriage(ids) {
        return ids.map((caseId) => ({ caseId, status: 'REVIEWED' as const, priority: 'ROUTINE' as const, reviewedAt: now(), notes: [] }));
      },
    };
    const engine = new SyncEngine({ store: new SqliteSyncStore(db, CHW), transport, now: () => new Date(now()), random: () => 1 });
    expect((await engine.runOnce()).offline).toBe(true);
    expect((await repo.getCase(id, CHW))!.sync).toMatchObject({ attempts: 1, lastError: expect.stringContaining('No connection') });
    online = true;
    const report = await engine.runOnce({ force: true });
    expect(report.uploaded).toEqual([id]);
    expect(report.reviewed).toEqual([id]);
    expect(sent).toHaveLength(1);
    expect(await repo.getCase(id, CHW)).toMatchObject({ status: 'REVIEWED', triage: { priority: 'ROUTINE' } });
  });
});
