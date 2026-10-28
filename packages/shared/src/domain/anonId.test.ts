/** FR 2.2: system-generated anonymised patient ID. */
import { describe, expect, it } from 'vitest';
import { ANON_ID_PATTERN, generateAnonId } from './anonId.js';

describe('FR 2.2 generateAnonId', () => {
  it('has the form SS-XXXX-XXXX using unambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateAnonId();
      expect(id).toMatch(ANON_ID_PATTERN);
      expect(id).not.toMatch(/[ILOU]/); // Crockford base32 drops look-alike letters
    }
  });

  it('is random, not derived from patient details', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => generateAnonId()));
    expect(ids.size).toBe(5000);
  });

  it('uses the injected random source, so it works offline on the device', () => {
    const zeros = (n: number) => new Uint8Array(n);
    expect(generateAnonId(zeros)).toBe('SS-0000-0000');
    const ones = (n: number) => new Uint8Array(n).fill(255);
    expect(generateAnonId(ones)).toBe('SS-ZZZZ-ZZZZ');
  });
});
