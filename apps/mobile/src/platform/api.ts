/** HTTPS client for the API (NFR 1: https only, see config.ts). */
import {
  NetworkError, loginResponseSchema, type HttpClient, type LoginRequest, type LoginResponse,
} from '@smilesync/shared';
import { ApiError, type AuthApi } from '../core/offlineAuth';
import { API_URL, REQUEST_TIMEOUT_MS } from './config';

/** Photos can take a while on 2G: allow a minute per request. */
const UPLOAD_TIMEOUT_MS = 60_000;

async function send(
  method: string,
  path: string,
  opts: { json?: unknown; bytes?: Uint8Array; headers?: Record<string, string>; token?: string | null } = {},
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.bytes ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(opts.json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.bytes ? { 'content-type': 'application/octet-stream' } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      // React Native sends a Uint8Array body as raw bytes (no base64 on the wire).
      body: opts.bytes ? (opts.bytes as unknown as BodyInit) : opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      signal: controller.signal,
    });
  } catch {
    // No HTTP response: offline, timeout, DNS or TLS failure.
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
  return { status: res.status, body: await res.json().catch(() => null) };
}

function orThrow(r: { status: number; body: unknown }): unknown {
  if (r.status >= 200 && r.status < 300) return r.body;
  const message = (r.body as { error?: unknown } | null)?.error;
  throw new ApiError(r.status, typeof message === 'string' ? message : `Server error (${r.status})`);
}

export const authApi: AuthApi = {
  async login(req: LoginRequest): Promise<LoginResponse> {
    return loginResponseSchema.parse(orThrow(await send('POST', '/auth/login', { json: req })));
  },
};

/** FR 1.1: a new token for the current session, used on each sync. */
export async function refreshToken(token: string): Promise<LoginResponse> {
  return loginResponseSchema.parse(orThrow(await send('POST', '/auth/refresh', { token, json: {} })));
}

/** The sync transport's HttpClient (packages/shared/src/sync/httpTransport.ts). */
export function syncHttpClient(getToken: () => Promise<string | null>): HttpClient {
  return async (req) => send(req.method, req.path, { json: req.json, bytes: req.bytes, headers: req.headers, token: await getToken() });
}
