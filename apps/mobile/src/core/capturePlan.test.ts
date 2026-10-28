/** FR 3.2: guidance for the 3 standard views, plus optional extras. */
import { describe, expect, it } from 'vitest';
import { REQUIRED_VIEWS, VIEW_TYPES } from '@smilesync/shared';
import { VIEW_GUIDANCE, captureProgress } from './capturePlan';
import { MAX_EXTRA_IMAGES } from './compression';

describe('VIEW_GUIDANCE', () => {
  it('has a title and at least two steps for every view', () => {
    for (const v of VIEW_TYPES) {
      expect(VIEW_GUIDANCE[v].title.length).toBeGreaterThan(0);
      expect(VIEW_GUIDANCE[v].steps.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('captureProgress', () => {
  it('asks for the required views in order', () => {
    expect(captureProgress([])).toMatchObject({ next: 'FRONT', done: 0, total: 3, canFinish: false });
    expect(captureProgress(['FRONT'])).toMatchObject({ next: 'UPPER_ARCH', done: 1 });
    expect(captureProgress(['UPPER_ARCH'])).toMatchObject({ next: 'FRONT', done: 1 });
  });

  it('can finish once all 3 required views exist', () => {
    expect(captureProgress([...REQUIRED_VIEWS])).toMatchObject({ next: null, done: 3, canFinish: true, canAddExtra: true });
  });

  it('extras do not count towards the required views and are capped', () => {
    const extras = Array.from({ length: MAX_EXTRA_IMAGES }, () => 'EXTRA' as const);
    expect(captureProgress(['FRONT', ...extras])).toMatchObject({ done: 1, canFinish: false, canAddExtra: false });
  });
});
