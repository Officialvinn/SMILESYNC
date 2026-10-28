/**
 * In-memory SyncStore. Used by tests and as the reference behaviour the
 * SQLite store on the phone must match (Sprint 2).
 */
import type { CaseStatus } from '../domain/enums.js';
import type { TriageResult } from '../domain/schemas.js';
import type { LocalCase, SyncStore, UploadPayload } from './types.js';

export class MemorySyncStore implements SyncStore {
  readonly cases = new Map<string, LocalCase>();
  private readonly payloads = new Map<string, UploadPayload>();

  /** FR 4.2: save a completed case locally with status PENDING. */
  addPending(payload: UploadPayload): LocalCase {
    const id = payload.submission.id;
    const local: LocalCase = {
      id,
      status: 'PENDING',
      createdAt: payload.submission.createdAt,
      attempts: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      lastError: null,
      needsAttention: false,
      syncedAt: null,
      priority: null,
      reviewedAt: null,
      notes: [],
    };
    this.cases.set(id, local);
    this.payloads.set(id, payload);
    return local;
  }

  get(id: string): LocalCase {
    const c = this.cases.get(id);
    if (!c) throw new Error(`No local case ${id}`);
    return c;
  }

  async listByStatus(status: CaseStatus): Promise<LocalCase[]> {
    return [...this.cases.values()]
      .filter((c) => c.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ ...c }));
  }

  async loadPayload(caseId: string): Promise<UploadPayload> {
    const p = this.payloads.get(caseId);
    if (!p) throw new Error(`No payload for ${caseId}`);
    return p;
  }

  async markSynced(caseId: string, syncedAt: string): Promise<void> {
    const c = this.get(caseId);
    // FR 5.3: never move a case backwards (a REVIEWED case stays REVIEWED).
    if (c.status === 'PENDING') c.status = 'SYNCED';
    Object.assign(c, { syncedAt, attempts: 0, nextAttemptAt: null, lastError: null, needsAttention: false });
  }

  async recordFailure(
    caseId: string,
    f: { attempts: number; lastAttemptAt: string; nextAttemptAt: string | null; error: string; needsAttention: boolean },
  ): Promise<void> {
    const c = this.get(caseId);
    Object.assign(c, {
      attempts: f.attempts,
      lastAttemptAt: f.lastAttemptAt,
      nextAttemptAt: f.nextAttemptAt,
      lastError: f.error,
      needsAttention: f.needsAttention,
    });
  }

  async applyTriage(caseId: string, r: TriageResult): Promise<void> {
    const c = this.get(caseId);
    Object.assign(c, { status: 'REVIEWED', priority: r.priority, reviewedAt: r.reviewedAt, notes: r.notes });
  }
}
