/**
 * FR 1.1 hardening: limits failed logins per client address, across all
 * accounts. The per-account lockout (5 wrong PINs) stops guessing one PIN;
 * this stops trying one common PIN against many usernames.
 *
 * Only failures count, so a clinic whose CHWs share one mobile-network
 * address is never blocked by its own successful logins. In memory: the API
 * runs as a single process. Restarting the API clears it, which is acceptable
 * because the per-account lockout is stored in the database.
 */
export class FailedLoginLimiter {
  private readonly failures = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(private readonly opts: { maxFailures: number; windowMs: number }) {}

  recordFailure(key: string, now: number): void {
    this.sweep(now);
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.opts.windowMs);
    list.push(now);
    this.failures.set(key, list);
  }

  /** 0 when the key may try again now, else milliseconds to wait. */
  retryAfterMs(key: string, now: number): number {
    const recent = (this.failures.get(key) ?? []).filter((t) => now - t < this.opts.windowMs);
    if (recent.length < this.opts.maxFailures) return 0;
    const oldest = recent[recent.length - this.opts.maxFailures]!;
    return Math.max(1, oldest + this.opts.windowMs - now);
  }

  size(): number {
    return this.failures.size;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.opts.windowMs) return;
    this.lastSweep = now;
    for (const [k, list] of this.failures) {
      if (list.every((t) => now - t >= this.opts.windowMs)) this.failures.delete(k);
    }
  }
}
