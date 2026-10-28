/** FR 1.1: password and PIN hashing with bcrypt. */
import bcrypt from 'bcryptjs';
import { passwordSchema, pinSchema, type Role } from '@smilesync/shared';

export async function hashSecret(secret: string, cost: number): Promise<string> {
  return bcrypt.hash(secret, cost);
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

/** CHWs use a 6-digit PIN (FR 1.1); dentists and admins use a password. */
export function validateNewSecret(role: Role, secret: string): string | null {
  const result = role === 'CHW' ? pinSchema.safeParse(secret) : passwordSchema.safeParse(secret);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid credential');
}
