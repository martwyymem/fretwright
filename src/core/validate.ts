// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Plain-language sanity checks on a structurally valid spec.
 * Each rule returns zero or more issues. Messages must say what is wrong AND what to change,
 * e.g. "Treble scale (686 mm) is longer than bass scale (648 mm). Swap them or make them equal."
 */
import type { GuitarSpec, SpecIssue } from './spec';
import { checkSchema } from './spec';
import { layoutRules } from './rules-layout';

export type Rule = (spec: GuitarSpec) => SpecIssue[];

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

/** Registry; other modules append their rules here (keep rules pure and fast). */
export const RULES: Rule[] = [...baseRules, ...layoutRules];

export function validateSpec(input: unknown): { spec: GuitarSpec | null; issues: SpecIssue[] } {
  const { spec, issues } = checkSchema(input);
  if (!spec) return { spec, issues };
  const out: SpecIssue[] = [];
  for (const r of RULES) out.push(...r(spec));
  return { spec, issues: out };
}
