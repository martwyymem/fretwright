// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Import a closed outline (body or headstock) from an SVG file.
 *
 * Pure TypeScript (no DOMParser, so it runs in node tests): a small tag scanner finds <path>,
 * <polygon>, <polyline>, <rect>, <circle> and <ellipse> elements (honouring `transform` on them and
 * on enclosing <g>/<svg>, skipping <defs>/<clipPath>/<mask>/<symbol>/<marker>/<pattern>), parses
 * path data (M L H V C S Q T A Z, absolute and relative), turns arcs and quadratics into cubics,
 * and flattens to ≤ 0.05 mm at the final scale.
 *
 * Result frame (the "local" frame of `spec.body.customOutline` / `spec.headstock.customOutline`):
 * - Draw the outline with the ATTACHMENT END ON THE LEFT: the neck end of a body, the nut end
 *   of a headstock (its tip pointing right). y is flipped (SVG y-down → our y-up), so "up" in the
 *   drawing becomes +y (for a body: the bass side).
 * - Centred across: the outline's bounding box is centred on y = 0.
 * - x = 0 is where the outline's centre line (y = 0) first meets the outline from the left:
 *   the neck-pocket anchor of a body, the nut centre of a headstock. Anything sticking out past
 *   it (horns) gets negative x. Use `origin: 'min-x'` to put x = 0 at the leftmost point instead.
 * - Uniformly scaled so the overall length (x extent) = `targetLength`, or else the width
 *   (y extent) = `targetWidth`; without either, SVG user units are taken as mm.
 * - Closed, counter-clockwise, no duplicate points, no repeated last point.
 */
import type { Vec2 } from './geom';
import { flattenCubic, v } from './geom';
import { crossingsAtY, dedupeClosed, ensureCCW, polyBounds, signedArea } from './polygon';

export interface OutlineImportOptions {
  targetWidth?: number;
  targetLength?: number;
  /** Where x = 0 goes: 'centerline' (default, first crossing of y = 0 from the left) or 'min-x'. */
  origin?: 'centerline' | 'min-x';
  /** Chord tolerance in output mm. */
  tolerance?: number;
}

