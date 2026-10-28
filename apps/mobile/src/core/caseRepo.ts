/**
 * FR 2, FR 3, FR 4.2: patients, draft cases and their photos on the phone.
 *
 * Photos are stored as BLOBs inside the SQLCipher database rather than as
 * files, so they are encrypted at rest by the same AES-256 key as everything
 * else (NFR 1) with no second encryption scheme to get wrong.
 *
 * A case can change only while it is a draft. Once submitted it is locked:
 * the CHW cannot edit a case after it syncs, and the server's review wins.
 */
import type { CaseStatus, PatientInput, Sex, ViewType } from '@smilesync/shared';
import { captureProgress } from './capturePlan';
import { IMAGE_BUDGET_BYTES, MAX_EXTRA_IMAGES, PER_IMAGE_MAX_BYTES } from './compression';
import type { SqlDb } from './ports';

export class CaseLockedError extends Error {
  constructor() {
    super('This case has been sent and can no longer be changed.');
    this.name = 'CaseLockedError';
  }
}

export class ExtraLimitError extends Error {
  constructor() {
    super(`You can add up to ${MAX_EXTRA_IMAGES} extra photos.`);
    this.name = 'ExtraLimitError';
  }
}

export class SubmissionTooLargeError extends Error {
  constructor() {
    super('This photo is too large to send. Retake it.');
    this.name = 'SubmissionTooLargeError';
  }
}

export interface NewImage {
  viewType: ViewType;
  bytes: Uint8Array;
  sha256: string;
  capturedAt: string;
}

export interface ImageMeta {
  id: string;
  viewType: ViewType;
  sizeBytes: number;
  sha256: string;
  capturedAt: string;
}

export interface LocalPatient {
  id: string;
  anonId: string;
  name: string;
  age: number;
  location: string;
  sex: Sex | null;
  consentDate: string;
}

export interface CaseDetail {
  id: string;
  createdAt: string;
  isDraft: boolean;
  status: CaseStatus;
  patient: LocalPatient;
  images: ImageMeta[];
}

export interface CaseListItem {
  id: string;
  createdAt: string;
  isDraft: boolean;
  status: CaseStatus;
  anonId: string;
  patientName: string;
  imageCount: number;
  canFinish: boolean;
}

interface CaseRow {
  id: string;
  created_at: string;
  submitted_at: string | null;
  status: CaseStatus;
  patient_id: string;
  anon_id: string;
  name: string;
  age: number;
  location: string;
  sex: Sex | null;
  consent_date: string;
}

const IMAGE_COLUMNS = 'id, view_type AS viewType, size_bytes AS sizeBytes, sha256, captured_at AS capturedAt';

export class CaseRepo {
  constructor(
    private readonly db: SqlDb,
    private readonly deps: { uuid: () => string; now: () => string },
  ) {}

