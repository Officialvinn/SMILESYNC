/**
 * The login session lives in sessionStorage: it ends when the tab closes and
 * is never shared with other tabs. Tokens last 8 hours for dentists and admins.
 */
import type { LoginResponse } from '@smilesync/shared';

const KEY = 'smilesync.session';

export function loadSession(now = new Date()): LoginResponse | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LoginResponse;
    return new Date(s.expiresAt) > now ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: LoginResponse | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the session simply lasts until the page reloads.
  }
}
