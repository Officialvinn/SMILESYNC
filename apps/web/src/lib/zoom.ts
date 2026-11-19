/** FR 6.2: zoom and pan maths for the photo viewer. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
const STEP = 1.5;

export function nextZoom(current: number, dir: 'in' | 'out'): number {
  const z = dir === 'in' ? current * STEP : current / STEP;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
}

/** Limits panning so the zoomed photo always covers its frame. */
export function clampPan(pan: { x: number; y: number }, zoom: number, frame: { width: number; height: number }) {
  const maxX = ((zoom - 1) * frame.width) / 2;
  const maxY = ((zoom - 1) * frame.height) / 2;
  const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, v)) || 0;
  return { x: clamp(pan.x, maxX), y: clamp(pan.y, maxY) };
}
