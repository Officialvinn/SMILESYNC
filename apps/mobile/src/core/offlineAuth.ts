/**
 * FR 1.1: CHW login with username and 6-digit PIN.
 *
 * The first login on a phone must be online. After that, if the phone has no
 * internet (or the server is down), the CHW can log in with the same PIN,
 * checked against a bcrypt hash kept in the Keychain / Keystore.
 *
 * Rules:
 * - The server is the authority. If it answers, its answer wins, even when the
 *   PIN matches the stored hash. A 401 removes the offline credential, which
 *   covers a deactivated account or a PIN reset by an administrator.
 * - Five wrong PINs offline remove the offline credential, so a lost phone
 *   cannot be brute-forced through the app. The CHW then logs in online.
 *   Local cases are not touched: the database key is separate from the PIN.
 * - FR 1.2: the app is for CHWs. Other roles are refused and nothing is stored.
 */
import bcrypt from 'bcryptjs';
import { NetworkError, pinSchema, type AuthUser, type LoginRequest, type LoginResponse } from '@smilesync/shared';
import type { SecureKV } from './ports';

export const MAX_OFFLINE_PIN_FAILURES = 5;
/** bcrypt cost for the offline PIN hash. Kept modest: it runs in JavaScript on low-end phones. */
export const OFFLINE_PIN_BCRYPT_COST = 10;

export const MESSAGES = {
  firstLoginNeedsInternet:
    'No internet. The first login on this phone needs internet. Connect and try again.',
  wrongPin: (left: number) =>
    `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before you must log in with internet.`,
  tooManyWrongPins: 'Too many wrong PINs. Connect to the internet and log in again.',
  chwOnly: 'This app is for community health workers. Dentists and administrators use the web dashboard.',
} as const;

const KEY = {
  credential: 'auth.credential.v1',
  token: 'auth.token.v1',
  failures: 'auth.pinFailures.v1',
} as const;

/** The server answered with an HTTP error. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AuthApi {
  /** POST /auth/login. Throws NetworkError with no response, ApiError on an HTTP error. */
  login(req: LoginRequest): Promise<LoginResponse>;
}

export interface PinHasher {
  hash(pin: string): Promise<string>;
  verify(pin: string, hash: string): Promise<boolean>;
}

export function bcryptPinHasher(cost = OFFLINE_PIN_BCRYPT_COST): PinHasher {
  return {
    hash: (pin) => bcrypt.hash(pin, cost),
    verify: (pin, hash) => bcrypt.compare(pin, hash),
  };
}

export interface StoredToken {
  token: string;
  expiresAt: string;
}

export interface Session {
  user: AuthUser;
  /** Last token from the server; may be expired after an offline login. Sync refreshes it. */
  token: string | null;
  expiresAt: string | null;
  /** True when this login was checked against the phone, not the server. */
  offline: boolean;
}

export type LoginResult = { ok: true; session: Session } | { ok: false; message: string };

interface Credential {
  user: AuthUser;
  pinHash: string;
}

export class AuthService {
  constructor(private readonly deps: { api: AuthApi; kv: SecureKV; hasher: PinHasher }) {}

  async login(usernameInput: string, pin: string): Promise<LoginResult> {
    const username = usernameInput.trim();
    if (!pinSchema.safeParse(pin).success) return { ok: false, message: 'PIN must be 6 digits' };

    let res: LoginResponse;
    try {
      res = await this.deps.api.login({ username, password: pin });
    } catch (e) {
      if (e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)) {
        return this.loginOffline(username, pin);
      }
      if (e instanceof ApiError) {
        // The server refused this user: stop offline logins for them on this phone.
        const cred = await this.readCredential();
        if (cred && cred.user.username === username) await this.forget();
        return { ok: false, message: e.message };
      }
      throw e;
    }

    if (res.user.role !== 'CHW') return { ok: false, message: MESSAGES.chwOnly };

    const credential: Credential = { user: res.user, pinHash: await this.deps.hasher.hash(pin) };
    await this.deps.kv.set(KEY.credential, JSON.stringify(credential));
    await this.saveToken({ token: res.token, expiresAt: res.expiresAt });
    await this.deps.kv.delete(KEY.failures);
    return { ok: true, session: { user: res.user, token: res.token, expiresAt: res.expiresAt, offline: false } };
  }

  /** Called after a token refresh on sync (FR 1.1, "token refreshes on sync"). */
  async saveToken(t: StoredToken): Promise<void> {
    await this.deps.kv.set(KEY.token, JSON.stringify(t));
  }

  private async loginOffline(username: string, pin: string): Promise<LoginResult> {
    const cred = await this.readCredential();
    if (!cred || cred.user.username !== username) return { ok: false, message: MESSAGES.firstLoginNeedsInternet };

    if (!(await this.deps.hasher.verify(pin, cred.pinHash))) {
      const failures = Number((await this.deps.kv.get(KEY.failures)) ?? '0') + 1;
      if (failures >= MAX_OFFLINE_PIN_FAILURES) {
        await this.forget();
        return { ok: false, message: MESSAGES.tooManyWrongPins };
      }
      await this.deps.kv.set(KEY.failures, String(failures));
      return { ok: false, message: MESSAGES.wrongPin(MAX_OFFLINE_PIN_FAILURES - failures) };
    }

    await this.deps.kv.delete(KEY.failures);
    const raw = await this.deps.kv.get(KEY.token);
    const t = raw ? (JSON.parse(raw) as StoredToken) : null;
    return { ok: true, session: { user: cred.user, token: t?.token ?? null, expiresAt: t?.expiresAt ?? null, offline: true } };
  }

  private async readCredential(): Promise<Credential | null> {
    const raw = await this.deps.kv.get(KEY.credential);
    return raw ? (JSON.parse(raw) as Credential) : null;
  }

  /** Removes the offline credential, token and failure count. Local cases stay. */
  private async forget(): Promise<void> {
    await this.deps.kv.delete(KEY.credential);
    await this.deps.kv.delete(KEY.token);
    await this.deps.kv.delete(KEY.failures);
  }
}
