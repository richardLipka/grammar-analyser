import { useCallback, useEffect, useRef, useState, RefObject, PointerEvent as ReactPointerEvent } from 'react';

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Pan & zoom for an SVG canvas: drag to pan, wheel zooms towards the cursor
 * (a non-passive listener, so the page itself does not scroll), and "fit"
 * frames the whole content. A drag never counts as a click on a node.
 */
export function usePanZoom(
  containerRef: RefObject<HTMLDivElement | null>,
  content: { width: number; height: number },
  enabled: boolean
) {
  const [view, setView] = useState<ViewTransform>({ x: 20, y: 20, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const lastDragMoved = useRef(false);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || content.width === 0) return;
    const k = clamp(Math.min((r.width - 40) / content.width, (r.height - 50) / content.height, 1.25), MIN_ZOOM, 1.25);
    setView({
      k,
      x: Math.max(10, (r.width - content.width * k) / 2),
      y: Math.max(10, (r.height - content.height * k) / 2)
    });
  }, [containerRef, content.width, content.height]);

  // Re-frame whenever the content changes size (new tree, other automaton)
  useEffect(() => {
    if (enabled) fit();
  }, [enabled, fit]);

  useEffect(() => {
    const el = containerRef.current;
    if (!enabled || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView(v => {
        const k = clamp(v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1), MIN_ZOOM, MAX_ZOOM);
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef, enabled]);

  const zoomBy = useCallback((factor: number) => {
    const el = containerRef.current;
    const r = el?.getBoundingClientRect();
    const cx = r ? r.width / 2 : 0;
    const cy = r ? r.height / 2 : 0;
    setView(v => {
      const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  }, [containerRef]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    lastDragMoved.current = false;
    setIsDragging(true);

    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    };
    const onUp = () => {
      lastDragMoved.current = drag.current?.moved ?? false;
      drag.current = null;
      setIsDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** True when the last pointer gesture was a drag (used to ignore the click that ends it). */
  const wasDragged = () => lastDragMoved.current;

  return { view, fit, zoomBy, onPointerDown, isDragging, wasDragged };
}
