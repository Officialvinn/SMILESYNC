/**
 * Sprint 3, dentist side: FR 6.1 queue, FR 6.2 images, FR 6.3 filter/sort,
 * FR 7.1-7.3 triage, NFR 2 queue speed, FR 8.2 auditing. Dentists never get names.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { caseDetailSchema, generateAnonId, queueResponseSchema, triageResultSchema } from '@smilesync/shared';
import { auditFor, loginAs, makeHarness, submitSyntheticCase } from './helpers.js';

const h = makeHarness();
let chw: { user: { id: string; username: string }; token: string };
let dentist: { user: { id: string; username: string }; token: string };
let admin: { token: string };
const NAME = 'Synthetic Wairimu Kamau';

/** Ids created in this file, so other test files' cases do not interfere. */
const mine = new Set<string>();
async function make(o: Parameters<typeof submitSyntheticCase>[2] = {}) {
  const c = await submitSyntheticCase(h, chw.token, { name: NAME, ...o });
  mine.add(c.caseId);
  h.clock.advance(60_000);
  return c;
}

const asDentist = (path: string) => h.http().get(path).set('Authorization', `Bearer ${dentist.token}`);
const queue = async (qs = '') => {
  const res = await asDentist(`/cases?pageSize=100${qs}`);
  expect(res.status).toBe(200);
  const body = queueResponseSchema.parse(res.body);
  return { ...body, items: body.items.filter((i) => mine.has(i.id)) };
};
const triage = (caseId: string, body: object, token = dentist.token) =>
  h.http().put(`/cases/${caseId}/triage`).set('Authorization', `Bearer ${token}`).send(body);

let low: string, high: string, mid: string, kisumu: string;

beforeAll(async () => {
  chw = await loginAs(h, 'CHW');
  dentist = await loginAs(h, 'DENTIST');
  admin = await loginAs(h, 'ADMIN');
  low = (await make({ painLevel: 2 })).caseId;
  high = (await make({ painLevel: 9 })).caseId;
  mid = (await make({ painLevel: 5, sex: 'MALE' })).caseId;
  kisumu = (await make({ painLevel: 9, location: 'Kisumu' })).caseId;
});
afterAll(() => h.db.$disconnect());

describe('GET /cases: the dentist queue (FR 6.1, 6.3)', () => {
  it('lists cases waiting for review, highest pain first, then oldest', async () => {
    const { items } = await queue();
    expect(items.map((i) => i.id)).toEqual([high, kisumu, mid, low]);
    expect(items.find((i) => i.id === mid)).toMatchObject({ status: 'SYNCED', priority: null, painLevel: 5, sex: 'MALE', location: 'Narok', age: 30, imageCount: 3 });
  });

  it('never includes the patient name', async () => {
    const res = await asDentist('/cases?pageSize=100');
    expect(JSON.stringify(res.body)).not.toContain('Wairimu');
  });

  it('filters by county, and sorts by oldest or newest', async () => {
    expect((await queue('&location=Kisumu')).items.map((i) => i.id)).toEqual([kisumu]);
    expect((await queue('&sort=oldest')).items.map((i) => i.id)).toEqual([low, high, mid, kisumu]);
    expect((await queue('&sort=newest')).items.map((i) => i.id)).toEqual([kisumu, mid, high, low]);
  });

  it('filters by the day the server received the case', async () => {
    const day = h.clock.now().toISOString().slice(0, 10);
    expect((await queue(`&from=${day}&to=${day}`)).items).toHaveLength(4);
    expect((await queue('&to=2020-01-01')).items).toHaveLength(0);
  });

  it('pages the results', async () => {
    const res = await asDentist('/cases?pageSize=2&page=1');
    const body = queueResponseSchema.parse(res.body);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBeGreaterThanOrEqual(4);
  });

  it('rejects an unknown filter value', async () => {
    expect((await asDentist('/cases?sort=name')).status).toBe(400);
    expect((await asDentist('/cases?location=Atlantis')).status).toBe(400);
  });
});

describe('GET /cases/{id} and images (FR 6.2)', () => {
  it('returns the case without the name: age, sex, county, symptoms, consent date and photo list', async () => {
    const res = await asDentist(`/cases/${mid}`);
    expect(res.status).toBe(200);
    const body = caseDetailSchema.parse(res.body);
    expect(body).toMatchObject({ id: mid, age: 30, sex: 'MALE', location: 'Narok', painLevel: 5, duration: 'DAYS_1_TO_7', submittedBy: chw.user.username });
    expect(body.images.map((i) => i.viewType)).toEqual(['FRONT', 'UPPER_ARCH', 'LOWER_ARCH']);
    expect(JSON.stringify(res.body)).not.toContain('Wairimu');
  });

  it('serves each photo decrypted, as a JPEG that browsers must not cache', async () => {
    const c = await make();
    const detail = caseDetailSchema.parse((await asDentist(`/cases/${c.caseId}`)).body);
    const img = c.images.find((i) => i.id === detail.images[0]!.id)!;
    const res = await asDentist(`/cases/${c.caseId}/images/${img.id}`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (d: Buffer) => chunks.push(d));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Buffer.compare(res.body as Buffer, Buffer.from(img.bytes))).toBe(0);
  });

  it("an image id from a different case is 404", async () => {
    const a = await make();
    const b = await make();
    expect((await asDentist(`/cases/${a.caseId}/images/${b.images[0]!.id}`)).status).toBe(404);
  });

  it('FR 8.2: opening a case and a photo is audited with the ids', async () => {
    const c = await make();
    await asDentist(`/cases/${c.caseId}`);
    await asDentist(`/cases/${c.caseId}/images/${c.images[0]!.id}`);
    const log = await auditFor(h.db, dentist.user.id);
    expect(log.some((e) => e.action === 'case:read' && e.resourceId === c.caseId)).toBe(true);
    expect(log.some((e) => e.action === 'case:readImages' && e.resourceId === c.caseId)).toBe(true);
  });
});

