// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Field metadata that drives the parameter form. One entry per editable GuitarSpec field.
 * Lengths are stored in mm and shown in the chosen display unit; angles in degrees.
 * `advanced: false` fields are the ones most builders need; the rest hide behind "More options".
 */
import type { GuitarSpec } from '../core';
import { mmToIn, inToMm, type DisplayUnit } from '../core';

export type FieldKind =
  | 'length'
  | 'number'
  | 'int'
  | 'angle'
  | 'select'
  | 'bool'
  | 'text'
  | 'intlist'
  | 'gauges'
  | 'pickups';

export type SectionId = 'instrument' | 'scale' | 'fretboard' | 'neck' | 'headstock' | 'body';

export interface SectionDef {
  id: SectionId;
  step: number;
  title: string;
  /** One line under the heading. */
  blurb: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'instrument', step: 1, title: 'Instrument & strings', blurb: 'Guitar or bass, how many strings and which gauges.' },
  { id: 'scale', step: 2, title: 'Scale & frets', blurb: 'Scale length, fret count and fanned frets.' },
  { id: 'fretboard', step: 3, title: 'Fretboard', blurb: 'String spacing, radius and inlays.' },
  { id: 'neck', step: 4, title: 'Neck', blurb: 'Joint, profile and thickness.' },
  { id: 'headstock', step: 5, title: 'Headstock', blurb: 'Tuner layout, angle and size.' },
  { id: 'body', step: 6, title: 'Body & pickups', blurb: 'Body shape, size and pickup positions.' },
];

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDef {
  path: string;
  label: string;
  /** Plain-language sentence: what this means for the builder. */
  help: string;
  kind: FieldKind;
  section: SectionId;
  advanced: boolean;
  options?: SelectOption[];
  /** In stored units (mm for lengths). */
  min?: number;
  max?: number;
  /** Input step in display units (mm for lengths in mm mode; inches derived). */
  step?: number;
  /** Only shown when this returns true. */
  showIf?: (s: GuitarSpec, ui: { fanned: boolean }) => boolean;
}

const opts = (...pairs: [string, string][]): SelectOption[] => pairs.map(([value, label]) => ({ value, label }));

const fanned = (_s: GuitarSpec, ui: { fanned: boolean }) => ui.fanned;

