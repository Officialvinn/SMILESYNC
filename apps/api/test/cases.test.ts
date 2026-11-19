/**
 * FR 4.2 / FR 5.1 / FR 5.2 / FR 5.3 / FR 7.3 on the server:
 * PUT /cases/{id}/images/{imageId}, POST /cases, GET /cases/{id}/triage.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HttpSyncTransport, MAX_SUBMISSION_BYTES, MemorySyncStore, NetworkError, SHA256_HEADER, SyncEngine,
  generateAnonId, type CaseSubmission, type HttpClient, type UploadPayload,
} from '@smilesync/shared';
import { auditFor, loginAs, makeHarness } from './helpers.js';

const h = makeHarness();
let chw: { user: { id: string }; token: string };
let otherChw: { user: { id: string }; token: string };
let dentist: { user: { id: string }; token: string };

beforeAll(async () => {
  chw = await loginAs(h, 'CHW');
  otherChw = await loginAs(h, 'CHW');
  dentist = await loginAs(h, 'DENTIST');
});
afterAll(() => h.db.$disconnect());

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Synthetic JPEG-like bytes, different per call. */
function fakeJpeg(size = 50_000): Uint8Array {
  const b = new Uint8Array(size);
  b[0] = 0xff; b[1] = 0xd8;
  const seed = Math.floor(Math.random() * 255);
  for (let i = 2; i < size; i++) b[i] = (i * 31 + seed) & 0xff;
  return b;
}

function makePayload(opts: { size?: number; extras?: number } = {}): UploadPayload {
  const createdAt = '2026-10-28T07:30:00.000Z';
  const views = ['FRONT', 'UPPER_ARCH', 'LOWER_ARCH', ...Array(opts.extras ?? 0).fill('EXTRA')] as const;
  const images = views.map((viewType) => {
    const bytes = fakeJpeg(opts.size);
    return { id: randomUUID(), bytes, meta: { viewType, sizeKB: Math.ceil(bytes.byteLength / 1024), sha256: sha(bytes), capturedAt: createdAt } };
  });
  const submission: CaseSubmission = {
    id: randomUUID(),
    createdAt,
    patient: {
      id: randomUUID(), anonId: generateAnonId(), name: 'Synthetic Wanjiru', age: 41, location: 'Narok',
      sex: 'FEMALE', consentGiven: true, consentDate: createdAt,
    },
    images: images.map((i) => ({ id: i.id, ...i.meta })),
    assessment: { id: randomUUID(), painLevel: 7, duration: 'DAYS_1_TO_7' },
  };
  return { submission, images: images.map(({ id, bytes }) => ({ id, bytes })) };
}