  /** Saves the patient (with consent) and an empty draft case in one transaction. Returns the case id. */
  async startCase(p: PatientInput, chwId: string): Promise<string> {
    const caseId = this.deps.uuid();
    const now = this.deps.now();
    await this.db.transaction(async (tx) => {
      await tx.runAsync(
        `INSERT INTO patients (id, anon_id, name, age, location, sex, consent_given, consent_date, registered_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [p.id, p.anonId, p.name, p.age, p.location, p.sex ?? null, p.consentDate, chwId, now],
      );
      await tx.runAsync('INSERT INTO cases (id, patient_id, chw_id, created_at) VALUES (?, ?, ?, ?)', [
        caseId, p.id, chwId, now,
      ]);
    });
    return caseId;
  }

  async getCase(caseId: string, chwId: string): Promise<CaseDetail | null> {
    const row = await this.db.getFirstAsync<CaseRow>(
      `SELECT c.id, c.created_at, c.submitted_at, c.status, p.id AS patient_id, p.anon_id, p.name, p.age,
              p.location, p.sex, p.consent_date
         FROM cases c JOIN patients p ON p.id = c.patient_id
        WHERE c.id = ? AND c.chw_id = ?`,
      [caseId, chwId],
    );
    if (!row) return null;
    return {
      id: row.id,
      createdAt: row.created_at,
      isDraft: row.submitted_at === null,
      status: row.status,
      patient: {
        id: row.patient_id,
        anonId: row.anon_id,
        name: row.name,
        age: row.age,
        location: row.location,
        sex: row.sex,
        consentDate: row.consent_date,
      },
      images: await this.listImages(caseId),
    };
  }

  /** The CHW's own cases, newest first. */
  async listCases(chwId: string): Promise<CaseListItem[]> {
    const rows = await this.db.getAllAsync<CaseRow & { views: string | null }>(
      `SELECT c.id, c.created_at, c.submitted_at, c.status, p.anon_id, p.name,
              (SELECT group_concat(view_type) FROM images i WHERE i.case_id = c.id) AS views
         FROM cases c JOIN patients p ON p.id = c.patient_id
        WHERE c.chw_id = ?
        ORDER BY c.created_at DESC`,
      [chwId],
    );
    return rows.map((r) => {
      const views = r.views ? (r.views.split(',') as ViewType[]) : [];
      return {
        id: r.id,
        createdAt: r.created_at,
        isDraft: r.submitted_at === null,
        status: r.status,
        anonId: r.anon_id,
        patientName: r.name,
        imageCount: views.length,
        canFinish: captureProgress(views).canFinish,
      };
    });
  }

  async listImages(caseId: string): Promise<ImageMeta[]> {
    return this.db.getAllAsync<ImageMeta>(
      `SELECT ${IMAGE_COLUMNS} FROM images WHERE case_id = ?
        ORDER BY CASE view_type WHEN 'FRONT' THEN 0 WHEN 'UPPER_ARCH' THEN 1 WHEN 'LOWER_ARCH' THEN 2 ELSE 3 END, captured_at`,
      [caseId],
    );
  }

  async getImageBytes(imageId: string): Promise<Uint8Array | null> {
    const row = await this.db.getFirstAsync<{ bytes: Uint8Array }>('SELECT bytes FROM images WHERE id = ?', [imageId]);
    return row?.bytes ?? null;
  }

  async totalImageBytes(caseId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ n: number }>(
      'SELECT coalesce(sum(size_bytes), 0) AS n FROM images WHERE case_id = ?',
      [caseId],
    );
    return row?.n ?? 0;
  }

  /**
   * Saves a compressed photo. A required view replaces any earlier photo of
   * that view (a retake). Returns the new image id.
   */
  async saveImage(caseId: string, img: NewImage): Promise<string> {
    if (img.bytes.byteLength > PER_IMAGE_MAX_BYTES) throw new SubmissionTooLargeError();
    const id = this.deps.uuid();
    await this.db.transaction(async (tx) => {
      await assertDraft(tx, caseId);
      if (img.viewType === 'EXTRA') {
        const n = await tx.getFirstAsync<{ n: number }>(
          "SELECT count(*) AS n FROM images WHERE case_id = ? AND view_type = 'EXTRA'",
          [caseId],
        );
        if ((n?.n ?? 0) >= MAX_EXTRA_IMAGES) throw new ExtraLimitError();
      } else {
        await tx.runAsync('DELETE FROM images WHERE case_id = ? AND view_type = ?', [caseId, img.viewType]);
      }
      const used = await tx.getFirstAsync<{ n: number }>(
        'SELECT coalesce(sum(size_bytes), 0) AS n FROM images WHERE case_id = ?',
        [caseId],
      );
      if ((used?.n ?? 0) + img.bytes.byteLength > IMAGE_BUDGET_BYTES) throw new SubmissionTooLargeError();
      await tx.runAsync(
        'INSERT INTO images (id, case_id, view_type, bytes, size_bytes, sha256, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, caseId, img.viewType, img.bytes, img.bytes.byteLength, img.sha256, img.capturedAt],
      );
    });
    return id;
  }

  async deleteImage(caseId: string, imageId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await assertDraft(tx, caseId);
      await tx.runAsync('DELETE FROM images WHERE id = ? AND case_id = ?', [imageId, caseId]);
    });
  }

  /**
   * Deletes a draft with its photos and patient. Used when the patient
   * withdraws consent before the case is sent (Kenya DPA 2019).
   */
  async discardDraft(caseId: string, chwId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await assertDraft(tx, caseId, chwId);
      await tx.runAsync('DELETE FROM images WHERE case_id = ?', [caseId]);
      await tx.runAsync('DELETE FROM cases WHERE id = ?', [caseId]);
      await tx.runAsync('DELETE FROM patients WHERE id = ? AND NOT EXISTS (SELECT 1 FROM cases WHERE patient_id = ?)', [
        row.patient_id, row.patient_id,
      ]);
    });
  }
}

async function assertDraft(tx: SqlDb, caseId: string, chwId?: string): Promise<{ patient_id: string }> {
  const row = await tx.getFirstAsync<{ submitted_at: string | null; patient_id: string; chw_id: string }>(
    'SELECT submitted_at, patient_id, chw_id FROM cases WHERE id = ?',
    [caseId],
  );
  if (!row || (chwId !== undefined && row.chw_id !== chwId)) throw new Error('Case not found');
  if (row.submitted_at !== null) throw new CaseLockedError();
  return row;
}
