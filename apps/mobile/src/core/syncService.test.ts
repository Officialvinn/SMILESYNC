/** FR 1.1 "token refreshes on sync", FR 5.1 automatic sync. */
import { describe, expect, it } from 'vitest';
import { NetworkError, type LoginResponse, type SyncReport } from '@smilesync/shared';
import { ApiError } from './offlineAuth';
import { SyncService, TOKEN_REFRESH_WINDOW_MS } from './syncService';

const NOW = new Date('2026-11-19T08:00:00.000Z');
const ok: SyncReport = { uploaded: ['x'], failed: [], needsAttention: [], reviewed: [], offline: false, authRequired: false };

function setup(token: { token: string; expiresAt: string } | null, refresh: () => Promise<LoginResponse>) {
  let saved = token;
  const runs: boolean[] = [];
  const service = new SyncService({
    engine: {
      runOnce: async (o = {}) => (runs.push(o.force ?? false), ok),
      nextDueAt: async () => null,
      awaitingResults: async () => 0,
    },
    tokens: { get: async () => saved, save: async (t) => void (saved = t) },
    refresh: async () => refresh(),
    now: () => NOW,
  });
  return { service, runs, saved: () => saved };
}

const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const fresh = (expiresAt: string): LoginResponse => ({
  token: 'new-token', expiresAt, user: { id: '11111111-1111-4111-8111-111111111111', username: 'chw.narok1', role: 'CHW' },
});

describe('SyncService', () => {
  it('no token at all: asks for an online login and does not run', async () => {
    const s = setup(null, async () => fresh(inDays(7)));
    expect((await s.service.runOnce()).authRequired).toBe(true);
    expect(s.runs).toEqual([]);
  });

  it('a token with plenty of time left is used as is (no extra request)', async () => {
    let called = false;
    const s = setup({ token: 't', expiresAt: inDays(6) }, async () => ((called = true), fresh(inDays(7))));
    expect(await s.service.runOnce()).toEqual(ok);
    expect(called).toBe(false);
  });

  it('refreshes a token that expires within the window, saves it, then syncs', async () => {
    expect(TOKEN_REFRESH_WINDOW_MS).toBe(3 * 86_400_000);
    const s = setup({ token: 't', expiresAt: inDays(1) }, async () => fresh(inDays(7)));
    await s.service.runOnce({ force: true });
    expect(s.saved()).toEqual({ token: 'new-token', expiresAt: inDays(7) });
    expect(s.runs).toEqual([true]);
  });

  it('a refused refresh (expired or deactivated) stops with authRequired and uploads nothing', async () => {
    const s = setup({ token: 't', expiresAt: inDays(-1) }, async () => {
      throw new ApiError(401, 'Please log in');
    });
    expect((await s.service.runOnce()).authRequired).toBe(true);
    expect(s.runs).toEqual([]);
  });

  it('offline during refresh: reports offline without trying the uploads', async () => {
    const s = setup({ token: 't', expiresAt: inDays(1) }, async () => {
      throw new NetworkError();
    });
    expect((await s.service.runOnce()).offline).toBe(true);
    expect(s.runs).toEqual([]);
  });

  it('a busy server during refresh: carries on with the current token', async () => {
    const s = setup({ token: 't', expiresAt: inDays(1) }, async () => {
      throw new ApiError(503, 'busy');
    });
    expect(await s.service.runOnce()).toEqual(ok);
  });
});