export interface OutlineImportResult {
  points: Vec2[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Affine transforms: [a, b, c, d, e, f] → x' = a·x + c·y + e, y' = b·x + d·y + f
// ---------------------------------------------------------------------------

type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Mat, p: Vec2): Vec2 => v(m[0] * p.x + m[2] * p.y + m[4], m[1] * p.x + m[3] * p.y + m[5]);

const NUM_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const nums = (s: string): number[] => (s.match(NUM_RE) ?? []).map(Number);

export function parseTransform(s: string | undefined): Mat {
  let m: Mat = IDENTITY;
  if (!s) return m;
  for (const [, name, args] of s.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const a = nums(args!);
    let t: Mat = IDENTITY;
    switch (name) {
      case 'matrix':
        if (a.length >= 6) t = [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!];
        break;
      case 'translate':
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(r), sn = Math.sin(r);
        const cx = a[1] ?? 0, cy = a[2] ?? 0;
        t = mul(mul([1, 0, 0, 1, cx, cy], [c, sn, -sn, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = mul(m, t);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Path data → subpaths of lines and cubics (absolute coordinates)
// ---------------------------------------------------------------------------

type Seg = { k: 'L'; p: Vec2 } | { k: 'C'; c1: Vec2; c2: Vec2; p: Vec2 };
export interface Subpath {
  start: Vec2;
  segs: Seg[];
  closed: boolean;
}

const ARG_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Endpoint-parameterised SVG arc → cubic segments (≤ 90° each). */
function arcToCubics(p0: Vec2, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p: Vec2): Seg[] {
  if (p0.x === p.x && p0.y === p.y) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [{ k: 'L', p }];
  const phi = (phiDeg * Math.PI) / 180;
  const cphi = Math.cos(phi), sphi = Math.sin(phi);
  const dx = (p0.x - p.x) / 2, dy = (p0.y - p.y) / 2;
  const x1 = cphi * dx + sphi * dy;
  const y1 = -sphi * dx + cphi * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let co = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) co = -co;
  const cx1 = (co * rx * y1) / ry;
  const cy1 = (-co * ry * x1) / rx;
  const cx = cphi * cx1 - sphi * cy1 + (p0.x + p.x) / 2;
  const cy = sphi * cx1 + cphi * cy1 + (p0.y + p.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number) => v(cx + rx * Math.cos(t) * cphi - ry * Math.sin(t) * sphi, cy + rx * Math.cos(t) * sphi + ry * Math.sin(t) * cphi);
  const deriv = (t: number) => v(-rx * Math.sin(t) * cphi - ry * Math.cos(t) * sphi, -rx * Math.sin(t) * sphi + ry * Math.cos(t) * cphi);
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step, b = a + step;
    const pa = pt(a), pb = i === n - 1 ? p : pt(b);
    const da = deriv(a), db = deriv(b);
    out.push({ k: 'C', c1: v(pa.x + k * da.x, pa.y + k * da.y), c2: v(pb.x - k * db.x, pb.y - k * db.y), p: pb });
  }
  return out;
}

/** Parse SVG path data. Throws on malformed data. */
export function parsePathData(d: string): Subpath[] {
  const subs: Subpath[] = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i]!)) i++;
  };
  const numRe = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const atNumber = () => {
    skip();
    numRe.lastIndex = i;
    return numRe.test(d);
  };
  const num = (): number => {
    skip();
    numRe.lastIndex = i;
    const m = numRe.exec(d);
    if (!m) throw new Error(`Bad number in path data at position ${i}`);
    i = numRe.lastIndex;
    return Number(m[0]);
  };
  const flag = (): boolean => {
    skip();
    const c = d[i];
    if (c !== '0' && c !== '1') throw new Error(`Bad arc flag in path data at position ${i}`);
    i++;
    return c === '1';
  };

  let cur = v(0, 0);
  let start = v(0, 0);
  let sub: Subpath | null = null;
  let lastC: Vec2 | null = null; // last cubic control point (for S)
  let lastQ: Vec2 | null = null; // last quadratic control point (for T)
  let cmd = '';
  const ensureSub = () => {
    if (!sub) {
      sub = { start: cur, segs: [], closed: false };
      subs.push(sub);
    }
    return sub;
  };

  for (;;) {
    skip();
    if (i >= d.length) break;
    const ch = d[i]!;
    if (/[a-zA-Z]/.test(ch)) {
      cmd = ch;
      i++;
    } else if (!cmd) {
      throw new Error('Path data must start with a command');
    } else if (cmd === 'z' || cmd === 'Z') {
      throw new Error(`Unexpected number after Z at position ${i}`);
    }
    if (!(cmd.toUpperCase() in ARG_COUNT)) throw new Error(`Unknown path command "${cmd}"`);

    if (cmd === 'Z' || cmd === 'z') {
      if (sub) {
        (sub as Subpath).closed = true;
        cur = start;
      }
      sub = null;
      lastC = lastQ = null;
      continue;
    }
    // One or more argument groups.
    do {
      // Re-read each group: after M the implicit command becomes L.
      const up = cmd.toUpperCase();
      const rel = cmd !== up;
      const R = (x: number, y: number) => (rel ? v(cur.x + x, cur.y + y) : v(x, y));
      let nextC: Vec2 | null = null;
      let nextQ: Vec2 | null = null;
      switch (up) {
        case 'M': {
          const p = R(num(), num());
          cur = start = p;
          sub = { start: p, segs: [], closed: false };
          subs.push(sub);
          cmd = rel ? 'l' : 'L'; // implicit lineto after the first pair
          break;
        }
        case 'L': {
          const p = R(num(), num());
          ensureSub().segs.push({ k: 'L', p });
          cur = p;
          break;
        }
        case 'H': {
          const x = num();
          const p = v(rel ? cur.x + x : x, cur.y);
          ensureSub().segs.push({ k: 'L', p });
          cur = p;
          break;
        }
        case 'V': {
          const y = num();
          const p = v(cur.x, rel ? cur.y + y : y);
          ensureSub().segs.push({ k: 'L', p });
          cur = p;
          break;
        }
        case 'C': {
          const c1 = R(num(), num()), c2 = R(num(), num()), p = R(num(), num());
          ensureSub().segs.push({ k: 'C', c1, c2, p });
          cur = p;
          nextC = c2;
          break;
        }
        case 'S': {
          const c1 = lastC ? v(2 * cur.x - lastC.x, 2 * cur.y - lastC.y) : cur;
          const c2 = R(num(), num()), p = R(num(), num());
          ensureSub().segs.push({ k: 'C', c1, c2, p });
          cur = p;
          nextC = c2;
          break;
        }
        case 'Q':
        case 'T': {
          const q: Vec2 = up === 'Q' ? R(num(), num()) : lastQ ? v(2 * cur.x - lastQ.x, 2 * cur.y - lastQ.y) : cur;
          const p = R(num(), num());
          ensureSub().segs.push({
            k: 'C',
            c1: v(cur.x + (2 / 3) * (q.x - cur.x), cur.y + (2 / 3) * (q.y - cur.y)),
            c2: v(p.x + (2 / 3) * (q.x - p.x), p.y + (2 / 3) * (q.y - p.y)),
            p,
          });
          cur = p;
          nextQ = q;
          break;
        }
        case 'A': {
          const rx = num(), ry = num(), rot = num();
          const large = flag(), sw = flag();
          const p = R(num(), num());
          ensureSub().segs.push(...arcToCubics(cur, rx, ry, rot, large, sw, p));
          cur = p;
          break;
        }
      }
      lastC = nextC;
      lastQ = nextQ;
    } while (atNumber());
  }
  return subs;
}

// ---------------------------------------------------------------------------
// Element scanning
// ---------------------------------------------------------------------------

const SKIP_CONTAINERS = new Set(['defs', 'clippath', 'mask', 'symbol', 'marker', 'pattern', 'style', 'script', 'metadata', 'title', 'desc']);

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]!] = m[2] ?? m[3] ?? '';
  return out;
}

