/**
 * FR 3.3: keep each whole submission under 2 MB.
 *
 * A case has the 3 required views plus up to 3 extras, so at most 6 images.
 * Each image gets an equal share of the budget, which means the CHW never has
 * to retake an earlier photo because a later one was large.
 *
 * Each photo is re-encoded as JPEG, trying smaller sizes until it fits.
 * Re-encoding also drops EXIF metadata such as GPS (NFR 6, data minimisation).
 */
import { MAX_SUBMISSION_BYTES } from '@smilesync/shared';

export const MAX_EXTRA_IMAGES = 3;
export const MAX_IMAGES = 3 + MAX_EXTRA_IMAGES;
/** Room left for the JSON part of the upload (patient, assessment, image metadata). */
export const JSON_ALLOWANCE_BYTES = 32 * 1024;
export const IMAGE_BUDGET_BYTES = MAX_SUBMISSION_BYTES - JSON_ALLOWANCE_BYTES;
export const PER_IMAGE_MAX_BYTES = Math.floor(IMAGE_BUDGET_BYTES / MAX_IMAGES);

export interface CompressionStep {
  /** Longest edge in pixels. */
  maxEdge: number;
  /** JPEG quality, 0 to 1. */
  quality: number;
}

/** Tried in order. 1600 px at 0.7 usually lands well under the limit for a phone photo. */
export const COMPRESSION_STEPS: readonly CompressionStep[] = [
  { maxEdge: 1600, quality: 0.7 },
  { maxEdge: 1280, quality: 0.6 },
  { maxEdge: 1024, quality: 0.5 },
  { maxEdge: 800, quality: 0.4 },
];

export class ImageTooLargeError extends Error {
  constructor() {
    super('This photo could not be made small enough. Retake it with steadier hands and good light.');
    this.name = 'ImageTooLargeError';
  }
}

/** Resize so the longer edge is at most maxEdge. Null when the photo is already small enough. */
export function resizeFor(width: number, height: number, maxEdge: number): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/** Encodes with each step until the result fits under `limit` bytes. */
export async function compressToLimit<B extends Uint8Array>(
  encode: (step: CompressionStep, index: number) => Promise<B>,
  limit: number = PER_IMAGE_MAX_BYTES,
): Promise<{ bytes: B; step: CompressionStep }> {
  for (const [i, step] of COMPRESSION_STEPS.entries()) {
    const bytes = await encode(step, i);
    if (bytes.byteLength <= limit) return { bytes, step };
  }
  throw new ImageTooLargeError();
}