const put = (token: string, caseId: string, img: { id: string; bytes: Uint8Array }, digest = sha(img.bytes)) =>
  h.http()
    .put(`/cases/${caseId}/images/${img.id}`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/octet-stream')
    .set(SHA256_HEADER, digest)
    .send(Buffer.from(img.bytes));

const post = (token: string, submission: CaseSubmission) =>
  h.http().post('/cases').set('Authorization', `Bearer ${token}`).send(submission);

async function uploadAll(p: UploadPayload, token = chw.token) {
  for (const img of p.images) expect((await put(token, p.submission.id, img)).status).toBe(201);
  return post(token, p.submission);
}

describe('PUT /cases/{id}/images/{imageId}', () => {
  it('stores the bytes encrypted, not as a readable JPEG', async () => {
    const p = makePayload();
    const img = p.images[0]!;
    expect((await put(chw.token, p.submission.id, img)).status).toBe(201);
    const dir = join(h.config.IMAGE_STORAGE_DIR, 'incoming', chw.user.id);
    const stored = await readFile(join(dir, (await readdir(dir)).find((f) => f.startsWith(img.id))!));
    expect(stored.includes(Buffer.from(img.bytes.subarray(0, 64)))).toBe(false);
    expect(stored.subarray(0, 2)).not.toEqual(Buffer.from([0xff, 0xd8]));
  });

  it('rejects bytes whose SHA-256 does not match (damaged in transit)', async () => {
    const p = makePayload();
    const res = await put(chw.token, p.submission.id, p.images[0]!, 'b'.repeat(64));
    expect(res.status).toBe(400);
  });

  it('requires the checksum header and a non-empty body', async () => {
    const p = makePayload();
    const img = p.images[0]!;
    const noHeader = await h.http().put(`/cases/${p.submission.id}/images/${img.id}`).set('Authorization', `Bearer ${chw.token}`)
      .set('Content-Type', 'application/octet-stream').send(Buffer.from(img.bytes));
    expect(noHeader.status).toBe(400);
    expect((await put(chw.token, p.submission.id, { id: img.id, bytes: new Uint8Array() })).status).toBe(400);
  });

  it('FR 3.3: refuses a single image over 2 MB', async () => {
    const p = makePayload();
    const big = { id: p.images[0]!.id, bytes: fakeJpeg(MAX_SUBMISSION_BYTES + 1) };
    expect((await put(chw.token, p.submission.id, big)).status).toBe(413);
  });

  it('FR 1.2: only CHWs upload images', async () => {
    const p = makePayload();
    expect((await put(dentist.token, p.submission.id, p.images[0]!)).status).toBe(403);
  });
});

describe('POST /cases', () => {
  it('lists every image the server does not have yet, and stores nothing', async () => {
    const p = makePayload();
    await put(chw.token, p.submission.id, p.images[0]!);
    const res = await post(chw.token, p.submission);
    expect(res.status).toBe(409);
    expect(res.body.missingImageIds.sort()).toEqual(p.images.slice(1).map((i) => i.id).sort());
    expect(await h.db.case.findUnique({ where: { id: p.submission.id } })).toBeNull();
    expect(await h.db.patient.findUnique({ where: { id: p.submission.patient.id } })).toBeNull();
  });

  it('stores the whole case as Synced once all images are there', async () => {
    const p = makePayload({ extras: 1 });
    const res = await uploadAll(p);
    expect(res.status).toBe(201);
    const c = await h.db.case.findUnique({ where: { id: p.submission.id }, include: { images: true, assessment: true, patient: true } });
    expect(c).toMatchObject({ status: 'SYNCED', submittedById: chw.user.id, priority: null });
    expect(c!.createdAt.toISOString()).toBe(p.submission.createdAt);
    expect(c!.syncedAt.toISOString()).toBe(h.clock.now().toISOString());
    expect(c!.images).toHaveLength(4);
    expect(c!.assessment).toMatchObject({ painLevel: 7, duration: 'DAYS_1_TO_7' });
    expect(c!.patient).toMatchObject({ anonId: p.submission.patient.anonId, age: 41, location: 'Narok', sex: 'FEMALE', registeredById: chw.user.id });
  });

  it('NFR 1: the patient name is stored encrypted', async () => {
    const p = makePayload();
    await uploadAll(p);
    const patient = await h.db.patient.findUnique({ where: { id: p.submission.patient.id } });
    expect(patient!.nameEncrypted).not.toContain('Wanjiru');
    expect(patient!.nameEncrypted.startsWith('v1:')).toBe(true);
  });

  it('FR 5.2: posting again returns 200 and creates no duplicates', async () => {
    const p = makePayload();
    expect((await uploadAll(p)).status).toBe(201);
    const again = await post(chw.token, p.submission);
    expect(again.status).toBe(200);
    expect(await h.db.oralImage.count({ where: { caseId: p.submission.id } })).toBe(3);
  });

  it('FR 5.2: re-uploading an image that is already stored is skipped with 200', async () => {
    const p = makePayload();
    await uploadAll(p);
    expect((await put(chw.token, p.submission.id, p.images[0]!)).status).toBe(200);
  });

  it('the CHW cannot change a case after it syncs: a changed retry gets 200 and changes nothing', async () => {
    const p = makePayload();
    await uploadAll(p);
    const changed = { ...p.submission, assessment: { ...p.submission.assessment, painLevel: 1 } };
    expect((await post(chw.token, changed)).status).toBe(200);
    expect((await h.db.symptomAssessment.findUnique({ where: { caseId: p.submission.id } }))!.painLevel).toBe(7);
  });

  it("another CHW cannot reuse a stored case's id", async () => {
    const p = makePayload();
    await uploadAll(p);
    expect((await post(otherChw.token, p.submission)).status).toBe(409);
  });

  it("images uploaded by one CHW cannot be claimed by another", async () => {
    const p = makePayload();
    for (const img of p.images) await put(chw.token, p.submission.id, img);
    const res = await post(otherChw.token, p.submission);
    expect(res.status).toBe(409);
    expect(res.body.missingImageIds).toHaveLength(3);
  });

  it('rejects a case without the 3 required views (FR 3.2) or without consent (FR 2.3)', async () => {
    const p = makePayload();
    const noLower = { ...p.submission, images: p.submission.images.filter((i) => i.viewType !== 'LOWER_ARCH') };
    expect((await post(chw.token, noLower)).status).toBe(400);
    const noConsent = { ...p.submission, patient: { ...p.submission.patient, consentGiven: false } };
    expect((await post(chw.token, noConsent as unknown as CaseSubmission)).status).toBe(400);
  });

  it('rejects a case whose image metadata does not match the uploaded bytes', async () => {
    const p = makePayload();
    for (const img of p.images) await put(chw.token, p.submission.id, img);
    const wrongSize = { ...p.submission, images: p.submission.images.map((m, i) => (i === 0 ? { ...m, sizeKB: m.sizeKB + 5 } : m)) };
    expect((await post(chw.token, wrongSize)).status).toBe(400);
  });

  it('FR 3.3: rejects a case whose images add up to more than 2 MB', async () => {
    const p = makePayload({ size: 700_000 });
    const res = await uploadAll(p);
    expect(res.status).toBe(413);
    expect(await h.db.case.findUnique({ where: { id: p.submission.id } })).toBeNull();
  });

  it('FR 8.2: uploads and submissions are audited', async () => {
    const p = makePayload();
    await uploadAll(p);
    const actions = (await auditFor(h.db, chw.user.id)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['case:submit', 'case:uploadImage']));
  });
});

