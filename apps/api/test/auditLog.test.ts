/**
 * FR 8.2, NFR 4: the audit log cannot be edited or deleted, by anyone.
 * NFR 4, NFR 6: the API's runtime role has no DELETE privilege at all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import pg from 'pg';
import { recordAudit } from '../src/audit.js';
import { createCase, createUser, makeHarness } from './helpers.js';

const h = makeHarness();
const client = new pg.Client({ connectionString: inject('databaseUrl') });
let userId: string;

beforeAll(async () => {
  await client.connect();
  userId = (await createUser(h.db, 'ADMIN')).id;
  await recordAudit(h.db, { userId, action: 'test:entry', outcome: 'ALLOWED' });
});
afterAll(async () => {
  await client.end();
  await h.db.$disconnect();
});

describe('FR 8.2 append-only audit log (database trigger)', () => {
  it('rejects UPDATE', async () => {
    await expect(client.query(`UPDATE audit_log SET action = 'edited' WHERE "userId" = $1`, [userId])).rejects.toThrow(/append-only/);
  });

  it('rejects DELETE', async () => {
    await expect(client.query(`DELETE FROM audit_log WHERE "userId" = $1`, [userId])).rejects.toThrow(/append-only/);
  });

  it('rejects TRUNCATE', async () => {
    await expect(client.query('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
  });

  it('rejects edits through Prisma too', async () => {
    await expect(h.db.auditLog.updateMany({ where: { userId }, data: { action: 'edited' } })).rejects.toThrow();
    await expect(h.db.auditLog.deleteMany({ where: { userId } })).rejects.toThrow();
    expect(await h.db.auditLog.count({ where: { userId, action: 'test:entry' } })).toBe(1);
  });
});

describe('NFR 4 runtime role privileges', () => {
  const asAppRole = async (sql: string, params: unknown[] = []) => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE smilesync_app');
      return await client.query(sql, params);
    } finally {
      await client.query('ROLLBACK');
    }
  };

  it('may insert and read audit entries', async () => {
    await expect(
      asAppRole(`INSERT INTO audit_log (id, "userId", action, outcome) VALUES (gen_random_uuid(), $1, 'x', 'ALLOWED')`, [userId]),
    ).resolves.toBeDefined();
    await expect(asAppRole('SELECT count(*) FROM audit_log')).resolves.toBeDefined();
  });

  it('may not update the audit log', async () => {
    await expect(asAppRole(`UPDATE audit_log SET action = 'x'`)).rejects.toThrow(/permission denied|append-only/);
  });

  it('may not delete anything (no erasure path through the API)', async () => {
    for (const table of ['users', 'patients', 'cases', 'oral_images', 'symptom_assessments', 'clinical_notes', 'audit_log']) {
      await expect(asAppRole(`DELETE FROM ${table}`)).rejects.toThrow(/permission denied|append-only/);
    }
  });
});

describe('FR 5.3 / FR 2.3 / FR 4.1 database constraints', () => {
  it('the server never holds a Pending case', async () => {
    const chw = await createUser(h.db, 'CHW');
    const c = await createCase(h.db, chw.id);
    await expect(client.query(`UPDATE cases SET status = 'PENDING' WHERE id = $1`, [c.id])).rejects.toThrow(/cases_status_not_pending/);
  });

  it('a Reviewed case must have a priority and a reviewer', async () => {
    const chw = await createUser(h.db, 'CHW');
    const c = await createCase(h.db, chw.id);
    await expect(client.query(`UPDATE cases SET status = 'REVIEWED' WHERE id = $1`, [c.id])).rejects.toThrow(/cases_reviewed_complete/);
  });

  it('a patient cannot be stored without consent', async () => {
    const chw = await createUser(h.db, 'CHW');
    const c = await createCase(h.db, chw.id);
    await expect(client.query(`UPDATE patients SET "consentGiven" = false WHERE id = $1`, [c.patientId])).rejects.toThrow(
      /patients_consent_required/,
    );
  });

  it('pain level must be 1 to 10', async () => {
    const chw = await createUser(h.db, 'CHW');
    const c = await createCase(h.db, chw.id);
    await expect(
      client.query(`INSERT INTO symptom_assessments (id, "caseId", "painLevel", duration) VALUES (gen_random_uuid(), $1, 11, 'DAYS_1_TO_7')`, [c.id]),
    ).rejects.toThrow(/symptom_pain_range/);
  });
});
