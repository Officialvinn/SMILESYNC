/**
 * Offline sync engine (FR 5.1 automatic sync, FR 5.2 retry without
 * duplicates or loss, FR 5.3 status, FR 7.3 results back to the CHW).
 *
 * How FR 5.2 is guaranteed:
 * - Every case has a client-generated UUID. The server upserts on it, so
 *   sending the same case twice stores it once ("alreadyStored").
 * - The phone marks a case Synced only after the server confirms it.
 *   If the confirmation is lost, the case stays Pending and is resent,
 *   and the server answers "alreadyStored".
 * - Nothing is ever deleted here. Failures only update retry bookkeeping.
 */
import { MAX_SUBMISSION_BYTES } from '../domain/enums.js';
import {
  NetworkError,
  type LocalCase,
  type SyncReport,
  type SyncStore,
  type SyncTransport,
  type UploadPayload,
} from './types.js';

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 15 * 60_000;

/** User-facing messages (SRS 3.1: actionable error messages). */
export const MESSAGES = {
  offline: 'No connection. Case saved on this phone. It will sync automatically when you are back online.',
  serverError: 'The server is busy. Case saved on this phone. It will try again automatically.',
  tooLarge: 'This case is larger than 2 MB and cannot be sent. Please retake the photos.',
  rejected: (msg: string) => `The server could not accept this case: ${msg}. Please contact support.`,
} as const;

/**
 * Delay before retry number `attempt` (1-based): 5 s, 10 s, 20 s ... capped
 * at 15 min. Jitter scales it to between 50% and 100% so a whole district's
 * phones do not retry at the same moment.
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const raw = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(raw * (0.5 + 0.5 * random()));
}

/** Size of the whole submission: image bytes plus the JSON body (FR 3.3). */
export function payloadBytes(payload: UploadPayload): number {
  const json = new TextEncoder().encode(JSON.stringify(payload.submission)).byteLength;
  return payload.images.reduce((sum, img) => sum + img.bytes.byteLength, json);
}

export interface SyncEngineOptions {
  store: SyncStore;
  transport: SyncTransport;
  now?: () => Date;
  random?: () => number;
}

export class SyncEngine {
  private readonly store: SyncStore;
  private readonly transport: SyncTransport;
  private readonly now: () => Date;
  private readonly random: () => number;
  private current: Promise<SyncReport> | null = null;
  /** After a network error, automatic runs wait until this time. */
  private blockedUntil: Date | null = null;

  constructor(opts: SyncEngineOptions) {
    this.store = opts.store;
    this.transport = opts.transport;
    this.now = opts.now ?? (() => new Date());
    this.random = opts.random ?? Math.random;
  }

  /**
   * One sync pass: upload due Pending cases, then pull triage results.
   * Concurrent calls share the same pass, so a case is never sent twice at once.
   * `force` is the CHW's "Sync now" button: it ignores the retry schedule.
   */
  runOnce(opts: { force?: boolean } = {}): Promise<SyncReport> {
    if (!this.current) {
      this.current = this.run(opts.force ?? false).finally(() => {
        this.current = null;
      });
    }
    return this.current;
  }

  /** When the next automatic upload attempt is due, or null if nothing to upload. */
  async nextDueAt(): Promise<Date | null> {
    const now = this.now();
    const due = (await this.store.listByStatus('PENDING'))
      .filter((c) => !c.needsAttention)
      .map((c) => (c.nextAttemptAt ? new Date(c.nextAttemptAt) : now));
    if (due.length === 0) return null;
    const earliest = new Date(Math.min(...due.map((d) => d.getTime())));
    return this.blockedUntil && this.blockedUntil > earliest ? new Date(this.blockedUntil) : earliest;
  }

  /** Number of synced cases still waiting for a dentist's result. */
  async awaitingResults(): Promise<number> {
    return (await this.store.listByStatus('SYNCED')).length;
  }

