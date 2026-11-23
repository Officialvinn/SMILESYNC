/** Same-origin API client. The token is sent as a bearer header, never in URLs. */
import { loginResponseSchema, type LoginResponse } from '@smilesync/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: () => void = () => {};

export function setToken(t: string | null) {
  token = t;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: string; details?: { path?: (string | number)[]; message?: string }[] }
      | null;
    throw new ApiError(res.status, describeError(data, res.status));
  }
  return res;
}

export const api = {
  async get<T>(path: string): Promise<T> {
    return (await request('GET', path)).json() as Promise<T>;
  },
  async send<T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body: unknown): Promise<T> {
    return (await request(method, path, body)).json() as Promise<T>;
  },
  /** A decrypted photo as an object URL; the caller must revoke it. */
  async imageUrl(path: string): Promise<string> {
    return URL.createObjectURL(await (await request('GET', path)).blob());
  },
  async login(username: string, password: string): Promise<LoginResponse> {
    return loginResponseSchema.parse(await (await request('POST', '/auth/login', { username, password })).json());
  },
};

const FIELD_LABEL: Record<string, string> = {
  username: 'Username',
  secret: 'Password or PIN',
  role: 'Role',
  chwCode: 'CHW code',
  assignedSite: 'Site',
  licenseNumber: 'Licence number',
  specialty: 'Specialty',
  adminLevel: 'Admin level',
};

/** Say which field is wrong and why, not just "Invalid request". */
export function describeError(
  data: { error?: string; details?: { path?: (string | number)[]; message?: string }[] } | null,
  status: number,
): string {
  const first = data?.details?.find((d) => d.message);
  if (first?.message) {
    const field = first.path?.[0];
    const label = typeof field === 'string' ? (FIELD_LABEL[field] ?? field) : null;
    return label ? `${label}: ${first.message}` : first.message;
  }
  return data?.error ?? `Request failed (${status})`;
}
