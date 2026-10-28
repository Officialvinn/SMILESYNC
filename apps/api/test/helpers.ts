import { randomBytes, randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import request from 'supertest';
import { generateAnonId, type Role } from '@smilesync/shared';
import { createApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import { hashSecret } from '../src/auth/passwords.js';
import { FieldCrypto } from '../src/security/fieldCrypto.js';

export const TEST_JWT_SECRET = 'test-only-secret-not-used-anywhere-else-0123456789';

export function testConfig(): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    JWT_SECRET: TEST_JWT_SECRET,
    PATIENT_DATA_KEY: randomBytes(32).toString('base64'),
    BCRYPT_COST: '4',
    TRUST_PROXY_HOPS: '0',
  });
}

export function makeHarness() {
  const config = testConfig();
  const db = createDb(config.DATABASE_URL);
  let current = new Date('2026-10-28T08:00:00.000Z');
  const clock = {
    now: () => new Date(current),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
  const app = createApp({ db, config, now: clock.now });
  return { config, db, app, clock, http: () => request(app) };
}

export const CREDENTIALS: Record<Role, string> = {
  CHW: '482913',
  DENTIST: 'dentist-password-123',
  ADMIN: 'admin-password-123',
};

/** Synthetic user with a unique username. */
export async function createUser(db: Db, role: Role, overrides: { isActive?: boolean } = {}) {
  const username = `${role.toLowerCase()}_${randomUUID().slice(0, 8)}`;
  return db.user.create({
    data: {
      username,
      role,
      passwordHash: await hashSecret(CREDENTIALS[role], 4),
      isActive: overrides.isActive ?? true,
      ...(role === 'CHW' ? { chwCode: `CHW-${randomUUID().slice(0, 6)}`, assignedSite: 'Narok Health Centre' } : {}),
      ...(role === 'DENTIST' ? { licenseNumber: `KMPDC-${randomUUID().slice(0, 6)}`, specialty: 'General dentistry' } : {}),
      ...(role === 'ADMIN' ? { adminLevel: 'SYSTEM' } : {}),
    },
  });
}

export async function loginAs(h: ReturnType<typeof makeHarness>, role: Role, overrides: { isActive?: boolean } = {}) {
  const user = await createUser(h.db, role, overrides);
  const res = await h.http().post('/auth/login').send({ username: user.username, password: CREDENTIALS[role] });
  return { user, token: res.body.token as string };
}

/** Synthetic synced case owned by the given CHW. */
export async function createCase(db: Db, chwId: string) {
  const crypto = new FieldCrypto(randomBytes(32).toString('base64'));
  const patient = await db.patient.create({
    data: {
      id: randomUUID(),
      anonId: generateAnonId(),
      nameEncrypted: crypto.encrypt('Synthetic Patient'),
      age: 34,
      location: 'Narok',
      consentGiven: true,
      consentDate: new Date(),
      registeredById: chwId,
    },
  });
  return db.case.create({
    data: { id: randomUUID(), patientId: patient.id, submittedById: chwId, status: 'SYNCED', createdAt: new Date() },
  });
}

export async function auditFor(db: Db, userId: string | null, action?: string) {
  return db.auditLog.findMany({ where: { userId, ...(action ? { action } : {}) }, orderBy: { timestamp: 'asc' } });
}
