/**
 * FR 4.2, 5.1-5.3, 7.3: the sync engine's store on the phone, over the
 * SQLCipher database. Behaves like MemorySyncStore in packages/shared, which
 * the engine's tests use as the reference.
 *
 * Scoped to one CHW: the upload uses that CHW's token, so only their cases go.
 * Drafts (submitted_at IS NULL) are never listed, so they are never sent.
 */
import type { CaseStatus, CaseSubmission, Sex, SymptomDuration, TriageResult, ViewType } from '@smilesync/shared';
import type { LocalCase, SyncStore, UploadPayload } from '@smilesync/shared';
import type { SqlDb } from './ports';

interface Row {
  id: string;
  status: CaseStatus;
  created_at: string;
  attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  last_error: string | null;
  needs_attention: number;
  synced_at: string | null;
  priority: LocalCase['priority'];
  reviewed_at: string | null;
  notes_json: string;
}

const toLocal = (r: Row): LocalCase => ({
  id: r.id,
  status: r.status,
  createdAt: r.created_at,
  attempts: r.attempts,
  lastAttemptAt: r.last_attempt_at,
  nextAttemptAt: r.next_attempt_at,
  lastError: r.last_error,
  needsAttention: r.needs_attention === 1,
  syncedAt: r.synced_at,
  priority: r.priority,
  reviewedAt: r.reviewed_at,
  notes: JSON.parse(r.notes_json) as TriageResult['notes'],
});

export class SqliteSyncStore implements SyncStore {
  constructor(
    private readonly db: SqlDb,
    private readonly chwId: string,
  ) {}

  async listByStatus(status: CaseStatus): Promise<LocalCase[]> {
    const rows = await this.db.getAllAsync<Row>(
      `SELECT * FROM cases WHERE status = ? AND chw_id = ? AND submitted_at IS NOT NULL ORDER BY created_at, id`,
      [status, this.chwId],
    );
    return rows.map(toLocal);
  }

  async loadPayload(caseId: string): Promise<UploadPayload> {
    const c = await this.db.getFirstAsync<{
      id: string; created_at: string; patient_id: string; anon_id: string; name: string; age: number;
      location: string; sex: Sex | null; consent_date: string;
    }>(
      `SELECT c.id, c.created_at, p.id AS patient_id, p.anon_id, p.name, p.age, p.location, p.sex, p.consent_date
         FROM cases c JOIN patients p ON p.id = c.patient_id
        WHERE c.id = ? AND c.chw_id = ? AND c.submitted_at IS NOT NULL`,
      [caseId, this.chwId],
    );
    if (!c) throw new Error(`No submitted case ${caseId}`);
    const a = await this.db.getFirstAsync<{ id: string; pain_level: number; duration: SymptomDuration }>(
      'SELECT id, pain_level, duration FROM assessments WHERE case_id = ?',
      [caseId],
    );
    if (!a) throw new Error(`Case ${caseId} has no assessment`);
    const imgs = await this.db.getAllAsync<{
      id: string; view_type: ViewType; bytes: Uint8Array; size_bytes: number; sha256: string; captured_at: string;
    }>(
      `SELECT id, view_type, bytes, size_bytes, sha256, captured_at FROM images WHERE case_id = ?
        ORDER BY CASE view_type WHEN 'FRONT' THEN 0 WHEN 'UPPER_ARCH' THEN 1 WHEN 'LOWER_ARCH' THEN 2 ELSE 3 END, captured_at, id`,
      [caseId],
    );

    const submission: CaseSubmission = {
      id: c.id,
      createdAt: c.created_at,
      patient: {
        id: c.patient_id,
        anonId: c.anon_id,
        name: c.name,
        age: c.age,
        location: c.location as CaseSubmission['patient']['location'],
        ...(c.sex ? { sex: c.sex } : {}),
        consentGiven: true,
        consentDate: c.consent_date,
      },
      images: imgs.map((i) => ({
        id: i.id,
        viewType: i.view_type,
        sizeKB: Math.ceil(i.size_bytes / 1024),
        capturedAt: i.captured_at,
        sha256: i.sha256,
      })),
      assessment: { id: a.id, painLevel: a.pain_level, duration: a.duration },
    };
    return { submission, images: imgs.map((i) => ({ id: i.id, bytes: i.bytes })) };
  }

  async markSynced(caseId: string, syncedAt: string): Promise<void> {
    // FR 5.3: never move a case backwards; a REVIEWED case stays REVIEWED.
    await this.db.runAsync(
      `UPDATE cases SET status = CASE WHEN status = 'PENDING' THEN 'SYNCED' ELSE status END,
              synced_at = ?, attempts = 0, next_attempt_at = NULL, last_error = NULL, needs_attention = 0
        WHERE id = ? AND chw_id = ?`,
      [syncedAt, caseId, this.chwId],
    );
  }

  async recordFailure(
    caseId: string,
    f: { attempts: number; lastAttemptAt: string; nextAttemptAt: string | null; error: string; needsAttention: boolean },
  ): Promise<void> {
    await this.db.runAsync(
      `UPDATE cases SET attempts = ?, last_attempt_at = ?, next_attempt_at = ?, last_error = ?, needs_attention = ?
        WHERE id = ? AND chw_id = ?`,
      [f.attempts, f.lastAttemptAt, f.nextAttemptAt, f.error, f.needsAttention ? 1 : 0, caseId, this.chwId],
    );
  }

  /** The server's review always wins. */
  async applyTriage(caseId: string, r: TriageResult): Promise<void> {
    await this.db.runAsync(
      `UPDATE cases SET status = 'REVIEWED', priority = ?, reviewed_at = ?, notes_json = ? WHERE id = ? AND chw_id = ?`,
      [r.priority, r.reviewedAt, JSON.stringify(r.notes), caseId, this.chwId],
    );
  }
}
