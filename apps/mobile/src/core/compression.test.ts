/** FR 3.3: each submission stays under 2 MB. */
import { describe, expect, it } from 'vitest';
import { MAX_SUBMISSION_BYTES } from '@smilesync/shared';
import {
  COMPRESSION_STEPS, IMAGE_BUDGET_BYTES, ImageTooLargeError, MAX_EXTRA_IMAGES, MAX_IMAGES,
  PER_IMAGE_MAX_BYTES, compressToLimit, resizeFor,
} from './compression';

describe('budget', () => {
  it('six images at the per-image limit plus the JSON allowance fit under 2 MB', () => {
    expect(MAX_IMAGES).toBe(3 + MAX_EXTRA_IMAGES);
    expect(PER_IMAGE_MAX_BYTES * MAX_IMAGES).toBeLessThanOrEqual(IMAGE_BUDGET_BYTES);
    expect(IMAGE_BUDGET_BYTES).toBeLessThan(MAX_SUBMISSION_BYTES);
  });

  it('steps get smaller and never upscale below a readable size', () => {
    for (let i = 1; i < COMPRESSION_STEPS.length; i++) {
      expect(COMPRESSION_STEPS[i]!.maxEdge).toBeLessThanOrEqual(COMPRESSION_STEPS[i - 1]!.maxEdge);
      expect(COMPRESSION_STEPS[i]!.quality).toBeLessThanOrEqual(COMPRESSION_STEPS[i - 1]!.quality);
    }
    expect(COMPRESSION_STEPS.at(-1)!.maxEdge).toBeGreaterThanOrEqual(800);
  });
});

describe('resizeFor', () => {
  it('shrinks the longer edge and keeps the aspect ratio', () => {
    expect(resizeFor(4032, 3024, 1600)).toEqual({ width: 1600 });
    expect(resizeFor(3024, 4032, 1600)).toEqual({ height: 1600 });
  });
  it('never enlarges a small photo', () => {
    expect(resizeFor(1200, 900, 1600)).toBeNull();
  });
});

describe('compressToLimit', () => {
  const sizes = (...n: number[]) => {
    const tried: number[] = [];
    const encode = async (_step: unknown, i: number) => {
      tried.push(i);
      return new Uint8Array(n[i]!);
    };
    return { encode, tried };
  };

  it('uses the first step that fits', async () => {
    const { encode, tried } = sizes(500_000, 300_000, 100);
    const r = await compressToLimit(encode, 320_000);
    expect(r.bytes.byteLength).toBe(300_000);
    expect(r.step).toEqual(COMPRESSION_STEPS[1]);
    expect(tried).toEqual([0, 1]);
  });

  it('throws when even the smallest step is too big', async () => {
    const { encode } = sizes(...COMPRESSION_STEPS.map(() => 999_999));
    await expect(compressToLimit(encode, 320_000)).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});
