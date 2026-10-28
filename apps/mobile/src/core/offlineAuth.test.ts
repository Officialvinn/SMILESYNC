/**
 * FR 1.1: CHW login with a PIN, online first, then offline against a locally
 * stored hash. FR 1.2: the mobile app is for CHWs only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { NetworkError, type LoginResponse } from '@smilesync/shared';
import { MemoryKV } from '../../test/nodeSqlite';
import { ApiError, AuthService, MAX_OFFLINE_PIN_FAILURES, MESSAGES, bcryptPinHasher, type AuthApi } from './offlineAuth';

const CHW = { id: '11111111-1111-4111-8111-111111111111', username: 'chw.narok1', role: 'CHW' as const };
const PIN = '482915';

class FakeApi implements AuthApi {
  mode: 'ok' | 'offline' | 'unauthorized' | 'serverError' | 'dentist' = 'ok';
  pin = PIN;
  calls = 0;
  async login(req: { username: string; password: string }): Promise<LoginResponse> {
    this.calls += 1;
    if (this.mode === 'offline') throw new NetworkError();
    if (this.mode === 'serverError') throw new ApiError(503, 'Service unavailable');
    if (this.mode === 'unauthorized' || req.password !== this.pin || req.username !== CHW.username) {
      throw new ApiError(401, 'Invalid username or password');
    }
    const user = this.mode === 'dentist' ? { ...CHW, role: 'DENTIST' as const } : CHW;
    return { token: `token-${this.calls}`, expiresAt: '2026-11-04T00:00:00.000Z', user };
  }
}

describe('AuthService (FR 1.1)', () => {
  let api: FakeApi;
  let kv: MemoryKV;
  let auth: AuthService;

  beforeEach(() => {
    api = new FakeApi();
    kv = new MemoryKV();
    auth = new AuthService({ api, kv, hasher: bcryptPinHasher(4) });
  });

  it('rejects a PIN that is not 6 digits without calling the server', async () => {
    const r = await auth.login(CHW.username, '12ab');
    expect(r).toEqual({ ok: false, message: 'PIN must be 6 digits' });
    expect(api.calls).toBe(0);
  });

  it('logs in online and stores a PIN hash, never the PIN', async () => {
    const r = await auth.login(CHW.username, PIN);
    expect(r).toMatchObject({ ok: true, session: { user: CHW, offline: false, token: 'token-1' } });
    const stored = [...kv.data.values()].join('\n');
    expect(stored).not.toContain(PIN);
    expect(stored).toMatch(/\$2[aby]\$/); // bcrypt hash
  });

  it('first login with no internet explains that internet is needed', async () => {
    api.mode = 'offline';
    expect(await auth.login(CHW.username, PIN)).toEqual({ ok: false, message: MESSAGES.firstLoginNeedsInternet });
  });

  it('after one online login, logs in offline with the same PIN and keeps the last token', async () => {
    await auth.login(CHW.username, PIN);
    api.mode = 'offline';
    const r = await auth.login(CHW.username, PIN);
    expect(r).toMatchObject({ ok: true, session: { user: CHW, offline: true, token: 'token-1' } });
  });

  it('treats a server error like no internet, so a down server does not stop field work', async () => {
    await auth.login(CHW.username, PIN);
    api.mode = 'serverError';
    expect(await auth.login(CHW.username, PIN)).toMatchObject({ ok: true, session: { offline: true } });
  });

  it('offline login is for the CHW who logged in online on this phone only', async () => {
    await auth.login(CHW.username, PIN);
    api.mode = 'offline';
    expect(await auth.login('chw.narok2', PIN)).toEqual({ ok: false, message: MESSAGES.firstLoginNeedsInternet });
  });

  it('counts wrong offline PINs and wipes the offline credential after the limit', async () => {
    await auth.login(CHW.username, PIN);
    api.mode = 'offline';
    for (let i = 1; i < MAX_OFFLINE_PIN_FAILURES; i++) {
      const r = await auth.login(CHW.username, '000000');
      expect(r).toEqual({ ok: false, message: MESSAGES.wrongPin(MAX_OFFLINE_PIN_FAILURES - i) });
    }
    expect(await auth.login(CHW.username, '000000')).toEqual({ ok: false, message: MESSAGES.tooManyWrongPins });
    // Even the right PIN no longer works offline: an online login is required.
    expect(await auth.login(CHW.username, PIN)).toEqual({ ok: false, message: MESSAGES.firstLoginNeedsInternet });
  });

  it('a correct offline PIN resets the failure count', async () => {
    await auth.login(CHW.username, PIN);
    api.mode = 'offline';
    await auth.login(CHW.username, '000000');
    await auth.login(CHW.username, PIN);
    expect(await auth.login(CHW.username, '000000')).toEqual({
      ok: false,
      message: MESSAGES.wrongPin(MAX_OFFLINE_PIN_FAILURES - 1),
    });
  });

  it('when the server refuses the login, the offline credential is removed (deactivated or PIN reset)', async () => {
    await auth.login(CHW.username, PIN);
    api.mode = 'unauthorized';
    expect(await auth.login(CHW.username, PIN)).toEqual({ ok: false, message: 'Invalid username or password' });
    api.mode = 'offline';
    expect(await auth.login(CHW.username, PIN)).toEqual({ ok: false, message: MESSAGES.firstLoginNeedsInternet });
  });

  it('a PIN changed on the server replaces the old offline PIN', async () => {
    await auth.login(CHW.username, PIN);
    api.pin = '730264';
    await auth.login(CHW.username, '730264');
    api.mode = 'offline';
    expect(await auth.login(CHW.username, PIN)).toMatchObject({ ok: false });
    expect(await auth.login(CHW.username, '730264')).toMatchObject({ ok: true });
  });

  it('FR 1.2: refuses dentists and admins and stores nothing for them', async () => {
    api.mode = 'dentist';
    expect(await auth.login(CHW.username, PIN)).toEqual({ ok: false, message: MESSAGES.chwOnly });
    expect(kv.data.size).toBe(0);
  });

  it('saveToken keeps the refreshed token for the next sync', async () => {
    await auth.login(CHW.username, PIN);
    await auth.saveToken({ token: 'refreshed', expiresAt: '2026-11-11T00:00:00.000Z' });
    api.mode = 'offline';
    expect(await auth.login(CHW.username, PIN)).toMatchObject({ ok: true, session: { token: 'refreshed' } });
  });
});
