/**
 * Hardening: brute-force protection across accounts (FR 1.1, NFR 1) and removal
 * of abandoned uploads (NFR 6, data minimisation).
 */
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FailedLoginLimiter } from '../src/http/rateLimit.js';
import { CREDENTIALS, createUser, fakeJpeg, makeHarness, sha256Hex, loginAs } from './helpers.js';
import { SHA256_HEADER } from '@smilesync/shared';

describe('FailedLoginLimiter', () => {
  it('blocks a key after too many failures in the window, then lets it go', () => {
    const l = new FailedLoginLimiter({ maxFailures: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) l.recordFailure('1.2.3.4', t0 + i);
    expect(l.retryAfterMs('1.2.3.4', t0 + 10)).toBeGreaterThan(0);
    expect(l.retryAfterMs('5.6.7.8', t0 + 10)).toBe(0);
    expect(l.retryAfterMs('1.2.3.4', t0 + 60_003)).toBe(0);
  });

  it('forgets old entries so memory does not grow without bound', () => {
    const l = new FailedLoginLimiter({ maxFailures: 3, windowMs: 1_000 });
    for (let i = 0; i < 500; i++) l.recordFailure(`10.0.${i % 250}.${i}`, 0);
    l.recordFailure('x', 10_000);
    expect(l.size()).toBe(1);
  });
});

describe('POST /auth/login rate limit (per address, failures only)', () => {
  const h = makeHarness({ LOGIN_MAX_FAILURES_PER_IP: '5', LOGIN_FAILURE_WINDOW_MINUTES: '10' });
  afterAll(() => h.db.$disconnect());
  const login = (username: string, password: string) => h.http().post('/auth/login').send({ username, password });

  it('after 5 failed logins from one address, every login from it gets 429 until the window passes', async () => {
    const users = await Promise.all([createUser(h.db, 'CHW'), createUser(h.db, 'CHW'), createUser(h.db, 'DENTIST')]);
    // Spread over different accounts, so no single account lockout triggers.
    for (let i = 0; i < 5; i++) expect((await login(users[i % 3]!.username, '000000')).status).toBe(401);
    const blocked = await login(users[2]!.username, CREDENTIALS.DENTIST);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    h.clock.advance(10 * 60_000 + 1);
    expect((await login(users[2]!.username, CREDENTIALS.DENTIST)).status).toBe(200);
  });

  it('successful logins are not counted, so a busy clinic sharing one address is not blocked', async () => {
    const user = await createUser(h.db, 'DENTIST');
    for (let i = 0; i < 12; i++) expect((await login(user.username, CREDENTIALS.DENTIST)).status).toBe(200);
  });
});

describe('abandoned uploads are deleted (NFR 6)', () => {
  const h = makeHarness();
  afterAll(() => h.db.$disconnect());

  it('incoming photos older than the retention period are removed; newer ones stay; the phone re-uploads', async () => {
    const chw = await loginAs(h, 'CHW');
    const put = (caseId: string, id: string, bytes: Uint8Array) =>
      h.http().put(`/cases/${caseId}/images/${id}`).set('Authorization', `Bearer ${chw.token}`)
        .set('Content-Type', 'application/octet-stream').set(SHA256_HEADER, sha256Hex(bytes)).send(Buffer.from(bytes));
    const old = { caseId: randomUUID(), id: randomUUID(), bytes: fakeJpeg() };
    expect((await put(old.caseId, old.id, old.bytes)).status).toBe(201);

    const { ImageStore } = await import('../src/storage/imageStore.js');
    const { FieldCrypto } = await import('../src/security/fieldCrypto.js');
    const store = new ImageStore(h.config.IMAGE_STORAGE_DIR, new FieldCrypto(h.config.PATIENT_DATA_KEY));

    // Not old enough yet.
    expect(await store.purgeIncoming(7 * 86_400_000, new Date())).toBe(0);
    // Eight days later.
    expect(await store.purgeIncoming(7 * 86_400_000, new Date(Date.now() + 8 * 86_400_000))).toBe(1);
    const dir = join(h.config.IMAGE_STORAGE_DIR, 'incoming', chw.user.id);
    expect((await readdir(dir)).filter((f) => f.startsWith(old.id))).toEqual([]);
    // Uploading again works (the phone does this when the server reports the photo missing).
    expect((await put(old.caseId, old.id, old.bytes)).status).toBe(201);
  });
});