describe('GET /cases/{id}/triage (FR 7.3 pull)', () => {
  it('returns Synced with no priority before review, then the dentist result after', async () => {
    const p = makePayload();
    await uploadAll(p);
    const get = () => h.http().get(`/cases/${p.submission.id}/triage`).set('Authorization', `Bearer ${chw.token}`);
    expect((await get()).body).toEqual({ caseId: p.submission.id, status: 'SYNCED', priority: null, reviewedAt: null, notes: [] });

    const reviewedAt = new Date('2026-10-28T12:00:00.000Z');
    const noteId = randomUUID();
    await h.db.case.update({ where: { id: p.submission.id }, data: { status: 'REVIEWED', priority: 'URGENT', reviewedById: dentist.user.id, reviewedAt } });
    await h.db.clinicalNote.create({ data: { id: noteId, caseId: p.submission.id, authorId: dentist.user.id, noteText: 'Refer to Narok County Referral Hospital.', referralAdvice: 'Within 48 hours', createdAt: reviewedAt } });

    expect((await get()).body).toEqual({
      caseId: p.submission.id, status: 'REVIEWED', priority: 'URGENT', reviewedAt: reviewedAt.toISOString(),
      notes: [{ id: noteId, noteText: 'Refer to Narok County Referral Hospital.', referralAdvice: 'Within 48 hours', createdAt: reviewedAt.toISOString() }],
    });
  });

  it('is 404 for a case the server does not have', async () => {
    expect((await h.http().get(`/cases/${randomUUID()}/triage`).set('Authorization', `Bearer ${chw.token}`)).status).toBe(404);
  });
});

/**
 * The real SyncEngine and HttpSyncTransport against the real API, with the
 * connection failing at the worst moments. Every case must arrive exactly once.
 */
