// SPDX-License-Identifier: GPL-3.0-or-later
/** Clip helpers for drawing partial views (neck & headstock templates). */
import type { Vec2 } from '../geom';
import { lerp, v } from '../geom';

/**
 * Pieces of a polyline (closed or open) that lie in the half-plane x ≤ xMax, as open polylines.
 * Crossing points are interpolated exactly.
 */
export function clipPolylineX(points: readonly Vec2[], closed: boolean, xMax: number): Vec2[][] {
  const n = points.length;
  if (n === 0) return [];
  const inside = (p: Vec2) => p.x <= xMax;
  if (points.every(inside)) return [closed ? [...points, points[0]!] : [...points]];
  // Start at an outside point so every run is complete.
  const start = points.findIndex((p) => !inside(p));
  const seq: Vec2[] = [];
  const count = closed ? n + 1 : n;
  const first = closed ? start : 0;
  for (let i = 0; i < count; i++) seq.push(points[(first + i) % n]!);
  const out: Vec2[][] = [];
  let cur: Vec2[] | null = null;
  for (let i = 0; i < seq.length; i++) {
    const p = seq[i]!;
    const prev = i > 0 ? seq[i - 1]! : null;
    if (inside(p)) {
      if (!cur) {
        cur = [];
        if (prev && !inside(prev)) cur.push(cross(prev, p, xMax));
      }
      cur.push(p);
    } else if (cur) {
      cur.push(cross(prev!, p, xMax));
      if (cur.length >= 2) out.push(cur);
      cur = null;
    }
  }
  if (cur && cur.length >= 2) out.push(cur);
  return out;
}

function cross(a: Vec2, b: Vec2, x: number): Vec2 {
  const t = (x - a.x) / (b.x - a.x);
  const p = lerp(a, b, t);
  return v(x, p.y);
}
