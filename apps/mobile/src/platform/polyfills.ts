/**
 * Hermes has no Web Crypto. generateAnonId (FR 2.2) and bcryptjs (FR 1.1)
 * read randomness from globalThis.crypto.getRandomValues, so provide it from
 * expo-crypto's secure generator. Imported first in index.ts.
 */
import { getRandomValues } from 'expo-crypto';

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = { ...(g.crypto ?? {}), getRandomValues };
}
