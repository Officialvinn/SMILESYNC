import { describe, expect, it } from 'vitest';
import { toBase64, toHex } from './hex';

describe('byte helpers', () => {
  it('toHex', () => {
    expect(toHex(Uint8Array.from([0, 15, 255]))).toBe('000fff');
  });
  it.each([0, 1, 2, 3, 4, 5, 100, 257])('toBase64 matches Node for %i bytes', (n) => {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
