// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Plain-language sanity checks on a structurally valid spec.
 * Each rule returns zero or more issues. Messages must say what is wrong AND what to change,
 * e.g. "Treble scale (686 mm) is longer than bass scale (648 mm). Swap them or make them equal."
 */
import type { GuitarSpec, SpecIssue } from './spec';
import { checkSchema } from './spec';
import { layoutRules } from './rules-layout';
import { neckRules } from './rules-neck';
import { bodyRules } from './rules-body';

export type Rule = (spec: GuitarSpec) => SpecIssue[];

/** Largest |bridge spread − nut spread| / 2 as a fraction of the treble scale (≈ 5.7° per outer string). */
export const MAX_SPLAY = 0.1;

const baseRules: Rule[] = [
  (s) =>
    s.scale.treble > s.scale.bass
      ? [{ level: 'error', path: 'scale.treble', message: `Treble scale (${s.scale.treble.toFixed(1)} mm) is longer than the bass scale (${s.scale.bass.toFixed(1)} mm). Swap them, or make them equal for a single scale.` }]
      : [],
  (s) =>
    s.neck.jointFret > s.frets.count
      ? [{ level: 'error', path: 'neck.jointFret', message: `The neck joins the body at fret ${s.neck.jointFret}, but the board only has ${s.frets.count} frets. Lower the joint fret.` }]
      : [],
];

/** Shortest scale the geometry is meant for (a soprano ukulele is ~330 mm). */
export const MIN_SCALE = 150;

/**
 * Values so far outside any real instrument that the geometry cannot be built sensibly (it may take
 * seconds or produce millions of points). When this returns an issue, callers must not build
 * templates; validateSpec returns only this issue.
 */
export function geometryBlocker(s: GuitarSpec): SpecIssue | null {
  if (s.scale.treble < MIN_SCALE || s.scale.bass < MIN_SCALE) {
    const path = s.scale.treble < MIN_SCALE ? 'scale.treble' : 'scale.bass';
    return { level: 'error', path, message: `A scale of ${Math.min(s.scale.treble, s.scale.bass).toFixed(1)} mm is too short to lay out an instrument. Enter at least ${MIN_SCALE} mm (a guitar is about 610–686 mm, a bass about 760–890 mm).` };
  }
  // Outer strings run at atan(h / L) to the centerline; real instruments stay under ~3°.
  const h = Math.abs(s.bridge.stringSpread - s.nut.stringSpread) / 2;
  if (h > MAX_SPLAY * s.scale.treble) {
    return { level: 'error', path: 'bridge.stringSpread', message: `The string spreads at the nut (${s.nut.stringSpread.toFixed(1)} mm) and bridge (${s.bridge.stringSpread.toFixed(1)} mm) are too far apart for a ${s.scale.treble.toFixed(1)} mm scale: the outer strings would splay out at a steep angle and no fretboard can be laid out. Bring the two spreads closer (about 35–45 mm at the nut and 50–60 mm at the bridge on a guitar).` };
  }
  return null;
}

/** Registry; other modules append their rules here (keep rules pure and fast). */
export const RULES: Rule[] = [...baseRules, ...layoutRules, ...neckRules, ...bodyRules];

export function validateSpec(input: unknown): { spec: GuitarSpec | null; issues: SpecIssue[] } {
  const { spec, issues } = checkSchema(input);
  if (!spec) return { spec, issues };
  const blocker = geometryBlocker(spec);
  if (blocker) return { spec, issues: [blocker] };
  const out: SpecIssue[] = [];
  for (const r of RULES) {
    // A rule that cannot compute its geometry must not take the app down: report it instead.
    try {
      out.push(...r(spec));
    } catch (e) {
      if (out.some((i) => i.level === 'error')) continue; // already explained by an earlier error
      const why = e instanceof Error ? e.message : String(e);
      out.push({ level: 'error', path: '', message: `This design could not be checked because its geometry cannot be built (${why}). Undo the last change, or bring unusual values back into a normal range.` });
    }
  }
  return { spec, issues: out };
}
