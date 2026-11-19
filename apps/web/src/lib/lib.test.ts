/** Pure helpers behind the dashboard (FR 6.2 zoom, FR 6.3 filters). */
import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, clampPan, nextZoom } from './zoom';
import { toQueryString } from './query';
import { painClass, relativeAge } from './format';

describe('toQueryString', () => {
  it('drops empty values and keeps order', () => {
    expect(toQueryString({ status: 'SYNCED', priority: '', location: undefined, page: 2 })).toBe('?status=SYNCED&page=2');
  });
  it('encodes values', () => {
    expect(toQueryString({ username: "chw o'brien" })).toBe("?username=chw%20o'brien");
  });
  it('is empty when nothing is set', () => {
    expect(toQueryString({ a: '' })).toBe('');
  });
});

describe('zoom (FR 6.2)', () => {
  it('steps in and out within limits', () => {
    expect(nextZoom(1, 'in')).toBeGreaterThan(1);
    expect(nextZoom(MAX_ZOOM, 'in')).toBe(MAX_ZOOM);
    expect(nextZoom(MIN_ZOOM, 'out')).toBe(MIN_ZOOM);
  });
  it('keeps the zoomed photo covering the frame when panning', () => {
    // At 2x a 400 px wide photo is 800 px: it may move at most 200 px each way.
    expect(clampPan({ x: 500, y: -500 }, 2, { width: 400, height: 300 })).toEqual({ x: 200, y: -150 });
    expect(clampPan({ x: 50, y: 50 }, 1, { width: 400, height: 300 })).toEqual({ x: 0, y: 0 });
  });
});

describe('format', () => {
  it('colours pain levels', () => {
    expect(painClass(9)).toBe('pain-high');
    expect(painClass(5)).toBe('pain-mid');
    expect(painClass(2)).toBe('pain-low');
    expect(painClass(null)).toBe('');
  });
  it('says how long a case has waited', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(relativeAge('2026-11-20T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeAge('2026-11-20T07:00:00Z', now)).toBe('5 h ago');
    expect(relativeAge('2026-11-17T12:00:00Z', now)).toBe('3 days ago');
  });
});
