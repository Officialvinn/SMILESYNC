/** HTTPS client for the API. Sprint 2 adds the sync transport here. */
import { NetworkError, loginResponseSchema, type LoginRequest, type LoginResponse } from '@smilesync/shared';
import { ApiError, type AuthApi } from '../core/offlineAuth';
import { API_URL, REQUEST_TIMEOUT_MS } from './config';

async function postJson(path: string, body: unknown, token?: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // No HTTP response: offline, timeout, DNS or TLS failure.
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new ApiError(res.status, typeof message === 'string' ? message : `Server error (${res.status})`);
  }
  return data;
}

export const authApi: AuthApi = {
  async login(req: LoginRequest): Promise<LoginResponse> {
    return loginResponseSchema.parse(await postJson('/auth/login', req));
  },
};
