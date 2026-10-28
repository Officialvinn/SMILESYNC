/**
 * FR 1.1 session tokens (JWT, HS256).
 * CHW tokens last 7 days because CHWs work offline for days; the app refreshes
 * the token on each sync. Dashboard tokens last 8 hours.
 * Each token carries the user's tokenVersion, so deactivating or resetting an
 * account (FR 8.1) revokes every token already issued.
 */
import jwt from 'jsonwebtoken';
import { ROLES, type Role } from '@smilesync/shared';

export const TOKEN_TTL_SECONDS: Record<Role, number> = {
  CHW: 7 * 24 * 3600,
  DENTIST: 8 * 3600,
  ADMIN: 8 * 3600,
};

export interface TokenClaims {
  sub: string;
  role: Role;
  tv: number;
}

export function signToken(claims: TokenClaims, secret: string, now = new Date()): { token: string; expiresAt: Date } {
  const ttl = TOKEN_TTL_SECONDS[claims.role];
  const iat = Math.floor(now.getTime() / 1000);
  const token = jwt.sign({ role: claims.role, tv: claims.tv, iat }, secret, {
    algorithm: 'HS256',
    subject: claims.sub,
    expiresIn: ttl,
    issuer: 'smilesync-api',
  });
  return { token, expiresAt: new Date((iat + ttl) * 1000) };
}

/** Returns the claims, or null for any invalid, expired or tampered token. */
export function verifyToken(token: string, secret: string): TokenClaims | null {
  try {
    const p = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'smilesync-api' });
    if (typeof p !== 'object' || typeof p.sub !== 'string' || typeof p.tv !== 'number') return null;
    if (!(ROLES as readonly string[]).includes(p.role)) return null;
    return { sub: p.sub, role: p.role as Role, tv: p.tv };
  } catch {
    return null;
  }
}
