/** Sprint 3, admin side: FR 8.1 user management, FR 8.2 / NFR 4 audit log viewer. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditResponseSchema, userSummarySchema } from '@smilesync/shared';
import { CREDENTIALS, loginAs, makeHarness } from './helpers.js';
import { MAX_FAILED_LOGINS } from '../src/routes/auth.js';

const h = makeHarness();
let admin: { user: { id: string; username: string }; token: string };
beforeAll(async () => {
  admin = await loginAs(h, 'ADMIN');
});
afterAll(() => h.db.$disconnect());

const as = (token: string) => ({
  get: (p: string) => h.http().get(p).set('Authorization', `Bearer ${token}`),
  post: (p: string, b: object) => h.http().post(p).set('Authorization', `Bearer ${token}`).send(b),
  patch: (p: string, b: object) => h.http().patch(p).set('Authorization', `Bearer ${token}`).send(b),
});
const login = (username: string, password: string) => h.http().post('/auth/login').send({ username, password });
const unique = (p: string) => `${p}.${Math.random().toString(36).slice(2, 8)}`;

describe('users (FR 8.1)', () => {
  it('lists users without any password hash', async () => {
    const res = await as(admin.token).get('/admin/users');
    expect(res.status).toBe(200);
    for (const u of res.body.users) userSummarySchema.parse(u);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('creates a CHW with a PIN who can then log in', async () => {
    const username = unique('chw.kajiado');
    const res = await as(admin.token).post('/admin/users', { username, role: 'CHW', secret: '274615', chwCode: unique('CHW-KJD'), assignedSite: 'Kajiado Dispensary' });
    expect(res.status).toBe(201);
    expect(userSummarySchema.parse(res.body)).toMatchObject({ username, role: 'CHW', isActive: true, assignedSite: 'Kajiado Dispensary' });
    expect((await login(username, '274615')).status).toBe(200);
  });

  it('checks the credential rules for the role, and usernames are unique', async () => {
    const a = as(admin.token);
    expect((await a.post('/admin/users', { username: unique('chw.x'), role: 'CHW', secret: 'not-a-pin-123' })).status).toBe(400);
    expect((await a.post('/admin/users', { username: unique('dentist.x'), role: 'DENTIST', secret: 'short' })).status).toBe(400);
    const username = unique('dentist.y');
    expect((await a.post('/admin/users', { username, role: 'DENTIST', secret: 'a-long-enough-password' })).status).toBe(201);
    expect((await a.post('/admin/users', { username, role: 'DENTIST', secret: 'a-long-enough-password' })).status).toBe(409);
    expect((await a.post('/admin/users', { username: 'Bad Name!', role: 'DENTIST', secret: 'a-long-enough-password' })).status).toBe(400);
  });

  it('deactivating ends existing sessions and blocks login', async () => {
    const target = await loginAs(h, 'DENTIST');
    expect((await as(target.token).get('/auth/me')).status).toBe(200);
    expect((await as(admin.token).patch(`/admin/users/${target.user.id}`, { isActive: false })).status).toBe(200);
    expect((await as(target.token).get('/auth/me')).status).toBe(401);
    expect((await login(target.user.username, CREDENTIALS.DENTIST)).status).toBe(401);
    expect((await as(admin.token).patch(`/admin/users/${target.user.id}`, { isActive: true })).status).toBe(200);
    expect((await login(target.user.username, CREDENTIALS.DENTIST)).status).toBe(200);
  });

  it('resetting a password ends sessions, clears a lockout, and the new password works', async () => {
    const target = await loginAs(h, 'DENTIST');
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login(target.user.username, 'wrong-password-000');
    expect((await login(target.user.username, CREDENTIALS.DENTIST)).status).toBe(401); // locked
    const res = await as(admin.token).patch(`/admin/users/${target.user.id}`, { secret: 'brand-new-password-1' });
    expect(res.status).toBe(200);
    expect(res.body.lockedUntil).toBeNull();
    expect((await as(target.token).get('/auth/me')).status).toBe(401);
    expect((await login(target.user.username, 'brand-new-password-1')).status).toBe(200);
  });

  it('a reset PIN must still be 6 digits', async () => {
    const target = await loginAs(h, 'CHW');
    expect((await as(admin.token).patch(`/admin/users/${target.user.id}`, { secret: 'password123' })).status).toBe(400);
  });

  it('an admin cannot deactivate their own account', async () => {
    expect((await as(admin.token).patch(`/admin/users/${admin.user.id}`, { isActive: false })).status).toBe(400);
  });

  it('unknown user is 404; empty change is 400', async () => {
    expect((await as(admin.token).patch('/admin/users/00000000-0000-4000-8000-000000000000', { isActive: false })).status).toBe(404);
    expect((await as(admin.token).patch(`/admin/users/${admin.user.id}`, {})).status).toBe(400);
  });
});

describe('audit log viewer (FR 8.2, NFR 4)', () => {
  it('shows who did what and when, newest first, filtered by user and outcome', async () => {
    const target = await loginAs(h, 'DENTIST');
    await as(target.token).get('/admin/audit-log'); // denied: dentists cannot read the audit log
    const res = await as(admin.token).get(`/admin/audit-log?username=${target.user.username}`);
    expect(res.status).toBe(200);
    const body = auditResponseSchema.parse(res.body);
    expect(body.items.map((e) => [e.action, e.outcome])).toEqual([
      ['audit:read', 'DENIED'],
      ['auth:login', 'ALLOWED'],
    ]);
    expect(body.items[0]).toMatchObject({ username: target.user.username, role: 'DENTIST' });

    const denied = auditResponseSchema.parse((await as(admin.token).get(`/admin/audit-log?username=${target.user.username}&outcome=DENIED`)).body);
    expect(denied.items).toHaveLength(1);
  });

  it('pages, and reading the log is itself audited', async () => {
    const page = auditResponseSchema.parse((await as(admin.token).get('/admin/audit-log?pageSize=3')).body);
    expect(page.items).toHaveLength(3);
    expect(page.total).toBeGreaterThan(3);
    const own = auditResponseSchema.parse((await as(admin.token).get(`/admin/audit-log?username=${admin.user.username}&action=audit:read`)).body);
    expect(own.total).toBeGreaterThanOrEqual(2);
  });

  it('rejects a bad filter', async () => {
    expect((await as(admin.token).get('/admin/audit-log?outcome=MAYBE')).status).toBe(400);
  });
});
