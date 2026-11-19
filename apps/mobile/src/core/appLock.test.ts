/** NFR 1 / NFR 6: a phone left unattended does not show patient data to the next person. */
import { describe, expect, it } from 'vitest';
import { AppLock, LOCK_AFTER_MS } from './appLock';

describe('AppLock', () => {
  it('locks when the app comes back after the limit in the background', () => {
    const lock = new AppLock(LOCK_AFTER_MS);
    lock.wentToBackground(0);
    expect(lock.cameToForeground(LOCK_AFTER_MS - 1)).toBe(false);
    lock.wentToBackground(0);
    expect(lock.cameToForeground(LOCK_AFTER_MS + 1)).toBe(true);
  });

  it('does not lock if the app never went to the background (camera, permission dialogs)', () => {
    expect(new AppLock(1000).cameToForeground(1_000_000)).toBe(false);
  });

  it('the limit is a few minutes, short enough for a shared or lost phone', () => {
    expect(LOCK_AFTER_MS).toBeGreaterThanOrEqual(2 * 60_000);
    expect(LOCK_AFTER_MS).toBeLessThanOrEqual(10 * 60_000);
  });
});
