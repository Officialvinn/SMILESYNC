/**
 * In-memory stand-in for the SmileSync API, used to test the sync engine.
 * It follows the server rules: idempotent upsert keyed on the client UUID,
 * and the server never holds a PENDING case. Faults can be injected to
 * simulate rural connectivity.
 */
import type { TriageResult } from '../domain/schemas.js';
import { MAX_SUBMISSION_BYTES } from '../domain/enums.js';
import { NetworkError, type SyncTransport, type UploadOutcome, type UploadPayload } from '../sync/types.js';
import { payloadBytes } from '../sync/engine.js';

export type Fault =
  | 'offline' // request never reaches the server
  | 'dropAfterCommit' // server stores the case, then the response is lost
  | 'serverError'
  | 'unauthorized';

interface StoredCase {
  payload: UploadPayload;
  triage: TriageResult;
}

export class FakeServer implements SyncTransport {
  readonly cases = new Map<string, StoredCase>();
  /** Every upload request that reached the server (including duplicates). */
  uploadRequests = 0;
  private faults: Fault[] = [];
  private alwaysOffline = false;

  /** Queue faults for the next requests, in order. */
  failNext(...faults: Fault[]): void {
    this.faults.push(...faults);
  }

  setOffline(offline: boolean): void {
    this.alwaysOffline = offline;
  }

  private nextFault(): Fault | undefined {
    if (this.alwaysOffline) return 'offline';
    return this.faults.shift();
  }

  async uploadCase(payload: UploadPayload): Promise<UploadOutcome> {
    const fault = this.nextFault();
    if (fault === 'offline') throw new NetworkError();
    if (fault === 'unauthorized') return { kind: 'unauthorized' };
    if (fault === 'serverError') return { kind: 'serverError', status: 503, message: 'Service unavailable' };

    this.uploadRequests++;
    const id = payload.submission.id;
    if (payloadBytes(payload) > MAX_SUBMISSION_BYTES) {
      return { kind: 'rejected', status: 413, message: 'Submission over 2 MB' };
    }
    let outcome: UploadOutcome;
    if (this.cases.has(id)) {
      outcome = { kind: 'alreadyStored' };
    } else {
      this.cases.set(id, {
        payload: structuredClone(payload),
        triage: { caseId: id, status: 'SYNCED', priority: null, reviewedAt: null, notes: [] },
      });
      outcome = { kind: 'created' };
    }
    if (fault === 'dropAfterCommit') throw new NetworkError('Connection dropped');
    return outcome;
  }

  async fetchTriage(caseIds: string[]): Promise<TriageResult[] | { kind: 'unauthorized' }> {
    const fault = this.nextFault();
    if (fault === 'offline' || fault === 'dropAfterCommit') throw new NetworkError();
    if (fault === 'unauthorized') return { kind: 'unauthorized' };
    if (fault === 'serverError') throw new NetworkError('Server error');
    return caseIds.flatMap((id) => {
      const c = this.cases.get(id);
      return c ? [structuredClone(c.triage)] : [];
    });
  }

  /** What a dentist does on the dashboard (FR 7.1, 7.2). */
  triage(caseId: string, priority: TriageResult['priority'], noteText: string, at: string): void {
    const c = this.cases.get(caseId);
    if (!c) throw new Error(`No case ${caseId}`);
    c.triage = {
      caseId,
      status: 'REVIEWED',
      priority,
      reviewedAt: at,
      notes: [...c.triage.notes, { id: crypto.randomUUID(), noteText, referralAdvice: null, createdAt: at }],
    };
  }
}
