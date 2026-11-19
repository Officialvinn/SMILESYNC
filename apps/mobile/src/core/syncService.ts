/**
 * Runs the sync engine with a valid login token (FR 1.1 "token refreshes on
 * sync", FR 5.1). AutoSync drives this instead of the engine directly.
 *
 * Before each run, a token that expires within 3 days is refreshed. If the
 * server refuses it (expired, deactivated, PIN reset), nothing is uploaded and
 * the CHW is asked to log in with internet. Cases stay Pending, never lost.
 */
import { NetworkError, type LoginResponse, type SyncReport, type SyncRunner } from '@smilesync/shared';
import { ApiError, type StoredToken } from './offlineAuth';

export const TOKEN_REFRESH_WINDOW_MS = 3 * 24 * 60 * 60_000;

const empty = (): SyncReport => ({ uploaded: [], failed: [], needsAttention: [], reviewed: [], offline: false, authRequired: false });

export class SyncService implements SyncRunner {
  constructor(
    private readonly deps: {
      engine: SyncRunner;
      tokens: { get(): Promise<StoredToken | null>; save(t: StoredToken): Promise<void> };
      /** POST /auth/refresh with the given token. */
      refresh: (token: string) => Promise<LoginResponse>;
      now?: () => Date;
    },
  ) {}

  async runOnce(opts: { force?: boolean } = {}): Promise<SyncReport> {
    const now = this.deps.now?.() ?? new Date();
    const current = await this.deps.tokens.get();
    if (!current) return { ...empty(), authRequired: true };

    if (new Date(current.expiresAt).getTime() - now.getTime() < TOKEN_REFRESH_WINDOW_MS) {
      try {
        const r = await this.deps.refresh(current.token);
        await this.deps.tokens.save({ token: r.token, expiresAt: r.expiresAt });
      } catch (e) {
        if (e instanceof NetworkError) return { ...empty(), offline: true };
        if (e instanceof ApiError && e.status === 401) return { ...empty(), authRequired: true };
        if (!(e instanceof ApiError)) throw e;
        // Server busy: try the sync with the token we have.
      }
    }
    return this.deps.engine.runOnce(opts);
  }

  nextDueAt(): Promise<Date | null> {
    return this.deps.engine.nextDueAt();
  }

  awaitingResults(): Promise<number> {
    return this.deps.engine.awaitingResults();
  }
}