describe('end to end: engine + transport + API (FR 5.1, 5.2, 5.3)', () => {
  function supertestClient(token: () => string, fault: { dropResponseOf?: (path: string, method: string) => boolean; offline?: boolean } = {}): HttpClient {
    return async (req) => {
      if (fault.offline) throw new NetworkError();
      let r = h.http()[req.method.toLowerCase() as 'get' | 'post' | 'put'](req.path).set('Authorization', `Bearer ${token()}`);
      for (const [k, v] of Object.entries(req.headers ?? {})) r = r.set(k, v);
      if (req.bytes) r = r.set('Content-Type', 'application/octet-stream').send(Buffer.from(req.bytes));
      else if (req.json !== undefined) r = r.send(req.json as object);
      const res = await r;
      // The server did the work, but the phone never hears back.
      if (fault.dropResponseOf?.(req.path, req.method)) throw new NetworkError();
      return { status: res.status, body: res.body };
    };
  }

  it('offline: nothing is sent and the case stays Pending', async () => {
    const store = new MemorySyncStore();
    const p = makePayload();
    store.addPending(p);
    const engine = new SyncEngine({ store, transport: new HttpSyncTransport(supertestClient(() => chw.token, { offline: true })), now: h.clock.now });
    expect((await engine.runOnce()).offline).toBe(true);
    expect(store.get(p.submission.id).status).toBe('PENDING');
  });

  it('a response lost after the server stored the case: the retry gets 200 and the phone marks it Synced', async () => {
    const store = new MemorySyncStore();
    const p = makePayload();
    store.addPending(p);
    let posts = 0;
    const flaky = supertestClient(() => chw.token, { dropResponseOf: (path, m) => path === '/cases' && m === 'POST' && ++posts === 2 });
    const engine = new SyncEngine({ store, transport: new HttpSyncTransport(flaky), now: h.clock.now });
    expect((await engine.runOnce()).offline).toBe(true);
    expect(store.get(p.submission.id).status).toBe('PENDING');
    expect((await h.db.case.findUnique({ where: { id: p.submission.id } }))?.status).toBe('SYNCED');

    expect((await engine.runOnce({ force: true })).uploaded).toEqual([p.submission.id]);
    expect(store.get(p.submission.id).status).toBe('SYNCED');
    expect(await h.db.case.count({ where: { id: p.submission.id } })).toBe(1);
  });

  it('a connection that drops mid-way through the photos: the retry sends only the photos still missing', async () => {
    const store = new MemorySyncStore();
    const p = makePayload();
    store.addPending(p);
    const puts: string[] = [];
    let dropped = false;
    const base = supertestClient(() => chw.token);
    const http: HttpClient = async (req) => {
      if (req.method === 'PUT') {
        puts.push(req.path.split('/').pop()!);
        if (puts.length === 2 && !dropped) {
          dropped = true;
          throw new NetworkError(); // second photo never arrives
        }
      }
      return base(req);
    };
    const engine = new SyncEngine({ store, transport: new HttpSyncTransport(http), now: h.clock.now });
    await engine.runOnce();
    await engine.runOnce({ force: true });
    expect(store.get(p.submission.id).status).toBe('SYNCED');
    const [first, second, third] = p.images.map((i) => i.id);
    expect(puts).toEqual([first, second, second, third]);
  });

  it('pulls the dentist result and the phone shows Reviewed (server wins)', async () => {
    const store = new MemorySyncStore();
    const p = makePayload();
    store.addPending(p);
    const engine = new SyncEngine({ store, transport: new HttpSyncTransport(supertestClient(() => chw.token)), now: h.clock.now });
    await engine.runOnce();
    await h.db.case.update({ where: { id: p.submission.id }, data: { status: 'REVIEWED', priority: 'EMERGENCY', reviewedById: dentist.user.id, reviewedAt: h.clock.now() } });
    expect((await engine.runOnce()).reviewed).toEqual([p.submission.id]);
    expect(store.get(p.submission.id)).toMatchObject({ status: 'REVIEWED', priority: 'EMERGENCY' });
  });

  it('an expired token stops the run with authRequired and loses nothing', async () => {
    const store = new MemorySyncStore();
    const p = makePayload();
    store.addPending(p);
    const engine = new SyncEngine({ store, transport: new HttpSyncTransport(supertestClient(() => 'expired.token.value')), now: h.clock.now });
    expect((await engine.runOnce()).authRequired).toBe(true);
    expect(store.get(p.submission.id)).toMatchObject({ status: 'PENDING', needsAttention: false });
  });
});
