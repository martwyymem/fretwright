// SPDX-License-Identifier: GPL-3.0-or-later
/** Sanity rules for the body: bridge placement, pickup routes, neck pocket. Registered in validate.ts (RULES). */
import type { BodyGeometry } from './body';
import { buildBodyGeometry } from './body';
import type { Vec2 } from './geom';
import type { FretboardLayout } from './layout';
import { buildFretboardLayout } from './layout';
import { crossingsAtY, pointInPolygon, polyBounds, polygonsOverlap } from './polygon';
import type { GuitarSpec, SpecIssue } from './spec';
import type { Rule } from './validate';

const f1 = (x: number) => x.toFixed(1);

/** Minimum wood behind the compensated saddles (bridge plate / tailpiece room). */
export const SADDLE_TAIL_MIN = 25;
/** Bridge spread + this = narrowest sensible body. */
export const BODY_WIDTH_MARGIN = 20;
/** Pocket shorter than these (after making room for a pickup): warning / info. */
export const POCKET_SHORT_WARN = 30;
export const POCKET_SHORT_INFO = 50;
/** Fretboard overhang over a pickup route above this fraction of the route length: warning (below: info). */
export const OVERHANG_WARN = 0.75;

// One-entry cache: every rule below needs the same geometry for the same spec.
let cacheKey = '';
let cacheVal: { lay: FretboardLayout; body: BodyGeometry } | null = null;
function geometry(s: GuitarSpec): { lay: FretboardLayout; body: BodyGeometry } {
  const key = JSON.stringify(s);
  if (key !== cacheKey || !cacheVal) {
    const lay = buildFretboardLayout(s);
    cacheVal = { lay, body: buildBodyGeometry(s, lay) };
    cacheKey = key;
  }
  return cacheVal;
}

const customOutlineRule: Rule = (s) =>
  s.body.shape === 'custom' && (s.body.customOutline?.length ?? 0) < 3
    ? [{ level: 'error', path: 'body.shape', message: 'Body shape is "Custom outline" but no outline has been imported. Import an SVG outline in Body, or pick one of the built-in shapes.' }]
    : [];

const bodyWidthRule: Rule = (s) => {
  const min = s.bridge.stringSpread + BODY_WIDTH_MARGIN;
  return s.body.width < min
    ? [{ level: 'error', path: 'body.width', message: `Body width (${f1(s.body.width)} mm) is narrower than the bridge string spread plus ${BODY_WIDTH_MARGIN} mm (${f1(min)} mm), so the bridge cannot fit. Make the body wider.` }]
    : [];
};

/** Distance from p to the outline edge straight toward the tail (+x); null if p is outside. */
function toTail(p: Vec2, outline: Vec2[]): number | null {
  if (!pointInPolygon(p, outline)) return null;
  const xs = crossingsAtY(outline, p.y).filter((x) => x > p.x);
  return xs.length ? Math.min(...xs) - p.x : null;
}

const saddleRule: Rule = (s) => {
  const { lay, body } = geometry(s);
  if (body.outline.length < 3) return [];
  const fix = 'Increase the body length, or raise the joint fret (moves the body toward the bridge).';
  const pts = [...lay.saddleLine, ...lay.strings.map((x) => x.compensatedSaddle)];
  let min = Infinity;
  for (const p of pts) {
    const d = toTail(p, body.outline);
    if (d === null) {
      return [{ level: 'error', path: 'body.length', message: `The bridge saddle line lies outside the body (${f1(p.x - (body.anchor?.x ?? 0))} mm from the body's neck edge on a ${f1(s.body.length)} mm body). ${fix}` }];
    }
    min = Math.min(min, d);
  }
  return min < SADDLE_TAIL_MIN
    ? [{ level: 'warning', path: 'body.length', message: `Only ${f1(min)} mm of body behind the saddles; a bridge usually needs at least ${SADDLE_TAIL_MIN} mm. ${fix}` }]
    : [];
};

