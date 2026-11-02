// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * On-screen preview of a Drawing as inline SVG. Independent of the SVG exporter.
 * Drawing space is mm with +y up; SVG user space is mm with +y down, so every y is negated.
 * Fit-to-view, wheel zoom around the cursor, drag to pan, keyboard (+ − 0 arrows), scale bar.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent } from 'react';
import type { Drawing, Layer, Shape } from '../core';
import { drawingBounds, type DisplayUnit } from '../core';

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 0.06;

function fitBox(d: Drawing): ViewBox {
  const b = drawingBounds(d);
  if (!b || !Number.isFinite(b.minX)) return { x: -50, y: -50, w: 100, h: 100 };
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const p = Math.max(w, h) * PAD;
  // SVG y = −drawing y, so the top edge is −maxY.
  return { x: b.minX - p, y: -b.maxY - p, w: w + 2 * p, h: h + 2 * p };
}

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

const ShapeEl = memo(function ShapeEl({ s }: { s: Shape }) {
  switch (s.kind) {
    case 'polyline': {
      const pts = s.points.map((p) => `${fmt(p.x)},${fmt(-p.y)}`).join(' ');
      return s.closed ? <polygon data-shape="polyline" points={pts} /> : <polyline data-shape="polyline" points={pts} />;
    }
    case 'circle':
      return <circle data-shape="circle" cx={fmt(s.center.x)} cy={fmt(-s.center.y)} r={fmt(s.r)} />;
    case 'text': {
      const x = fmt(s.at.x);
      const y = fmt(-s.at.y);
      return (
        <text
          data-shape="text"
          x={x}
          y={y}
          fontSize={fmt(s.size / 0.7)}
          textAnchor={s.anchor ?? 'start'}
          transform={s.rotate ? `rotate(${fmt(-s.rotate)} ${x} ${y})` : undefined}
        >
          {s.text}
        </text>
      );
    }
  }
});

const LayerEl = memo(function LayerEl({ layer }: { layer: Layer }) {
  return (
    <g className={`dv-layer dv-${layer.kind}`} data-layer={layer.name}>
      {layer.shapes.map((s, i) => (
        <ShapeEl key={i} s={s} />
      ))}
    </g>
  );
});

/** A round length (1, 2 or 5 × 10^k) close to `target`. */
export function niceLength(target: number): number {
  if (!(target > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  const m = target / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

export interface DrawingViewProps {
  drawing: Drawing;
  unit?: DisplayUnit;
  /** Accessible name for the preview. */
  label?: string;
}

export function DrawingView({ drawing, unit = 'mm', label }: DrawingViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const fitted = useMemo(() => fitBox(drawing), [drawing]);
  const [userBox, setUserBox] = useState<ViewBox | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  // A different template resets the view; edits to the same template keep the user's zoom.
  useEffect(() => setUserBox(null), [drawing.id]);

  const vb = userBox ?? fitted;
  const vbRef = useRef(vb);
  vbRef.current = vb;

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** px per mm for preserveAspectRatio="xMidYMid meet". */
  const pxPerMm = size.w > 0 && size.h > 0 ? Math.min(size.w / vb.w, size.h / vb.h) : 0;

  const toUser = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    const box = vbRef.current;
    if (!el) return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const s = Math.min(r.width / box.w, r.height / box.h);
    const ox = (r.width - box.w * s) / 2;
    const oy = (r.height - box.h * s) / 2;
    return { x: box.x + (clientX - r.left - ox) / s, y: box.y + (clientY - r.top - oy) / s };
  }, []);

  const zoomAt = useCallback((factor: number, at?: { x: number; y: number }) => {
    const box = vbRef.current;
    const c = at ?? { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const w = Math.min(Math.max(box.w * factor, 1), 1e5);
    const k = w / box.w;
    setUserBox({ x: c.x - (c.x - box.x) * k, y: c.y - (c.y - box.y) * k, w, h: box.h * k });
  }, []);

  const panBy = useCallback((dxMm: number, dyMm: number) => {
    const box = vbRef.current;
    setUserBox({ ...box, x: box.x + dxMm, y: box.y + dyMm });
  }, []);

  // Wheel needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(e.deltaY * 0.0015), toUser(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, toUser]);

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / old browsers */
    }
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const box = vbRef.current;
    const r = e.currentTarget.getBoundingClientRect();
    const s = r.width && r.height ? Math.min(r.width / box.w, r.height / box.h) : 1;
    panBy(-(e.clientX - d.x) / s, -(e.clientY - d.y) / s);
    drag.current = { ...d, x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (e: RKeyboardEvent) => {
    const step = vb.w * 0.1;
    const map: Record<string, () => void> = {
      '+': () => zoomAt(1 / 1.25),
      '=': () => zoomAt(1 / 1.25),
      '-': () => zoomAt(1.25),
      '0': () => setUserBox(null),
      ArrowLeft: () => panBy(-step, 0),
      ArrowRight: () => panBy(step, 0),
      ArrowUp: () => panBy(0, -step),
      ArrowDown: () => panBy(0, step),
    };
    const fn = map[e.key];
    if (fn && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      fn();
    }
  };

  // Scale bar: ~120 px long, in the chosen unit.
  let bar: { px: number; label: string } | null = null;
  if (pxPerMm > 0) {
    if (unit === 'in') {
      const inches = niceLength(120 / pxPerMm / 25.4);
      bar = { px: inches * 25.4 * pxPerMm, label: `${inches} in` };
    } else {
      const mm = niceLength(120 / pxPerMm);
      bar = { px: mm * pxPerMm, label: mm >= 1000 ? `${mm / 1000} m` : `${mm} mm` };
    }
  }

  const viewBox = `${fmt(vb.x)} ${fmt(vb.y)} ${fmt(vb.w)} ${fmt(vb.h)}`;

  return (
    <div className="dv">
      <svg
        ref={svgRef}
        className="dv-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label ?? `Preview: ${drawing.title}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => setUserBox(null)}
      >
        {drawing.layers.map((l, i) => (
          <LayerEl key={`${l.name}-${i}`} layer={l} />
        ))}
      </svg>
      <div className="dv-controls">
        <button type="button" onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom in" title="Zoom in (+)">
          +
        </button>
        <button type="button" onClick={() => zoomAt(1.25)} aria-label="Zoom out" title="Zoom out (−)">
          −
        </button>
        <button type="button" onClick={() => setUserBox(null)} title="Fit to view (0 or double-click)">
          Fit
        </button>
      </div>
      {bar && (
        <div className="dv-scalebar" aria-hidden="true">
          <div className="dv-scalebar-line" style={{ width: `${bar.px}px` }} />
          <span>{bar.label}</span>
        </div>
      )}
    </div>
  );
}
