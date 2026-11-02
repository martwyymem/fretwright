// SPDX-License-Identifier: GPL-3.0-or-later
/** Sanity rules for the fretboard / string layout. Registered in validate.ts (RULES). */
import { buildFretboardLayout } from './layout';
import type { SpecIssue } from './spec';
import { mmToIn } from './units';
import type { Rule } from './validate';

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

export const NUT_GAP_WARN = 1.5;
export const NUT_GAP_ERROR = 0.8;
export const SIDE_MARGIN_WARN = 2.5;

const nutGapRule: Rule = (s) => {
  const lay = buildFretboardLayout(s);
  const gaps = lay.nutGaps ?? [];
  if (gaps.length === 0) return [];
  const min = Math.min(...gaps);
  const i = gaps.indexOf(min);
  const pair = `strings ${i + 1} and ${i + 2}`;
  if (min < NUT_GAP_ERROR) {
    return [{ level: 'error', path: 'nut.stringSpread', message: `Only ${f2(min)} mm of clear space between ${pair} at the nut; strings will touch or buzz against each other. Increase the nut string spread (now ${f1(s.nut.stringSpread)} mm) or use fewer/thinner strings.` }];
  }
  if (min < NUT_GAP_WARN) {
    return [{ level: 'warning', path: 'nut.stringSpread', message: `Only ${f2(min)} mm of clear space between ${pair} at the nut (under ${NUT_GAP_WARN} mm is cramped to play and to file). Increase the nut string spread (now ${f1(s.nut.stringSpread)} mm).` }];
  }
  return [];
};

const sideMarginRule: Rule = (s) =>
  s.fretboard.sideMargin < SIDE_MARGIN_WARN
    ? [{ level: 'warning', path: 'fretboard.sideMargin', message: `Side margin is ${f1(s.fretboard.sideMargin)} mm; outer strings slip off the board edge below about ${SIDE_MARGIN_WARN} mm. Increase the side margin to 3–4 mm.` }]
    : [];

const spreadRule: Rule = (s) =>
  s.bridge.stringSpread < s.nut.stringSpread
    ? [{ level: 'warning', path: 'bridge.stringSpread', message: `Bridge string spread (${f1(s.bridge.stringSpread)} mm) is narrower than at the nut (${f1(s.nut.stringSpread)} mm), so the strings converge toward the bridge. Check the values; the bridge spread is normally wider (e.g. 52 mm vs 35 mm on a guitar).` }]
    : [];

const perpFretRule: Rule = (s) =>
  s.frets.perpendicularFret > s.frets.count
    ? [{ level: 'error', path: 'frets.perpendicularFret', message: `Perpendicular fret ${s.frets.perpendicularFret} is beyond the last fret (${s.frets.count}). Pick a fret between 0 and ${s.frets.count} (7–9 is common on multiscale guitars).` }]
    : [];

const perpNutRule: Rule = (s) =>
  s.scale.bass !== s.scale.treble && s.nut.position === 'perpendicular' && !s.frets.zeroFret
    ? [{ level: 'warning', path: 'nut.position', message: 'A square (perpendicular) nut on a multiscale board does not line up with the slanted fret 0, so not every string starts its scale at fret 0 and intonation will be off. Turn on the zero fret, or set the nut to parallel.' }]
    : [];

const compoundRule: Rule = (s) =>
  s.fretboard.radiusStart > s.fretboard.radiusEnd
    ? [{ level: 'warning', path: 'fretboard.radiusStart', message: `Radius at the nut (${f1(s.fretboard.radiusStart)} mm) is flatter than at the last fret (${f1(s.fretboard.radiusEnd)} mm). A compound radius normally gets flatter toward the body; swap the two values unless this is intentional.` }]
    : [];

const radiusTooSmallRule: Rule = (s) => {
  const lay = buildFretboardLayout(s);
  const out: SpecIssue[] = [];
  const check = (r: number, w: number, path: string, where: string) => {
    if (r < w / 2 + 5) {
      out.push({ level: 'error', path, message: `Radius ${f1(r)} mm is too tight for a board ${f1(w)} mm wide ${where}; no gauge can be made. Use a radius of at least ${f1(w / 2 + 5)} mm (typical 184–508 mm, 7.25–20″).` });
    }
  };
  check(s.fretboard.radiusStart, lay.widthAtNut, 'fretboard.radiusStart', 'at the nut');
  check(s.fretboard.radiusEnd, lay.widthAtLastFret, 'fretboard.radiusEnd', `at fret ${s.frets.count}`);
  return out;
};

const gaugeOrderRule: Rule = (s) => {
  const g = s.strings.gauges;
  for (let i = 1; i < g.length; i++) {
    if (g[i]! < g[i - 1]!) {
      return [{ level: 'warning', path: 'strings.gauges', message: `String ${i + 1} (${f2(g[i]!)} mm) is thinner than string ${i} (${f2(g[i - 1]!)} mm). Gauges are listed treble to bass (thinnest first); reorder them.` }];
    }
  }
  return [];
};

const instrumentRule: Rule = (s) => {
  const g = s.strings.gauges;
  const n = g.length;
  const thin = Math.min(...g);
  const thick = Math.max(...g);
  const out: SpecIssue[] = [];
  const thou = (mm: number) => String(Math.round(mmToIn(mm) * 1000)).padStart(3, '0');
  if (s.meta.instrument === 'guitar') {
    if (n < 6 || n > 9) out.push({ level: 'info', path: 'strings.gauges', message: `${n} strings is unusual for a guitar (6–9 is typical). Check the string list, or set the instrument to bass.` });
    if (thick > 2.6) out.push({ level: 'warning', path: 'strings.gauges', message: `The thickest string is ${f2(thick)} mm (.${thou(thick)}″), which is bass-sized. Set the instrument to bass, or check the gauges.` });
  } else {
    if (n > 7) out.push({ level: 'info', path: 'strings.gauges', message: `${n} strings is unusual for a bass (4–7 is typical). Check the string list, or set the instrument to guitar.` });
    if (thin < 0.6) out.push({ level: 'warning', path: 'strings.gauges', message: `The thinnest string is ${f2(thin)} mm (.${thou(thin)}″), which is guitar-sized. Set the instrument to guitar, or check the gauges.` });
  }
  return out;
};

export const layoutRules: Rule[] = [
  nutGapRule,
  sideMarginRule,
  spreadRule,
  perpFretRule,
  perpNutRule,
  compoundRule,
  radiusTooSmallRule,
  gaugeOrderRule,
  instrumentRule,
];
