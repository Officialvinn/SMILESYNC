/**
 * Contracts for the offline sync engine (FR 4.2, FR 5.1-5.3, FR 7.3).
 *
 * The engine is plain TypeScript with no React Native or network code, so it
 * runs in Node tests. The mobile app supplies a SQLite-backed SyncStore and an
 * HTTPS SyncTransport in Sprint 2.
 */
import type { CaseStatus, Priority } from '../domain/enums.js';
import type { CaseSubmission, TriageResult } from '../domain/schemas.js';

/** A case as the phone sees it. Mirrors the SyncQueue/Case classes (B.2). */
export interface LocalCase {
  id: string;
  status: CaseStatus;
  createdAt: string;
  /** Upload attempts that failed. Reset to 0 once synced. */
  attempts: number;
  lastAttemptAt: string | null;
  /** Earliest time the engine will retry this case automatically. */
  nextAttemptAt: string | null;
  /** Last failure, shown to the CHW as an actionable message. */
  lastError: string | null;
  /**
   * True when the server rejected the case as invalid. Retrying will not help,
   * so automatic retries stop, but the case stays Pending and is never deleted.
   */
  needsAttention: boolean;
  syncedAt: string | null;
  priority: Priority | null;
  reviewedAt: string | null;
  notes: TriageResult['notes'];
}

export interface UploadImage {
  id: string;
  bytes: Uint8Array;
}

/** Everything one POST /cases needs: JSON plus the compressed image bytes. */
export interface UploadPayload {
  submission: CaseSubmission;
  images: UploadImage[];
}

export interface SyncStore {
  /** Cases in a status, oldest first. */
  listByStatus(status: CaseStatus): Promise<LocalCase[]>;
  loadPayload(caseId: string): Promise<UploadPayload>;
  markSynced(caseId: string, syncedAt: string): Promise<void>;
  recordFailure(
    caseId: string,
    failure: { attempts: number; lastAttemptAt: string; nextAttemptAt: string | null; error: string; needsAttention: boolean },
  ): Promise<void>;
  /** Server wins: overwrite local priority and notes, set status REVIEWED. */
  applyTriage(caseId: string, result: TriageResult): Promise<void>;
}

/**
 * Outcome of one upload attempt. A transport throws NetworkError when it got
 * no HTTP response at all (offline, timeout, connection dropped).
 */
export type UploadOutcome =
  | { kind: 'created' } // 201: stored for the first time
  | { kind: 'alreadyStored' } // 200: an earlier attempt already stored it (FR 5.2)
  | { kind: 'unauthorized' } // 401: token expired or account deactivated
  | { kind: 'rejected'; status: number; message: string } // 4xx: invalid, will not succeed on retry
  | { kind: 'serverError'; status: number; message: string }; // 5xx / 429: try again later

export interface SyncTransport {
  uploadCase(payload: UploadPayload): Promise<UploadOutcome>;
  /**
   * Fetch triage results for the given synced cases. Returns one entry per
   * case the server knows about. Throws NetworkError when offline.
   */
  fetchTriage(caseIds: string[]): Promise<TriageResult[] | { kind: 'unauthorized' }>;
}

export class NetworkError extends Error {
  constructor(message = 'Network unavailable') {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface SyncReport {
  uploaded: string[];
  failed: string[];
  needsAttention: string[];
  reviewed: string[];
  /** The run stopped because the device is offline. */
  offline: boolean;
  /** The run stopped because the CHW must log in online again. */
  authRequired: boolean;
}
