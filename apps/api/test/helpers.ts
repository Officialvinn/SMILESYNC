import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    // Synthetic test images only; a fresh folder per test file.
    IMAGE_STORAGE_DIR: mkdtempSync(join(tmpdir(), 'smilesync-images-')),
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

// ---- Sprint 3: full synthetic cases through the real upload endpoints --------

import { createHash } from 'node:crypto';
import { SHA256_HEADER, type CaseSubmission, type County, type Sex, type SymptomDuration } from '@smilesync/shared';

export const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Synthetic image bytes with a JPEG start marker. Different per call. */
export function fakeJpeg(size = 20_000): Uint8Array {
  const b = new Uint8Array(size);
  b[0] = 0xff;
  b[1] = 0xd8;
  const seed = Math.floor(Math.random() * 255);
  for (let i = 2; i < size; i++) b[i] = (i * 31 + seed) & 0xff;
  return b;
}

export interface SyntheticCaseOptions {
  painLevel?: number;
  duration?: SymptomDuration;
  location?: County;
  sex?: Sex;
  age?: number;
  name?: string;
}

/** Uploads a case as a CHW (photos, then case JSON). Returns ids and the photo bytes. */
export async function submitSyntheticCase(h: ReturnType<typeof makeHarness>, chwToken: string, o: SyntheticCaseOptions = {}) {
  const at = h.clock.now().toISOString();
  const images = (['FRONT', 'UPPER_ARCH', 'LOWER_ARCH'] as const).map((viewType) => {
    const bytes = fakeJpeg();
    return { id: randomUUID(), viewType, bytes };
  });
  const submission: CaseSubmission = {
    id: randomUUID(),
    createdAt: at,
    patient: {
      id: randomUUID(),
      anonId: generateAnonId(),
      name: o.name ?? 'Synthetic Patient Njeri',
      age: o.age ?? 30,
      location: o.location ?? 'Narok',
      ...(o.sex ? { sex: o.sex } : {}),
      consentGiven: true,
      consentDate: at,
    },
    images: images.map((i) => ({ id: i.id, viewType: i.viewType, sizeKB: Math.ceil(i.bytes.length / 1024), capturedAt: at, sha256: sha256Hex(i.bytes) })),
    assessment: { id: randomUUID(), painLevel: o.painLevel ?? 5, duration: o.duration ?? 'DAYS_1_TO_7' },
  };
  for (const img of images) {
    const r = await h.http()
      .put(`/cases/${submission.id}/images/${img.id}`)
      .set('Authorization', `Bearer ${chwToken}`)
      .set('Content-Type', 'application/octet-stream')
      .set(SHA256_HEADER, sha256Hex(img.bytes))
      .send(Buffer.from(img.bytes));
    if (r.status !== 201) throw new Error(`image upload ${r.status}`);
  }
  const res = await h.http().post('/cases').set('Authorization', `Bearer ${chwToken}`).send(submission);
  if (res.status !== 201) throw new Error(`case upload ${res.status} ${JSON.stringify(res.body)}`);
  return { caseId: submission.id, submission, images };
}
