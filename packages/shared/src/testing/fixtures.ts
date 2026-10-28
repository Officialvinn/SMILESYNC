/**
 * Synthetic test data only. Never use real patient data (CLAUDE.md rule 5).
 */
import { generateAnonId } from '../domain/anonId.js';
import type { ViewType } from '../domain/enums.js';
import type { CaseSubmission } from '../domain/schemas.js';
import type { UploadPayload } from '../sync/types.js';

let counter = 0;

/** A small fake "image": just bytes, not a real photo. */
export function fakeImageBytes(sizeBytes: number, fill = 7): Uint8Array {
  return new Uint8Array(sizeBytes).fill(fill);
}

export function syntheticPayload(
  opts: { createdAt?: string; imageBytes?: number; extraImages?: number } = {},
): UploadPayload {
  counter++;
  const createdAt = opts.createdAt ?? new Date(Date.UTC(2026, 9, 1, 8, 0, counter)).toISOString();
  const views: ViewType[] = ['FRONT', 'UPPER_ARCH', 'LOWER_ARCH', ...Array<ViewType>(opts.extraImages ?? 0).fill('EXTRA')];
  const size = opts.imageBytes ?? 200 * 1024;
  const images = views.map((viewType) => ({
    meta: {
      id: crypto.randomUUID(),
      viewType,
      sizeKB: Math.ceil(size / 1024),
      capturedAt: createdAt,
      sha256: 'a'.repeat(64),
    },
    bytes: fakeImageBytes(size),
  }));
  const submission: CaseSubmission = {
    id: crypto.randomUUID(),
    createdAt,
    patient: {
      id: crypto.randomUUID(),
      anonId: generateAnonId(),
      name: `Synthetic Patient ${counter}`,
      age: 20 + (counter % 50),
      location: 'Narok',
      consentGiven: true,
      consentDate: createdAt,
    },
    images: images.map((i) => i.meta),
    assessment: { id: crypto.randomUUID(), painLevel: 1 + (counter % 10), duration: 'DAYS_1_TO_7' },
  };
  return { submission, images: images.map((i) => ({ id: i.meta.id, bytes: i.bytes })) };
}
