/** NFR 1 field encryption and fail-fast configuration. */
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FieldCrypto } from '../src/security/fieldCrypto.js';
import { loadConfig } from '../src/config.js';
import { validateNewSecret } from '../src/auth/passwords.js';

describe('NFR 1 AES-256-GCM field encryption', () => {
  const fc = new FieldCrypto(randomBytes(32).toString('base64'));

  it('round-trips and never stores the plaintext', () => {
    const stored = fc.encrypt('Synthetic Patient Wanjiru');
    expect(stored).not.toContain('Wanjiru');
    expect(fc.decrypt(stored)).toBe('Synthetic Patient Wanjiru');
  });

  it('uses a fresh IV each time', () => {
    expect(fc.encrypt('same')).not.toBe(fc.encrypt('same'));
  });

  it('detects tampering', () => {
    const parts = fc.encrypt('Synthetic').split(':');
    parts[3] = Buffer.from('tampered!').toString('base64');
    expect(() => fc.decrypt(parts.join(':'))).toThrow();
  });

  it('cannot be read with another key', () => {
    const other = new FieldCrypto(randomBytes(32).toString('base64'));
    expect(() => other.decrypt(fc.encrypt('Synthetic'))).toThrow();
  });

  it('rejects keys that are not 256-bit', () => {
    expect(() => new FieldCrypto(randomBytes(16).toString('base64'))).toThrow();
  });
});

describe('configuration', () => {
  const base = {
    DATABASE_URL: 'postgresql://x',
    JWT_SECRET: 'x'.repeat(32),
    PATIENT_DATA_KEY: randomBytes(32).toString('base64'),
  };

  it('accepts a complete config', () => {
    expect(loadConfig(base).PORT).toBe(3000);
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a wrong-sized data key', () => {
    expect(() => loadConfig({ ...base, PATIENT_DATA_KEY: 'abc' })).toThrow(/PATIENT_DATA_KEY/);
  });

  it('refuses a weak bcrypt cost in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', BCRYPT_COST: '4' })).toThrow(/BCRYPT_COST/);
  });
});

describe('FR 1.1 credential rules', () => {
  it('CHWs need a 6-digit PIN; others need a 10+ character password', () => {
    expect(validateNewSecret('CHW', '482913')).toBeNull();
    expect(validateNewSecret('CHW', 'password12')).not.toBeNull();
    expect(validateNewSecret('DENTIST', 'short')).not.toBeNull();
    expect(validateNewSecret('ADMIN', 'long-enough-pass')).toBeNull();
  });
});

describe('synthetic seed images', () => {
  it('are valid PNGs, differ per case, and stay small', async () => {
    const { syntheticOralImage } = await import('../prisma/syntheticImage.js');
    const a = syntheticOralImage('FRONT', 1);
    const b = syntheticOralImage('FRONT', 2);
    expect(a.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(a.readUInt32BE(16)).toBe(640); // IHDR width
    expect(Buffer.compare(a, b)).not.toBe(0);
    for (const v of ['FRONT', 'UPPER_ARCH', 'LOWER_ARCH'] as const) expect(syntheticOralImage(v, 0).length).toBeLessThan(200_000);
  });
});
