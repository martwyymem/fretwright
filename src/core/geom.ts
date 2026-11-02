// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * 2D geometry primitives and the Drawing contract shared by template builders and exporters.
 *
 * COORDINATE CONVENTION (see docs/ARCHITECTURE.md):
 * - Units: millimetres.
 * - Math axes: +x right, +y UP (exporters flip for SVG/PDF).
 * - Instrument top view, face up, headstock to the LEFT, bridge to the RIGHT.
 *   Origin = midpoint of fret 0 (the nut-side fret line / zero fret position) on the centerline.
 *   +x runs along the centerline toward the bridge. +y is the BASS side.
 * - Templates that are not top views (side profiles, cross-sections, gauges) use their own
 *   local frame but keep mm and +y up.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => v(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => v(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => v(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b));
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l === 0 ? v(0, 0) : scale(a, 1 / l);
};
/** Rotate 90° counter-clockwise. */
export const perp = (a: Vec2): Vec2 => v(-a.y, a.x);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const rotate = (a: Vec2, rad: number, about: Vec2 = v(0, 0)): Vec2 => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const d = sub(a, about);
  return v(about.x + d.x * c - d.y * s, about.y + d.x * s + d.y * c);
};

/** Intersection of infinite lines (p1,p2) and (p3,p4); null if parallel. */
export function lineIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(p3, p1), d2) / den;
  return add(p1, scale(d1, t));
}

// ---------------------------------------------------------------------------
// Drawing contract
// ---------------------------------------------------------------------------

/**
 * Only polylines, circles and text. Curves (Béziers, arcs) are flattened by template
 * builders with `flattenCubic` / `arcPoints` at ≤ 0.05 mm chord error so every exporter
 * stays trivial and exact.
 */
export type Shape =
  | { kind: 'polyline'; points: Vec2[]; closed: boolean }
  | { kind: 'circle'; center: Vec2; r: number }
  | {
      kind: 'text';
      at: Vec2;
      text: string;
      /** Cap height in mm. */
      size: number;
      anchor?: 'start' | 'middle' | 'end';
      /** Degrees, counter-clockwise. */
      rotate?: number;
    };

/**
 * Layer semantics drive styling in every exporter:
 * - cut:        lines the builder cuts/routes along (solid, heavy)
 * - slot:       fret slots / saw lines (solid, thin)
 * - mark:       drill points, inlay centres, positions to transfer (solid, thin)
 * - reference:  centerline, strings, construction (dashed, light)
 * - annotation: text, dimensions, labels (no stroke style; text)
 */
export type LayerKind = 'cut' | 'slot' | 'mark' | 'reference' | 'annotation';

export interface Layer {
  /** Stable machine name, used as DXF layer name / SVG group id. [a-z0-9_-]+ */
  name: string;
  kind: LayerKind;
  shapes: Shape[];
}

export interface Drawing {
  /** Same as the template id that built it. */
  id: string;
  title: string;
  layers: Layer[];
  /** Optional free-text notes printed on the template (e.g. key dimensions). */
  notes?: string[];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function shapeBounds(s: Shape): Bounds | null {
  switch (s.kind) {
    case 'polyline': {
      if (s.points.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of s.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      return { minX, minY, maxX, maxY };
    }
    case 'circle':
      return { minX: s.center.x - s.r, minY: s.center.y - s.r, maxX: s.center.x + s.r, maxY: s.center.y + s.r };
    case 'text': {
      // Rough estimate; good enough for page layout.
      const w = s.text.length * s.size * 0.6;
      const a = s.anchor ?? 'start';
      const x0 = a === 'start' ? s.at.x : a === 'middle' ? s.at.x - w / 2 : s.at.x - w;
      return { minX: x0, minY: s.at.y, maxX: x0 + w, maxY: s.at.y + s.size };
    }
  }
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function drawingBounds(d: Drawing): Bounds | null {
  let b: Bounds | null = null;
  for (const l of d.layers) for (const s of l.shapes) b = unionBounds(b, shapeBounds(s));
  return b;
}

export const polyline = (points: Vec2[], closed = false): Shape => ({ kind: 'polyline', points, closed });
export const segment = (a: Vec2, b: Vec2): Shape => ({ kind: 'polyline', points: [a, b], closed: false });
export const circle = (center: Vec2, r: number): Shape => ({ kind: 'circle', center, r });
export const text = (
  at: Vec2,
  value: string,
  size = 3,
  opts: { anchor?: 'start' | 'middle' | 'end'; rotate?: number } = {},
): Shape => ({ kind: 'text', at, text: value, size, ...opts });

/** Flatten a cubic Bézier to points (includes both endpoints). */
export function flattenCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance = 0.05): Vec2[] {
  // Conservative segment count from control-polygon length.
  const ctrl = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
  const n = Math.max(2, Math.ceil(Math.sqrt(ctrl / Math.max(tolerance, 1e-4)) * 1.5));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    out.push(v(a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y));
  }
  return out;
}

/** Points on a circular arc (radians, CCW from a0 to a1), chord error ≤ tolerance. */
export function arcPoints(center: Vec2, r: number, a0: number, a1: number, tolerance = 0.05): Vec2[] {
  const sweep = a1 - a0;
  const step = r > tolerance ? 2 * Math.acos(1 - tolerance / r) : Math.PI / 8;
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-3)));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push(v(center.x + r * Math.cos(a), center.y + r * Math.sin(a)));
  }
  return out;
}
