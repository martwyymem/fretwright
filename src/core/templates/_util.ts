// SPDX-License-Identifier: GPL-3.0-or-later
/** Small drawing helpers shared by the top-view templates. */
import type { Shape, Vec2 } from '../geom';
import { segment, text, v } from '../geom';
import { mmToIn } from '../units';

export const mm = (x: number, digits = 2): string => `${x.toFixed(digits)} mm`;
export const mmIn = (x: number): string => `${x.toFixed(1)} mm (${mmToIn(x).toFixed(2)}″)`;

/** Small "+" cross marker of the given half-size. */
export function cross(c: Vec2, r: number): Shape[] {
  return [segment(v(c.x - r, c.y), v(c.x + r, c.y)), segment(v(c.x, c.y - r), v(c.x, c.y + r))];
}

/** Lines of text stacked downward from `at` (first line at `at`). */
export function textBlock(at: Vec2, lines: string[], size = 3, gap = 1.6): Shape[] {
  return lines.map((l, i) => text(v(at.x, at.y - i * size * gap), l, i === 0 ? size * 1.4 : size));
}

/** Point-in-convex-polygon test (either winding), with tolerance. */
export function insideConvex(p: Vec2, poly: readonly Vec2[], eps = 1e-6): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) <= eps) continue;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
