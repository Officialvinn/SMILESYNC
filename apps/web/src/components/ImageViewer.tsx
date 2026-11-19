/**
 * FR 6.2: full-screen photo viewer with zoom (buttons, mouse wheel, keyboard)
 * and drag to pan. Arrow keys move between photos; Escape closes.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { MAX_ZOOM, MIN_ZOOM, clampPan, nextZoom } from '../lib/zoom';

export interface ViewerImage {
  url: string;
  label: string;
}

export function ImageViewer({ images, start, onClose }: { images: ViewerImage[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const size = () => ({ width: frame.current?.clientWidth ?? 1, height: frame.current?.clientHeight ?? 1 });
  const zoomTo = useCallback((z: number) => {
    setZoom(z);
    setPan((p) => clampPan(p, z, { width: frame.current?.clientWidth ?? 1, height: frame.current?.clientHeight ?? 1 }));
  }, []);
  const show = useCallback(
    (i: number) => {
      setIndex((i + images.length) % images.length);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    },
    [images.length],
  );

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') show(index + 1);
      else if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === '+' || e.key === '=') zoomTo(nextZoom(zoom, 'in'));
      else if (e.key === '-') zoomTo(nextZoom(zoom, 'out'));
      else if (e.key === '0') zoomTo(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, zoom, onClose, show, zoomTo]);

  const onWheel = (e: WheelEvent) => zoomTo(nextZoom(zoom, e.deltaY < 0 ? 'in' : 'out'));
  const onDown = (e: PointerEvent) => {
    if (zoom === 1) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, pan };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) setPan(clampPan({ x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y }, zoom, size()));
  };

  const img = images[index]!;
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Photo: ${img.label}`}>
      <div className="viewer-bar">
        <span>
          {img.label} ({index + 1} of {images.length})
        </span>
        <div className="viewer-tools">
          <button type="button" onClick={() => show(index - 1)} aria-label="Previous photo">
            ‹
          </button>
          <button type="button" onClick={() => show(index + 1)} aria-label="Next photo">
            ›
          </button>
          <button type="button" onClick={() => zoomTo(nextZoom(zoom, 'out'))} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
            −
          </button>
          <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
          <button type="button" onClick={() => zoomTo(nextZoom(zoom, 'in'))} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => zoomTo(1)} aria-label="Fit to screen">
            Fit
          </button>
          <button type="button" ref={closeBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div
        ref={frame}
        className={`viewer-frame ${zoom > 1 ? 'pannable' : ''}`}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => zoomTo(zoom > 1 ? 1 : 2.25)}
      >
        <img
          src={img.url}
          alt={img.label}
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        />
      </div>
      <p className="viewer-hint">Scroll or + / − to zoom, drag to move, double-click to zoom in or out, arrows for next photo, Esc to close.</p>
    </div>
  );
}