export const FIELDS: FieldDef[] = [
  // 1. Instrument & strings
  { path: 'meta.name', label: 'Design name', help: 'Printed on every template so you can tell your projects apart.', kind: 'text', section: 'instrument', advanced: false },
  {
    path: 'meta.instrument', label: 'Instrument', help: 'Guitar or bass. Changes the suggested string sets.', kind: 'select', section: 'instrument', advanced: false,
    options: opts(['guitar', 'Guitar'], ['bass', 'Bass']),
  },
  { path: 'strings.gauges', label: 'Strings', help: 'How many strings and how thick each one is, in thousandths of an inch (e.g. 10 = .010″).', kind: 'gauges', section: 'instrument', advanced: false },
  {
    path: 'nut.spacing', label: 'String spacing method', help: 'Equal gaps leaves the same clear space between every pair of strings (thicker strings sit further apart); equal centres spaces the string centres evenly.', kind: 'select', section: 'instrument', advanced: true,
    options: opts(['equal-gap', 'Equal gaps between strings'], ['equal-center', 'Equal centre-to-centre']),
  },

  // 2. Scale & frets
  { path: 'scale.bass', label: 'Scale length', help: 'Vibrating string length from nut to saddle. 25.5″ (648 mm) and 24.75″ (629 mm) are common for guitar, 34″ (864 mm) for bass.', kind: 'length', section: 'scale', advanced: false, min: 300, max: 1200, step: 0.5 },
  { path: 'scale.treble', label: 'Treble scale length', help: 'Scale of the thinnest string. Must be shorter than or equal to the bass scale.', kind: 'length', section: 'scale', advanced: false, min: 300, max: 1200, step: 0.5, showIf: fanned },
  { path: 'frets.perpendicularFret', label: 'Perpendicular fret', help: 'The one fret that sits straight across the neck; the others fan out from it. 7–9 is comfortable for most players.', kind: 'number', section: 'scale', advanced: false, min: 0, max: 36, step: 0.5, showIf: fanned },
  { path: 'frets.count', label: 'Number of frets', help: 'Frets on the board, not counting the nut. 21, 22 and 24 are common.', kind: 'int', section: 'scale', advanced: false, min: 12, max: 36, step: 1 },
  { path: 'frets.zeroFret', label: 'Zero fret', help: 'Adds a fret right at the nut position; the nut then only guides the strings.', kind: 'bool', section: 'scale', advanced: true },
  { path: 'nut.zeroFretGap', label: 'Nut to zero-fret gap', help: 'Space between the nut and the zero fret.', kind: 'length', section: 'scale', advanced: true, min: 0, step: 0.5, showIf: (s) => s.frets.zeroFret },
  { path: 'frets.slotWidth', label: 'Fret slot width', help: 'Width of your fret saw kerf. Match it to your fret wire tang (usually 0.5–0.6 mm).', kind: 'length', section: 'scale', advanced: true, min: 0.1, max: 3, step: 0.05 },
  { path: 'frets.nipping', label: 'Hidden tang (slot stop)', help: 'How far fret slots stop short of the board edge, for hidden tangs. 0 cuts the slots right through.', kind: 'length', section: 'scale', advanced: true, min: 0, max: 10, step: 0.5 },
  { path: 'bridge.compensationTreble', label: 'Saddle compensation, treble', help: 'How far behind the scale line the treble saddle sits for good intonation (about 1.5 mm).', kind: 'length', section: 'scale', advanced: true, min: 0, max: 15, step: 0.1 },
  { path: 'bridge.compensationBass', label: 'Saddle compensation, bass', help: 'How far behind the scale line the bass saddle sits (about 3–5 mm).', kind: 'length', section: 'scale', advanced: true, min: 0, max: 15, step: 0.1 },

  // 3. Fretboard
  { path: 'nut.stringSpread', label: 'String spread at nut', help: 'Distance between the centres of the two outer strings at the nut.', kind: 'length', section: 'fretboard', advanced: false, min: 10, max: 120, step: 0.5 },
  { path: 'bridge.stringSpread', label: 'String spread at bridge', help: 'Distance between the centres of the two outer strings at the saddles. Check your bridge’s spec sheet.', kind: 'length', section: 'fretboard', advanced: false, min: 10, max: 150, step: 0.5 },
  { path: 'fretboard.radiusStart', label: 'Radius at nut', help: 'How curved the fretboard is across. Smaller = rounder (7.25″ vintage), larger = flatter (16″ modern).', kind: 'length', section: 'fretboard', advanced: false, min: 50, max: 2000, step: 1 },
  { path: 'fretboard.radiusEnd', label: 'Radius at last fret', help: 'Same as the nut radius for a normal board; larger for a compound radius that flattens toward the body.', kind: 'length', section: 'fretboard', advanced: false, min: 50, max: 2000, step: 1 },
  {
    path: 'fretboard.inlays.style', label: 'Position markers', help: 'Dots or blocks on the board face to mark fret positions.', kind: 'select', section: 'fretboard', advanced: false,
    options: opts(['dots', 'Dots'], ['blocks', 'Blocks'], ['none', 'None']),
  },
  { path: 'fretboard.thickness', label: 'Fretboard thickness', help: 'Thickness of the fretboard blank at the edges.', kind: 'length', section: 'fretboard', advanced: true, min: 1, max: 20, step: 0.1 },
  { path: 'fretboard.sideMargin', label: 'Edge margin', help: 'Space between the outer strings and the board edge. Too little and strings slip off; 3–4 mm is typical.', kind: 'length', section: 'fretboard', advanced: true, min: 0, max: 15, step: 0.1 },
  { path: 'fretboard.startMargin', label: 'Extra board at nut end', help: 'Extra fretboard on the headstock side of the nut. Usually 0.', kind: 'length', section: 'fretboard', advanced: true, min: 0, max: 50, step: 0.5 },
  { path: 'fretboard.endMargin', label: 'Board past last fret', help: 'How much fretboard extends past the last fret.', kind: 'length', section: 'fretboard', advanced: true, min: 0, max: 50, step: 0.5 },
  {
    path: 'fretboard.endCut', label: 'Board end shape', help: 'Cut the body end of the board along the last fret, or square across the neck.', kind: 'select', section: 'fretboard', advanced: true,
    options: opts(['parallel', 'Follow the last fret'], ['perpendicular', 'Square across']),
  },
  { path: 'fretboard.inlays.frets', label: 'Marker frets', help: 'Frets that get a marker, separated by commas.', kind: 'intlist', section: 'fretboard', advanced: true, showIf: (s) => s.fretboard.inlays.style !== 'none' },
  { path: 'fretboard.inlays.doubleFrets', label: 'Double-marker frets', help: 'Frets that get two dots (usually 12 and 24).', kind: 'intlist', section: 'fretboard', advanced: true, showIf: (s) => s.fretboard.inlays.style === 'dots' },
  { path: 'fretboard.inlays.dotDiameter', label: 'Dot diameter', help: 'Diameter of the face dots; match your drill bit.', kind: 'length', section: 'fretboard', advanced: true, min: 1, max: 20, step: 0.5, showIf: (s) => s.fretboard.inlays.style === 'dots' },
  { path: 'fretboard.inlays.sideDots', label: 'Side dots', help: 'Also mark side-dot positions on the bass edge of the board.', kind: 'bool', section: 'fretboard', advanced: true },
  {
    path: 'nut.position', label: 'Nut angle', help: 'For fanned frets: keep the nut along fret 0, or square across the neck.', kind: 'select', section: 'fretboard', advanced: true,
    options: opts(['parallel', 'Along fret 0'], ['perpendicular', 'Square across']), showIf: fanned,
  },
  { path: 'nut.thickness', label: 'Nut thickness', help: 'Thickness of the nut along the strings (usually 5–6 mm).', kind: 'length', section: 'fretboard', advanced: true, min: 1, max: 15, step: 0.1 },

  // 4. Neck
  {
    path: 'neck.joint', label: 'Neck joint', help: 'How the neck attaches: screwed on, glued in, or one piece running through the body.', kind: 'select', section: 'neck', advanced: false,
    options: opts(['bolt-on', 'Bolt-on'], ['set-in', 'Set (glued-in)'], ['neck-through', 'Neck-through']),
  },
  {
    path: 'neck.profile', label: 'Neck profile', help: 'Shape of the back of the neck: C is a comfortable all-rounder, D and U are fuller, V is pointed.', kind: 'select', section: 'neck', advanced: false,
    options: opts(['C', 'C (rounded)'], ['D', 'D (flatter back)'], ['U', 'U (chunky)'], ['V', 'V (pointed)'], ['flat-oval', 'Flat oval (thin)'], ['asym', 'Asymmetric']),
  },
  { path: 'neck.thicknessAt1', label: 'Thickness at fret 1', help: 'Total neck depth, fretboard included, at the first fret (about 20–22 mm).', kind: 'length', section: 'neck', advanced: false, min: 10, max: 40, step: 0.5 },
  { path: 'neck.thicknessAt12', label: 'Thickness at fret 12', help: 'Total neck depth at the 12th fret, usually 1–3 mm more than at fret 1.', kind: 'length', section: 'neck', advanced: false, min: 10, max: 40, step: 0.5 },
  { path: 'neck.jointFret', label: 'Neck meets body at fret', help: 'The fret where the body begins. Higher numbers give easier upper-fret access.', kind: 'int', section: 'neck', advanced: false, min: 10, max: 30, step: 1 },
  { path: 'neck.heelLength', label: 'Heel / tenon length', help: 'How far the neck reaches into the body past the end of the fretboard.', kind: 'length', section: 'neck', advanced: true, min: 0, max: 300, step: 1 },
  { path: 'neck.angle', label: 'Neck angle', help: 'Tilt of the neck back from the body top. 0° for most bolt-ons; 3–5° for set necks with tall bridges.', kind: 'angle', section: 'neck', advanced: true, min: -10, max: 15, step: 0.5 },
  { path: 'neck.trussRod.width', label: 'Truss rod channel width', help: 'Width of the truss rod slot; match your rod.', kind: 'length', section: 'neck', advanced: true, min: 1, max: 20, step: 0.05 },
  { path: 'neck.trussRod.depth', label: 'Truss rod channel depth', help: 'Depth of the truss rod slot.', kind: 'length', section: 'neck', advanced: true, min: 1, max: 30, step: 0.5 },
  { path: 'neck.trussRod.length', label: 'Truss rod length', help: 'Length of the truss rod channel.', kind: 'length', section: 'neck', advanced: true, min: 50, max: 1000, step: 1 },
  {
    path: 'neck.trussRod.access', label: 'Truss rod adjustment', help: 'Where you adjust the rod: at the headstock or at the heel.', kind: 'select', section: 'neck', advanced: true,
    options: opts(['headstock', 'At the headstock'], ['heel', 'At the heel']),
  },

  // 5. Headstock
  {
    path: 'headstock.shape', label: 'Tuner layout', help: 'Where the tuners go: all on one side, split evenly, or more on the bass side.', kind: 'select', section: 'headstock', advanced: false,
    options: opts(['inline', 'All on one side (inline)'], ['split', 'Split evenly (3+3)'], ['split-offset', 'More on bass side (4+2, 4+3)'], ['paddle', 'Blank paddle (design your own)'], ['custom', 'Custom outline']),
  },
  {
    path: 'headstock.style', label: 'Headstock style', help: 'Flat headstocks are in line with the neck; angled ones tilt back for string pressure on the nut.', kind: 'select', section: 'headstock', advanced: false,
    options: opts(['flat', 'Flat'], ['angled', 'Angled back']),
  },
  { path: 'headstock.angle', label: 'Headstock angle', help: 'Back angle of an angled headstock; 10–14° is typical.', kind: 'angle', section: 'headstock', advanced: false, min: 0, max: 20, step: 0.5, showIf: (s) => s.headstock.style === 'angled' },
  { path: 'headstock.length', label: 'Headstock length', help: 'Length from the nut to the tip.', kind: 'length', section: 'headstock', advanced: false, min: 50, max: 400, step: 1 },
  { path: 'headstock.width', label: 'Headstock width', help: 'Widest point of the headstock.', kind: 'length', section: 'headstock', advanced: false, min: 30, max: 200, step: 1 },
  { path: 'headstock.thickness', label: 'Headstock thickness', help: 'Thickness of the headstock wood; check your tuners’ maximum.', kind: 'length', section: 'headstock', advanced: true, min: 5, max: 30, step: 0.5 },
  { path: 'headstock.tunerHoleDiameter', label: 'Tuner hole diameter', help: 'Drill size for the tuner posts or bushings (check your tuners).', kind: 'length', section: 'headstock', advanced: true, min: 3, max: 30, step: 0.5 },
  { path: 'headstock.volute', label: 'Volute', help: 'Extra wood behind the nut to strengthen the neck–headstock joint.', kind: 'bool', section: 'headstock', advanced: true },

  // 6. Body & pickups
  {
    path: 'body.shape', label: 'Body shape', help: 'A starting outline. These are generic shapes, scaled to the size below.', kind: 'select', section: 'body', advanced: false,
    options: opts(['double-cut', 'Double cutaway'], ['single-cut', 'Single cutaway'], ['offset', 'Offset'], ['superstrat', 'Superstrat'], ['bass-offset', 'Offset bass'], ['custom', 'Custom outline']),
  },
  { path: 'body.length', label: 'Body length', help: 'Overall body length along the neck direction.', kind: 'length', section: 'body', advanced: false, min: 100, max: 1000, step: 1 },
  { path: 'body.width', label: 'Body width', help: 'Overall body width at its widest point.', kind: 'length', section: 'body', advanced: false, min: 100, max: 800, step: 1 },
  { path: 'body.pickups', label: 'Pickups', help: 'Each pickup’s type, its distance from the bridge saddle line, and slant.', kind: 'pickups', section: 'body', advanced: false },
  { path: 'body.thickness', label: 'Body thickness', help: 'Thickness of the body blank.', kind: 'length', section: 'body', advanced: true, min: 10, max: 100, step: 0.5 },
  { path: 'body.neckPocketDepth', label: 'Neck pocket depth', help: 'How deep the neck pocket is routed into the body.', kind: 'length', section: 'body', advanced: true, min: 0, max: 60, step: 0.5 },
];

