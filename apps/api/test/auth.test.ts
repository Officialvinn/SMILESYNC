/** FR 1.1 login, lockout, token lifetime and revocation; FR 8.1 deactivation. */
import { afterAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { CREDENTIALS, TEST_JWT_SECRET, auditFor, createUser, loginAs, makeHarness } from './helpers.js';
import { LOCKOUT_MS, MAX_FAILED_LOGINS } from '../src/routes/auth.js';
import { TOKEN_TTL_SECONDS } from '../src/auth/tokens.js';

const h = makeHarness();
afterAll(() => h.db.$disconnect());

const login = (username: string, password: string) => h.http().post('/auth/login').send({ username, password });

describe('FR 1.1 login', () => {
  for (const role of ['CHW', 'DENTIST', 'ADMIN'] as const) {
    it(`${role} logs in and gets a role-limited token`, async () => {
      const user = await createUser(h.db, role);
      const res = await login(user.username, CREDENTIALS[role]);
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({ id: user.id, username: user.username, role });
      const ttl = (new Date(res.body.expiresAt).getTime() - h.clock.now().getTime()) / 1000;
      expect(ttl).toBe(TOKEN_TTL_SECONDS[role]);
      const me = await h.http().get('/auth/me').set('Authorization', `Bearer ${res.body.token}`);
      expect(me.body.role).toBe(role);
    });
  }

  it('a wrong password and an unknown user get the same answer', async () => {
    const user = await createUser(h.db, 'DENTIST');
    const wrong = await login(user.username, 'wrong-password-123');
    const unknown = await login('nobody_here', 'wrong-password-123');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it('rejects a malformed request', async () => {
    const res = await h.http().post('/auth/login').send({ username: 'x' });
    expect(res.status).toBe(400);
  });

  it('audits successful and failed logins (FR 8.2)', async () => {
    const user = await createUser(h.db, 'CHW');
    await login(user.username, '000000');
    await login(user.username, CREDENTIALS.CHW);
    const entries = await auditFor(h.db, user.id, 'auth:login');
    expect(entries.map((e) => e.outcome)).toEqual(['DENIED', 'ALLOWED']);
  });
});

describe('FR 1.1 lockout protects short PINs', () => {
  it(`locks after ${MAX_FAILED_LOGINS} wrong PINs, even for the right PIN, then unlocks`, async () => {
    const user = await createUser(h.db, 'CHW');
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) expect((await login(user.username, '111111')).status).toBe(401);

    const locked = await login(user.username, CREDENTIALS.CHW);
    expect(locked.status).toBe(401);
    expect(locked.body.error).toMatch(/too many/i);

    h.clock.advance(LOCKOUT_MS + 1);
    expect((await login(user.username, CREDENTIALS.CHW)).status).toBe(200);
  });

  it('a successful login resets the failure count', async () => {
    const user = await createUser(h.db, 'CHW');
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) await login(user.username, '111111');
    expect((await login(user.username, CREDENTIALS.CHW)).status).toBe(200);
    expect((await h.db.user.findUniqueOrThrow({ where: { id: user.id } })).failedLoginCount).toBe(0);
  });
});

describe('FR 8.1 deactivated accounts', () => {
  it('cannot log in', async () => {
    const user = await createUser(h.db, 'DENTIST', { isActive: false });
    expect((await login(user.username, CREDENTIALS.DENTIST)).status).toBe(401);
    const [entry] = await auditFor(h.db, user.id, 'auth:login:inactive');
    expect(entry?.outcome).toBe('DENIED');
  });

  it('lose access immediately, even with a token issued earlier', async () => {
    const { user, token } = await loginAs(h, 'DENTIST');
    await h.db.user.update({ where: { id: user.id }, data: { isActive: false } });
    const res = await h.http().get('/cases').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('a reset (tokenVersion bump) revokes earlier tokens', async () => {
    const { user, token } = await loginAs(h, 'CHW');
    await h.db.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
    expect((await h.http().post('/auth/refresh').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });
});

describe('token checks', () => {
  it('rejects a tampered, expired, wrongly signed or unsigned token', async () => {
    const { user, token } = await loginAs(h, 'ADMIN');
    const sign = (secret: string, opts: jwt.SignOptions) =>
      // iat from the harness clock, so expiresIn is relative to the server's time.
      jwt.sign({ role: 'ADMIN', tv: 0, iat: Math.floor(h.clock.now().getTime() / 1000) }, secret, {
        subject: user.id,
        issuer: 'smilesync-api',
        ...opts,
      });
    const bad = [
      token.slice(0, -2) + 'xx',
      sign(TEST_JWT_SECRET, { expiresIn: -10 }),
      sign('some-other-secret-that-is-long-enough-000000', { expiresIn: 3600 }),
      jwt.sign({ role: 'ADMIN', tv: 0, sub: user.id, iss: 'smilesync-api' }, '', { algorithm: 'none' }),
      'not-a-jwt',
    ];
    for (const t of bad) {
      expect((await h.http().get('/auth/me').set('Authorization', `Bearer ${t}`)).status).toBe(401);
    }
  });

  it('rejects a token whose role claim no longer matches the account', async () => {
    const { user } = await loginAs(h, 'CHW');
    const forged = jwt.sign({ role: 'ADMIN', tv: 0, iat: Math.floor(h.clock.now().getTime() / 1000) }, TEST_JWT_SECRET, { subject: user.id, issuer: 'smilesync-api', expiresIn: 3600 });
    expect((await h.http().get('/admin/audit-log').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  it('FR 1.1 refresh issues a new token for a valid session', async () => {
    const { token } = await loginAs(h, 'CHW');
    h.clock.advance(60_000);
    const res = await h.http().post('/auth/refresh').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.token).not.toBe(token);
  });
});

describe('one clock for signing and checking tokens', () => {
  it('a token signed at server time T stays valid at T + 1 hour and expires at T + TTL', async () => {
    const { token } = await loginAs(h, 'DENTIST');
    h.clock.advance(3600_000);
    expect((await h.http().get('/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    h.clock.advance(TOKEN_TTL_SECONDS.DENTIST * 1000);
    expect((await h.http().get('/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });
});
