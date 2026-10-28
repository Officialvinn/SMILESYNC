/**
 * FR 2.2: anonymised patient ID, generated on the device with no network.
 *
 * Format SS-XXXX-XXXX: 8 Crockford base32 characters (40 random bits).
 * Crockford base32 leaves out I, L, O and U, so the ID is easy to read aloud
 * or copy by hand. The ID is random and never derived from patient details.
 * The server's unique constraint is the backstop against a collision.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const ANON_ID_PATTERN = /^SS-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export type RandomBytes = (n: number) => Uint8Array;

const defaultRandom: RandomBytes = (n) => {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

export function generateAnonId(randomBytes: RandomBytes = defaultRandom): string {
  const bytes = randomBytes(8);
  // Each byte picks one of 32 characters; 256 is a multiple of 32, so no bias.
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
  return `SS-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}