export const PICKUP_TYPES: SelectOption[] = opts(
  ['single', 'Single coil'],
  ['humbucker', 'Humbucker'],
  ['p90', 'P-90'],
  ['bass-single', 'Bass single (J-style)'],
  ['bass-split', 'Bass split (P-style)'],
);

export const fieldByPath = (path: string): FieldDef | undefined => FIELDS.find((f) => f.path === path);

/** Field owning `path` (longest matching prefix), e.g. "body.pickups.1.angle" → body.pickups. */
export function fieldForPath(path: string): FieldDef | undefined {
  let best: FieldDef | undefined;
  for (const f of FIELDS) {
    if ((path === f.path || path.startsWith(f.path + '.')) && (!best || f.path.length > best.path.length)) best = f;
  }
  return best;
}

export const fieldsInSection = (id: SectionId): FieldDef[] => FIELDS.filter((f) => f.section === id);

// ---------------------------------------------------------------------------
// Display-unit conversion
// ---------------------------------------------------------------------------

const trim = (n: number, digits: number): string => {
  const r = Number(n.toFixed(digits));
  return Object.is(r, -0) ? '0' : String(r);
};

/** mm → string in the display unit (mm: 2 decimals, in: 3 decimals, trailing zeros trimmed). */
export function lengthToDisplay(mm: number, unit: DisplayUnit): string {
  return unit === 'in' ? trim(mmToIn(mm), 3) : trim(mm, 2);
}

/** Parse a user-typed number; accepts a comma decimal separator. NaN if not a number. */
export function parseNumber(text: string): number {
  const t = text.trim().replace(',', '.');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

/** Display-unit text → mm. NaN if unparseable. */
export function displayToLength(text: string, unit: DisplayUnit): number {
  const n = parseNumber(text);
  return unit === 'in' ? inToMm(n) : n;
}

export const unitSuffix = (unit: DisplayUnit): string => (unit === 'in' ? 'in' : 'mm');

/** Gauge in mm → thousandths of an inch (rounded to 0.1). */
export const mmToThou = (mm: number): number => Math.round((mm / 0.0254) * 10) / 10;
