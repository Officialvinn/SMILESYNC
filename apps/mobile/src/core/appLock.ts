/**
 * NFR 1 / NFR 6: if the app spends more than a few minutes in the background,
 * the CHW must enter their PIN again before patient names and photos show.
 * Short trips away (the camera, a permission prompt, a phone call) do not lock.
 * Works offline: the PIN is checked against the hash on the phone.
 */
export const LOCK_AFTER_MS = 5 * 60_000;

export class AppLock {
  private backgroundedAt: number | null = null;

  constructor(private readonly limitMs: number = LOCK_AFTER_MS) {}

  wentToBackground(now: number): void {
    this.backgroundedAt = now;
  }

  /** True when the PIN must be entered again. */
  cameToForeground(now: number): boolean {
    const since = this.backgroundedAt;
    this.backgroundedAt = null;
    return since !== null && now - since > this.limitMs;
  }
}
