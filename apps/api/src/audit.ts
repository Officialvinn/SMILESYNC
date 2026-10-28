/**
 * FR 8.2: record every access to patient data with user, time and action.
 * Rows are append-only (DB trigger, NFR 4). Writes happen before the data is
 * served; if the write fails, the request fails (fail closed).
 */
import type { Db } from './db.js';

export type AuditOutcome = 'ALLOWED' | 'DENIED' | 'NOT_FOUND';

export interface AuditEntry {
  userId: string | null;
  action: string;
  outcome: AuditOutcome;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      outcome: entry.outcome,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