const attrNum = (a: Record<string, string>, k: string, dflt = 0): number => {
  const n = parseFloat(a[k] ?? '');
  return Number.isFinite(n) ? n : dflt;
};

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx + rx},${cy} A${rx},${ry} 0 0 1 ${cx},${cy + ry} A${rx},${ry} 0 0 1 ${cx - rx},${cy} A${rx},${ry} 0 0 1 ${cx},${cy - ry} A${rx},${ry} 0 0 1 ${cx + rx},${cy} Z`;
}

function rectPath(a: Record<string, string>): string | null {
  const x = attrNum(a, 'x'), y = attrNum(a, 'y'), w = attrNum(a, 'width'), h = attrNum(a, 'height');
  if (!(w > 0 && h > 0)) return null;
  let rx = attrNum(a, 'rx', NaN), ry = attrNum(a, 'ry', NaN);
  if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
  if (Number.isNaN(ry)) ry = rx;
  rx = Math.min(Math.max(rx, 0), w / 2);
  ry = Math.min(Math.max(ry, 0), h / 2);
  if (rx === 0 || ry === 0) return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
  return (
    `M${x + rx},${y} H${x + w - rx} A${rx},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} ` +
    `A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} H${x + rx} A${rx},${ry} 0 0 1 ${x},${y + h - ry} V${y + ry} A${rx},${ry} 0 0 1 ${x + rx},${y} Z`
  );
}

/** All drawable subpaths in the document, with transforms applied (SVG user units, y down). */
export function svgSubpaths(svg: string): { subs: Subpath[]; elements: number; errors: string[] } {
  const text = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const stack: { name: string; m: Mat; skip: boolean }[] = [];
  const subs: Subpath[] = [];
  const errors: string[] = [];
  let elements = 0;
  for (const m of text.matchAll(/<\s*(\/?)\s*([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const closing = m[1] === '/';
    const name = m[2]!.toLowerCase().replace(/^.*:/, '');
    const rawAttrs = m[3] ?? '';
    const selfClosing = /\/\s*$/.test(rawAttrs);
    const top = stack[stack.length - 1];
    if (closing) {
      // Pop up to and including the matching element.
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k]!.name === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const a = attrs(rawAttrs);
    const parentM = top?.m ?? IDENTITY;
    const skip = (top?.skip ?? false) || SKIP_CONTAINERS.has(name);
    const own = mul(parentM, parseTransform(a.transform));
    if (!selfClosing) stack.push({ name, m: own, skip });
    if (skip) continue;

    let d: string | null = null;
    switch (name) {
      case 'path':
        d = a.d ?? null;
        break;
      case 'polygon':
      case 'polyline': {
        const p = nums(a.points ?? '');
        if (p.length >= 4) {
          d = `M${p.slice(0, 2).join(',')} L${p.slice(2, p.length - (p.length % 2)).join(' ')}${name === 'polygon' ? ' Z' : ''}`;
        }
        break;
      }
      case 'rect':
        d = rectPath(a);
        break;
      case 'circle': {
        const r = attrNum(a, 'r');
        if (r > 0) d = ellipsePath(attrNum(a, 'cx'), attrNum(a, 'cy'), r, r);
        break;
      }
      case 'ellipse': {
        const rx = attrNum(a, 'rx'), ry = attrNum(a, 'ry');
        if (rx > 0 && ry > 0) d = ellipsePath(attrNum(a, 'cx'), attrNum(a, 'cy'), rx, ry);
        break;
      }
    }
    if (!d) continue;
    elements++;
    try {
      for (const s of parsePathData(d)) {
        if (s.segs.length === 0) continue;
        const tr = (p: Vec2) => apply(own, p);
        subs.push({
          start: tr(s.start),
          closed: s.closed,
          segs: s.segs.map((g) => (g.k === 'L' ? { k: 'L', p: tr(g.p) } : { k: 'C', c1: tr(g.c1), c2: tr(g.c2), p: tr(g.p) })),
        });
      }
    } catch (e) {
      errors.push(`Skipped a <${name}> with unreadable data (${(e as Error).message}).`);
    }
  }
  return { subs, elements, errors };
}

function flattenSub(s: Subpath, tol: number): Vec2[] {
  const out: Vec2[] = [s.start];
  let cur = s.start;
  for (const g of s.segs) {
    if (g.k === 'L') out.push(g.p);
    else out.push(...flattenCubic(cur, g.c1, g.c2, g.p, tol).slice(1));
    cur = g.p;
  }
  return out;
}

/** Is the subpath geometrically closed (Z, or ends where it started)? */
const endsAtStart = (s: Subpath, eps: number): boolean => {
  const last = s.segs[s.segs.length - 1]!.p;
  return Math.hypot(last.x - s.start.x, last.y - s.start.y) <= eps;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function importOutlineFromSvg(svgText: string, opts: OutlineImportOptions = {}): OutlineImportResult {
  const warnings: string[] = [];
  const tolOut = opts.tolerance ?? 0.05;
  const { subs, elements, errors } = svgSubpaths(svgText);
  warnings.push(...errors);
  if (subs.length === 0) {
    warnings.push('No shape found in the SVG. Draw the outline as a path (or polygon, rect, ellipse) and save it as plain SVG.');
    return { points: [], warnings };
  }

  // Pick the largest subpath by enclosed area (coarse flattening is plenty for comparing).
  const all = polyBounds(subs.flatMap((s) => [s.start, ...s.segs.map((g) => g.p)]));
  const diag = Math.hypot(all.maxX - all.minX, all.maxY - all.minY) || 1;
  let best = -1;
  let bestArea = 0;
  subs.forEach((s, i) => {
    const area = Math.abs(signedArea(flattenSub(s, diag / 2000)));
    if (area > bestArea) {
      bestArea = area;
      best = i;
    }
  });
  if (best < 0) {
    warnings.push('The SVG shapes enclose no area (only lines). Draw a closed outline.');
    return { points: [], warnings };
  }
  const chosen = subs[best]!;
  if (subs.length > 1) {
    warnings.push(`The SVG has ${subs.length} shapes${elements > 1 ? ` in ${elements} elements` : ''}; used the largest one and ignored the rest.`);
  }
  if (!chosen.closed && !endsAtStart(chosen, diag * 1e-6)) {
    warnings.push('The outline was not closed; it was closed with a straight line from its end back to its start.');
  }

  // Scale factor from the coarse outline, then flatten at the final tolerance.
  const coarse = flattenSub(chosen, diag / 2000);
  const cb = polyBounds(coarse);
  const len = cb.maxX - cb.minX;
  const wid = cb.maxY - cb.minY;
  let k = 1;
  if (opts.targetLength && opts.targetLength > 0 && len > 0) k = opts.targetLength / len;
  else if (opts.targetWidth && opts.targetWidth > 0 && wid > 0) k = opts.targetWidth / wid;
  else warnings.push('No target size given; SVG units were taken as millimetres.');

  const raw = flattenSub(chosen, tolOut / k);
  // Flip y, scale.
  let pts = raw.map((p) => v(p.x * k, -p.y * k));
  const b = polyBounds(pts);
  const cy = (b.minY + b.maxY) / 2;
  pts = pts.map((p) => v(p.x, p.y - cy));
  let x0 = b.minX;
  if ((opts.origin ?? 'centerline') === 'centerline') {
    const xs = crossingsAtY(pts, 0);
    if (xs.length) x0 = Math.min(...xs);
  }
  pts = pts.map((p) => v(p.x - x0, p.y));
  const points = ensureCCW(dedupeClosed(pts, 1e-6));
  if (points.length < 3) {
    warnings.push('The outline has fewer than 3 distinct points.');
    return { points: [], warnings };
  }
  return { points, warnings };
}