  private async run(force: boolean): Promise<SyncReport> {
    const report: SyncReport = { uploaded: [], failed: [], needsAttention: [], reviewed: [], offline: false, authRequired: false };
    const now = this.now();
    if (!force && this.blockedUntil && now < this.blockedUntil) {
      report.offline = true;
      return report;
    }

    // 1. Upload (FR 5.1, 5.2).
    for (const c of await this.store.listByStatus('PENDING')) {
      if (c.needsAttention) continue;
      if (!force && c.nextAttemptAt && new Date(c.nextAttemptAt) > now) continue;

      const payload = await this.store.loadPayload(c.id);
      if (payloadBytes(payload) > MAX_SUBMISSION_BYTES) {
        await this.fail(c, now, MESSAGES.tooLarge, true);
        report.needsAttention.push(c.id);
        continue;
      }

      let outcome;
      try {
        outcome = await this.transport.uploadCase(payload);
      } catch (err) {
        if (!(err instanceof NetworkError)) throw err;
        const next = await this.fail(c, now, MESSAGES.offline, false);
        this.blockedUntil = next;
        report.failed.push(c.id);
        report.offline = true;
        return report; // offline: do not try the remaining cases now
      }

      switch (outcome.kind) {
        case 'created':
        case 'alreadyStored':
          await this.store.markSynced(c.id, now.toISOString());
          report.uploaded.push(c.id);
          break;
        case 'unauthorized':
          report.authRequired = true;
          return report;
        case 'rejected':
          await this.fail(c, now, MESSAGES.rejected(outcome.message), true);
          report.needsAttention.push(c.id);
          break;
        case 'serverError':
          await this.fail(c, now, MESSAGES.serverError, false);
          report.failed.push(c.id);
          break;
      }
    }
    this.blockedUntil = null;

    // 2. Pull triage results (FR 7.3, FR 5.3). The server's review always wins.
    const synced = await this.store.listByStatus('SYNCED');
    if (synced.length > 0) {
      let results;
      try {
        results = await this.transport.fetchTriage(synced.map((c) => c.id));
      } catch (err) {
        if (!(err instanceof NetworkError)) throw err;
        report.offline = true;
        return report;
      }
      if ('kind' in results) {
        report.authRequired = true;
        return report;
      }
      const syncedIds = new Set(synced.map((c) => c.id));
      for (const r of results) {
        if (r.status === 'REVIEWED' && syncedIds.has(r.caseId)) {
          await this.store.applyTriage(r.caseId, r);
          report.reviewed.push(r.caseId);
        }
      }
    }
    return report;
  }

  /** Record a failed attempt. Returns when the next automatic retry is due. */
  private async fail(c: LocalCase, now: Date, error: string, needsAttention: boolean): Promise<Date | null> {
    const attempts = c.attempts + 1;
    const next = needsAttention ? null : new Date(now.getTime() + backoffDelayMs(attempts, this.random));
    await this.store.recordFailure(c.id, {
      attempts,
      lastAttemptAt: now.toISOString(),
      nextAttemptAt: next ? next.toISOString() : null,
      error,
      needsAttention,
    });
    return next;
  }
}

/** What AutoSync drives: the engine, or a wrapper that refreshes the login token first. */
export type SyncRunner = Pick<SyncEngine, 'runOnce' | 'nextDueAt' | 'awaitingResults'>;

export interface AutoSyncOptions {
  /** How often to check for dentist results while cases are waiting (FR 7.3). */
  pollIntervalMs?: number;
  onReport?: (report: SyncReport) => void;
  onError?: (error: unknown) => void;
}

/**
 * FR 5.1: runs the engine when connectivity returns, then keeps retrying on
 * the backoff schedule while online. The app feeds it connectivity events
 * (from NetInfo in Sprint 2).
 */
export class AutoSync {
  private online = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly engine: SyncRunner,
    private readonly opts: AutoSyncOptions = {},
  ) {
    this.pollIntervalMs = opts.pollIntervalMs ?? 15 * 60_000;
  }

  setOnline(online: boolean): void {
    this.online = online;
    this.clearTimer();
    if (online) void this.trigger();
  }

  /** Run now, e.g. after the CHW logs in again or taps "Sync now". */
  async trigger(force = false): Promise<void> {
    if (!this.online || this.stopped) return;
    this.clearTimer();
    try {
      const report = await this.engine.runOnce({ force });
      this.opts.onReport?.(report);
      if (report.authRequired) return; // wait for the CHW to log in
    } catch (err) {
      this.opts.onError?.(err);
    }
    await this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private async scheduleNext(): Promise<void> {
    if (!this.online || this.stopped) return;
    const due = await this.engine.nextDueAt();
    let delay = due ? Math.max(1_000, due.getTime() - Date.now()) : Infinity;
    if ((await this.engine.awaitingResults()) > 0) delay = Math.min(delay, this.pollIntervalMs);
    if (delay === Infinity || !this.online || this.stopped) return;
    this.clearTimer();
    this.timer = setTimeout(() => void this.trigger(), delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