describe('PUT /cases/{id}/triage (FR 7.1, 7.2)', () => {
  it('sets the priority, adds the note, and marks the case Reviewed; the CHW pulls the result (FR 7.3)', async () => {
    const c = await make();
    const noteId = randomUUID();
    const res = await triage(c.caseId, { priority: 'EMERGENCY', note: { id: noteId, noteText: 'Facial swelling. Needs care today.', referralAdvice: 'Go to the nearest hospital now.' } });
    expect(res.status).toBe(200);
    expect(triageResultSchema.parse(res.body)).toMatchObject({ status: 'REVIEWED', priority: 'EMERGENCY', notes: [{ id: noteId }] });
    const detail = caseDetailSchema.parse((await asDentist(`/cases/${c.caseId}`)).body);
    expect(detail).toMatchObject({ status: 'REVIEWED', priority: 'EMERGENCY', reviewedBy: dentist.user.username, notes: [{ author: dentist.user.username, referralAdvice: 'Go to the nearest hospital now.' }] });

    const pulled = await h.http().get(`/cases/${c.caseId}/triage`).set('Authorization', `Bearer ${chw.token}`);
    expect(pulled.body).toMatchObject({ status: 'REVIEWED', priority: 'EMERGENCY' });
    expect(pulled.body.notes[0].noteText).toBe('Facial swelling. Needs care today.');
  });

  it('a retried request with the same note id does not add the note twice', async () => {
    const c = await make();
    const body = { priority: 'URGENT', note: { id: randomUUID(), noteText: 'Decay on lower molars.' } };
    await triage(c.caseId, body);
    await triage(c.caseId, body);
    expect(await h.db.clinicalNote.count({ where: { caseId: c.caseId } })).toBe(1);
  });

  it('a later review can change the priority and add a second note', async () => {
    const c = await make();
    await triage(c.caseId, { priority: 'ROUTINE' });
    const res = await triage(c.caseId, { priority: 'URGENT', note: { id: randomUUID(), noteText: 'On second look, refer sooner.' } });
    expect(res.body).toMatchObject({ priority: 'URGENT', notes: [{ noteText: 'On second look, refer sooner.' }] });
  });

  it('reviewed cases leave the default queue and appear under Reviewed and by priority', async () => {
    const c = await make({ painLevel: 10 });
    await triage(c.caseId, { priority: 'EMERGENCY' });
    expect((await queue()).items.some((i) => i.id === c.caseId)).toBe(false);
    expect((await queue('&status=REVIEWED&priority=EMERGENCY')).items.map((i) => i.id)).toContain(c.caseId);
    const all = await queue('&status=ALL&sort=priority');
    expect(all.items[0]!.priority).toBe('EMERGENCY');
    expect(all.items.at(-1)!.priority).toBeNull();
  });

  it('rejects a missing priority or an empty note, and a note id used on another case', async () => {
    const c = await make();
    expect((await triage(c.caseId, {})).status).toBe(400);
    expect((await triage(c.caseId, { priority: 'URGENT', note: { id: randomUUID(), noteText: '  ' } })).status).toBe(400);
    const other = await make();
    const noteId = randomUUID();
    await triage(c.caseId, { priority: 'URGENT', note: { id: noteId, noteText: 'First case.' } });
    expect((await triage(other.caseId, { priority: 'URGENT', note: { id: noteId, noteText: 'Same id.' } })).status).toBe(409);
  });

  it('FR 1.2: CHWs and admins cannot triage', async () => {
    const c = await make();
    expect((await triage(c.caseId, { priority: 'URGENT' }, chw.token)).status).toBe(403);
    expect((await triage(c.caseId, { priority: 'URGENT' }, admin.token)).status).toBe(403);
  });
});

describe('NFR 2: the queue loads in under 3 seconds', () => {
  it('first page of a 500-case queue in well under 3 s on the server', async () => {
    const patients = Array.from({ length: 500 }, (_, i) => ({
      id: randomUUID(), anonId: generateAnonId(), nameEncrypted: 'v1:x:x:x', age: 20 + (i % 60), location: 'Turkana',
      consentGiven: true, consentDate: h.clock.now(), registeredById: chw.user.id,
    }));
    await h.db.patient.createMany({ data: patients });
    const cases = patients.map((p, i) => ({ id: randomUUID(), patientId: p.id, submittedById: chw.user.id, status: 'SYNCED' as const, createdAt: h.clock.now(), syncedAt: new Date(h.clock.now().getTime() + i) }));
    await h.db.case.createMany({ data: cases });
    await h.db.symptomAssessment.createMany({ data: cases.map((c, i) => ({ id: randomUUID(), caseId: c.id, painLevel: 1 + (i % 10), duration: 'DAYS_1_TO_7' as const })) });

    const t0 = performance.now();
    const res = await asDentist('/cases?pageSize=25');
    const ms = performance.now() - t0;
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(500);
    expect(ms).toBeLessThan(1000);
  });
});
