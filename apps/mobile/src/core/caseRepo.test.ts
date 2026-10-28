/**
 * FR 2 + FR 3 + FR 4.2: a registered patient and their photos are saved on the
 * phone as a draft case, inside the encrypted database (NFR 1).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { PatientInput } from '@smilesync/shared';
import { openMemoryDb, seqRandom, testUuid } from '../../test/nodeSqlite';
import { CaseLockedError, CaseRepo, ExtraLimitError, SubmissionTooLargeError } from './caseRepo';
import { IMAGE_BUDGET_BYTES, MAX_EXTRA_IMAGES, PER_IMAGE_MAX_BYTES } from './compression';
import { migrate } from './localDb';
import { buildPatient, recordConsent } from './registration';

const CHW_A = '11111111-1111-4111-8111-111111111111';
const CHW_B = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-28T09:05:00.000Z';
// One shared source, so each fixture patient gets a different anonymised ID.
const random = seqRandom();

function patient(name = 'Amina Test'): PatientInput {
  const r = buildPatient({ name, age: '34', location: 'Narok', sex: '' }, recordConsent(new Date(NOW)), {
    uuid: testUuid,
    randomBytes: random,
  });
  if (!r.ok) throw new Error('bad fixture');
  return r.patient;
}

const jpeg = (size: number, fill = 1) => new Uint8Array(size).fill(fill);
const sha = (c: string) => c.repeat(64);

describe('CaseRepo', () => {
  let repo: CaseRepo;
  let db: ReturnType<typeof openMemoryDb>;

  beforeEach(async () => {
    db = openMemoryDb();
    await migrate(db);
    repo = new CaseRepo(db, { uuid: testUuid, now: () => NOW });
  });

  async function draftWithViews(chw = CHW_A) {
    const caseId = await repo.startCase(patient(), chw);
    for (const [view, c] of [['FRONT', 'a'], ['UPPER_ARCH', 'b'], ['LOWER_ARCH', 'c']] as const) {
      await repo.saveImage(caseId, { viewType: view, bytes: jpeg(1000), sha256: sha(c), capturedAt: NOW });
    }
    return caseId;
  }

  it('startCase saves the patient and an empty draft case', async () => {
    const p = patient();
    const caseId = await repo.startCase(p, CHW_A);
    const c = await repo.getCase(caseId, CHW_A);
    expect(c).toMatchObject({
      id: caseId,
      isDraft: true,
      status: 'PENDING',
      patient: { anonId: p.anonId, name: 'Amina Test', age: 34, location: 'Narok', consentDate: NOW },
      images: [],
    });
  });

  it('stores image bytes in the database, not as loose files', async () => {
    const caseId = await draftWithViews();
    const images = await repo.listImages(caseId);
    expect(images.map((i) => i.viewType)).toEqual(['FRONT', 'UPPER_ARCH', 'LOWER_ARCH']);
    expect(images[0]).not.toHaveProperty('bytes');
    const bytes = await repo.getImageBytes(images[0]!.id);
    expect(bytes).toEqual(jpeg(1000));
  });

  it('a retake replaces the earlier photo of that view', async () => {
    const caseId = await draftWithViews();
    await repo.saveImage(caseId, { viewType: 'FRONT', bytes: jpeg(500, 9), sha256: sha('d'), capturedAt: NOW });
    const fronts = (await repo.listImages(caseId)).filter((i) => i.viewType === 'FRONT');
    expect(fronts).toHaveLength(1);
    expect(fronts[0]!.sha256).toBe(sha('d'));
    expect(fronts[0]!.sizeBytes).toBe(500);
  });

  it(`allows up to ${MAX_EXTRA_IMAGES} extra photos`, async () => {
    const caseId = await draftWithViews();
    for (let i = 0; i < MAX_EXTRA_IMAGES; i++) {
      await repo.saveImage(caseId, { viewType: 'EXTRA', bytes: jpeg(10), sha256: sha('e'), capturedAt: NOW });
    }
    await expect(
      repo.saveImage(caseId, { viewType: 'EXTRA', bytes: jpeg(10), sha256: sha('e'), capturedAt: NOW }),
    ).rejects.toBeInstanceOf(ExtraLimitError);
  });

  it('FR 3.3: refuses a photo that would push the case over the image budget', async () => {
    const caseId = await repo.startCase(patient(), CHW_A);
    await expect(
      repo.saveImage(caseId, { viewType: 'FRONT', bytes: jpeg(PER_IMAGE_MAX_BYTES + 1), sha256: sha('a'), capturedAt: NOW }),
    ).rejects.toBeInstanceOf(SubmissionTooLargeError);
    expect(await repo.totalImageBytes(caseId)).toBe(0);
    expect(PER_IMAGE_MAX_BYTES * 6).toBeLessThanOrEqual(IMAGE_BUDGET_BYTES);
  });

  it('deleteImage removes an extra photo from a draft', async () => {
    const caseId = await draftWithViews();
    const extraId = await repo.saveImage(caseId, { viewType: 'EXTRA', bytes: jpeg(10), sha256: sha('e'), capturedAt: NOW });
    await repo.deleteImage(caseId, extraId);
    expect((await repo.listImages(caseId)).some((i) => i.id === extraId)).toBe(false);
  });

  it('a case that has left the draft stage cannot be changed (CHW cannot edit after sync)', async () => {
    const caseId = await draftWithViews();
    await db.runAsync('UPDATE cases SET submitted_at = ? WHERE id = ?', [NOW, caseId]);
    const img = (await repo.listImages(caseId))[0]!;
    await expect(
      repo.saveImage(caseId, { viewType: 'FRONT', bytes: jpeg(10), sha256: sha('f'), capturedAt: NOW }),
    ).rejects.toBeInstanceOf(CaseLockedError);
    await expect(repo.deleteImage(caseId, img.id)).rejects.toBeInstanceOf(CaseLockedError);
    await expect(repo.discardDraft(caseId, CHW_A)).rejects.toBeInstanceOf(CaseLockedError);
  });

  it('discardDraft deletes the patient and photos, for when consent is withdrawn', async () => {
    const caseId = await draftWithViews();
    await repo.discardDraft(caseId, CHW_A);
    for (const t of ['patients', 'cases', 'images']) {
      expect(await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${t}`)).toEqual({ n: 0 });
    }
  });

  it('each CHW sees only their own cases, newest first', async () => {
    const first = await draftWithViews(CHW_A);
    const second = await repo.startCase(patient('Baraka Test'), CHW_A);
    await repo.startCase(patient('Other Test'), CHW_B);
    await db.runAsync('UPDATE cases SET created_at = ? WHERE id = ?', ['2026-10-28T10:00:00.000Z', second]);
    const list = await repo.listCases(CHW_A);
    expect(list.map((c) => c.id)).toEqual([second, first]);
    expect(list[1]).toMatchObject({ patientName: 'Amina Test', isDraft: true, imageCount: 3, canFinish: true });
    expect(list[0]).toMatchObject({ imageCount: 0, canFinish: false });
    await expect(repo.getCase(first, CHW_B)).resolves.toBeNull();
  });

  it('the database rejects a patient row without consent', async () => {
    await expect(
      db.runAsync(
        `INSERT INTO patients (id, anon_id, name, age, location, consent_given, consent_date, registered_by, created_at)
         VALUES ('x', 'SS-AAAA-AAAA', 'n', 1, 'Narok', 0, ?, ?, ?)`,
        [NOW, CHW_A, NOW],
      ),
    ).rejects.toThrow(/CHECK/);
  });
});
