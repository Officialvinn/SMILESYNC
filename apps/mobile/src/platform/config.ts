/**
 * API address, set at build time with EXPO_PUBLIC_API_URL.
 * Only https is accepted (NFR 1: TLS in transit), including in development,
 * where Caddy serves the local stack with its own certificate.
 */
const DEFAULT_API_URL = 'https://localhost/api';

function readApiUrl(): string {
  const value = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');
  if (!value.startsWith('https://')) {
    throw new Error(`EXPO_PUBLIC_API_URL must start with https:// (got ${value})`);
  }
  return value;
}

export const API_URL = readApiUrl();
export const REQUEST_TIMEOUT_MS = 20_000;
