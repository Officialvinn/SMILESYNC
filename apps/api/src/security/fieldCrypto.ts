/**
 * NFR 1: AES-256-GCM encryption for sensitive fields (the patient's name, FR 2.1).
 * Stored form: "v1:<iv>:<auth tag>:<ciphertext>", each part base64.
 * The "v1" prefix leaves room for key rotation later.
 *
 * Binary form for image files: "SS1" + iv (12) + tag (16) + ciphertext. The
 * image id is bound in as associated data, so one file cannot be swapped for another.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const BINARY_MAGIC = Buffer.from('SS1', 'latin1');

export class FieldCrypto {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) throw new Error('AES-256 key must be 32 bytes');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
  }

  encryptBytes(plaintext: Uint8Array, associatedData: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([BINARY_MAGIC, iv, cipher.getAuthTag(), ct]);
  }

  /** Throws if the data was altered, or belongs to a different associatedData. */
  decryptBytes(stored: Uint8Array, associatedData: string): Buffer {
    const buf = Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength);
    if (buf.length < 31 || !buf.subarray(0, 3).equals(BINARY_MAGIC)) throw new Error('Unrecognised encrypted file');
    const decipher = createDecipheriv('aes-256-gcm', this.key, buf.subarray(3, 15));
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(buf.subarray(15, 31));
    return Buffer.concat([decipher.update(buf.subarray(31)), decipher.final()]);
  }

  decrypt(stored: string): string {
    const [version, iv, tag, ct] = stored.split(':');
    if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error('Unrecognised encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
  }
}