const pickupRule: Rule = (s) => {
  const { lay, body } = geometry(s);
  const out: SpecIssue[] = [];
  const ps = body.pickups;
  const name = (i: number) => `Pickup ${i + 1}`;
  const path = (i: number) => `body.pickups.${i}.fromBridge`;
  const [, et, eb] = lay.outline;
  const endAt = (y: number) => et.x + ((y - et.y) * (eb.x - et.x)) / (eb.y - et.y);
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    const from = f1(s.body.pickups[i]!.fromBridge);
    if (body.outline.length >= 3 && !p.outline.every((q) => pointInPolygon(q, body.outline))) {
      out.push({ level: 'error', path: path(i), message: `${name(i)} route (${from} mm from the bridge) runs outside the body. Move it closer to the bridge or make the body bigger.` });
    }
    for (let j = i + 1; j < ps.length; j++) {
      if (polygonsOverlap(p.outline, ps[j]!.outline)) {
        out.push({ level: 'error', path: path(j), message: `${name(i)} and ${name(j)} routes overlap. Change their distances from the bridge so the routes are apart.` });
      }
    }
    if (body.neckPocket && s.neck.joint !== 'neck-through' && polygonsOverlap(p.outline, body.neckPocket)) {
      if (s.neck.joint === 'bolt-on') {
        out.push({ level: 'error', path: path(i), message: `${name(i)} route cuts into the neck pocket. Move the pickup toward the bridge, or lower the joint fret.` });
      } else {
        out.push({ level: 'info', path: path(i), message: `${name(i)} route cuts into the neck tenon (a "long tenon"); route the pickup cavity after gluing the neck.` });
      }
    }
    // Fretboard overhang over the route.
    const b = polyBounds(p.outline);
    // (endAt(y) − x) is linear along each edge, so its maximum over the part of the route inside
    // the board's width is at an edge endpoint clipped to that band.
    const y0 = Math.min(et.y, eb.y), y1 = Math.max(et.y, eb.y);
    let over = 0;
    for (let k = 0; k < p.outline.length; k++) {
      const a = p.outline[k]!, c = p.outline[(k + 1) % p.outline.length]!;
      for (const t of [0, 1, (y0 - a.y) / (c.y - a.y), (y1 - a.y) / (c.y - a.y)]) {
        if (!(t >= 0 && t <= 1)) continue;
        const y = a.y + t * (c.y - a.y);
        if (y < y0 - 1e-9 || y > y1 + 1e-9) continue;
        over = Math.max(over, endAt(y) - (a.x + t * (c.x - a.x)));
      }
    }
    if (over > 0.05) {
      const limit = OVERHANG_WARN * (b.maxX - b.minX);
      out.push(
        over > limit
          ? { level: 'warning', path: path(i), message: `${name(i)} sits mostly under the fretboard (${f1(over)} mm of the route is under the board end), so it cannot be fitted or adjusted from the top. Move it toward the bridge, or use fewer frets / a shorter board end.` }
          : { level: 'info', path: path(i), message: `The fretboard overhangs ${name(i)}'s route by ${f1(over)} mm (common when the neck pickup sits right at the board end); rout the cavity before fitting the neck.` },
      );
    }
  }
  return out;
};

const pocketRule: Rule = (s) => {
  if (s.neck.joint === 'neck-through') return [];
  const { body } = geometry(s);
  const by = body.pocketShortenedBy ?? 0;
  if (by <= 0.05 || body.pocketEndX === undefined || !body.anchor) return [];
  const len = body.pocketEndX - body.anchor.x;
  const what = s.neck.joint === 'set-in' ? 'tenon' : 'pocket';
  const msg = `The neck ${what} is only ${f1(len)} mm long, because it stops short of the nearest pickup route.`;
  if (len < POCKET_SHORT_WARN) {
    return [{ level: 'warning', path: 'neck.jointFret', message: `${msg} That is too short for a strong joint; move the neck pickup toward the bridge or lower the joint fret.` }];
  }
  if (len < POCKET_SHORT_INFO) return [{ level: 'info', path: 'neck.jointFret', message: `${msg} Short joints are common on 24-fret necks; use 4 screws / a long glue surface.` }];
  return [];
};

export const bodyRules: Rule[] = [customOutlineRule, bodyWidthRule, saddleRule, pickupRule, pocketRule];
