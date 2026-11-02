// SPDX-License-Identifier: GPL-3.0-or-later
/** Sanity rules for the neck, truss rod and headstock. Registered in validate.ts (RULES). */
import { dist } from './geom';
import { buildHeadstockGeometry, TUNER_EDGE_CLEARANCE, TUNER_MIN_PITCH } from './headstock';
import { distToPolygon, pointInPolygon } from './polygon';
import { buildFretboardLayout } from './layout';
import { boardStartX, neckDepthAt, neckEndX, TRUSS_HEADSTOCK_INSET, trussRodChannel } from './neck';
import type { SpecIssue } from './spec';
import type { Rule } from './validate';

const f1 = (x: number) => x.toFixed(1);

/** Wood to leave under the truss-rod channel (mm). */
export const MIN_WOOD_UNDER_ROD = 3;

const trussRodLengthRule: Rule = (s) => {
  const lay = buildFretboardLayout(s);
  const start = boardStartX(lay) - TRUSS_HEADSTOCK_INSET;
  const end = neckEndX(s, lay);
  const room = end - start;
  if (s.neck.trussRod.length <= room) return [];
  return [{ level: 'error', path: 'neck.trussRod.length', message: `The truss rod (${f1(s.neck.trussRod.length)} mm) is longer than the neck it has to fit in (${f1(room)} mm from just behind the nut to the end of the heel). Use a rod of at most ${f1(room)} mm (a little shorter is normal).` }];
};

const trussRodDepthRule: Rule = (s) => {
  const lay = buildFretboardLayout(s);
  const ch = trussRodChannel(s, lay);
  // Thinnest neck section the channel runs through (the neck gets thicker toward the body).
  const x = Math.max(ch.x0, boardStartX(lay));
  const depth = neckDepthAt(s, lay, x);
  const left = depth - ch.depth;
  if (left >= MIN_WOOD_UNDER_ROD) return [];
  return [{ level: 'warning', path: 'neck.trussRod.depth', message: `The truss rod channel (${f1(ch.depth)} mm deep) leaves only ${f1(left)} mm of wood under it where the neck is thinnest (${f1(depth)} mm of neck under the board). Leave at least ${MIN_WOOD_UNDER_ROD} mm: use a shallower rod (max ${f1(depth - MIN_WOOD_UNDER_ROD)} mm) or a thicker neck at fret 1.` }];
};

const tunerFitRule: Rule = (s) => {
  const lay = buildFretboardLayout(s);
  const hg = buildHeadstockGeometry(s, lay);
  const d = s.headstock.tunerHoleDiameter;
  const out: SpecIssue[] = [];
  const fix = 'Make the headstock wider or longer, or use smaller tuner holes.';
  const outside = hg.tuners.filter((t) => !pointInPolygon(t.center, hg.outline));
  if (outside.length > 0) {
    out.push({ level: 'error', path: 'headstock.width', message: `${outside.length} tuner hole(s) do not fit on the headstock at all. ${fix}` });
    return out;
  }
  const minEdge = Math.min(...hg.tuners.map((t) => distToPolygon(t.center, hg.outline) - t.diameter / 2));
  if (minEdge < TUNER_EDGE_CLEARANCE - 1e-6) {
    out.push({ level: minEdge < 1 ? 'error' : 'warning', path: 'headstock.width', message: `A tuner hole comes within ${f1(Math.max(minEdge, 0))} mm of the headstock edge (keep at least ${TUNER_EDGE_CLEARANCE} mm of wood around each hole). ${fix}` });
  }
  let minPitch = Infinity;
  for (let i = 0; i < hg.tuners.length; i++) {
    for (let j = i + 1; j < hg.tuners.length; j++) minPitch = Math.min(minPitch, dist(hg.tuners[i]!.center, hg.tuners[j]!.center));
  }
  if (minPitch < d) {
    out.push({ level: 'error', path: 'headstock.length', message: `Tuner holes overlap (${f1(minPitch)} mm apart for ⌀${f1(d)} mm holes). ${fix}` });
  } else if (minPitch < TUNER_MIN_PITCH * d - 1e-6) {
    out.push({ level: 'warning', path: 'headstock.length', message: `Tuner holes are only ${f1(minPitch)} mm apart (at least ${f1(TUNER_MIN_PITCH * d)} mm is needed for ⌀${f1(d)} mm holes, more for the tuner keys). ${fix}` });
  }
  return out;
};

const headstockAngleRule: Rule = (s) => {
  const h = s.headstock;
  if (h.style === 'angled' && h.angle === 0)
    return [{ level: 'info', path: 'headstock.angle', message: 'The headstock is set to angled but the angle is 0°, so it is drawn flat. Set an angle (10–14° is typical) or choose a flat headstock.' }];
  if (h.style === 'flat' && h.angle !== 0)
    return [{ level: 'info', path: 'headstock.angle', message: `The headstock is flat, so its angle (${f1(h.angle)}°) is ignored. Choose an angled headstock to use it, or set the angle to 0.` }];
  return [];
};

const neckTaperRule: Rule = (s) =>
  s.neck.thicknessAt12 < s.neck.thicknessAt1
    ? [{ level: 'info', path: 'neck.thicknessAt12', message: `The neck is thinner at fret 12 (${f1(s.neck.thicknessAt12)} mm) than at fret 1 (${f1(s.neck.thicknessAt1)} mm). Necks usually get 1–3 mm thicker toward the body; swap the values unless this is intended.` }]
    : [];

const heelRule: Rule = (s) =>
  s.neck.joint === 'bolt-on' && s.neck.heelLength === 0
    ? [{ level: 'warning', path: 'neck.heelLength', message: 'A bolt-on neck needs a heel that sits in the body pocket, but the heel length is 0. Set it to about 50–80 mm (enough for the neck screws).' }]
    : [];

export const neckRules: Rule[] = [trussRodLengthRule, trussRodDepthRule, tunerFitRule, headstockAngleRule, neckTaperRule, heelRule];
