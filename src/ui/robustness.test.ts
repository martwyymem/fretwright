// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Deterministic fuzz: perturb every form field (limits from fields.ts, ±50 %, every option) on a
 * rotating preset, then build the layout, every template and the exports. Schema-valid specs must
 * never make validateSpec throw, and any template that throws must be explained by an error-level
 * issue. Drawings must contain only finite coordinates.
 * (The full preset × field cross product, ~1500 specs, was run once offline; this is a bounded slice.)
 */
import type { Drawing, GuitarSpec } from '../core';
import { PRESETS, TEMPLATES, buildFretboardLayout, checkSchema, gaugeToMm, geometryBlocker, validateSpec } from '../core';
import { buildTemplate } from './build';
import { drawingToDxf, drawingToPdf, drawingToSvg } from '../export';
import { FIELDS } from './fields';
import { getAt, setAt } from './paths';
import { gaugesForCount } from './state';

interface Case {
  name: string;
  spec: GuitarSpec;
}

const preset = (i: number) => PRESETS[((i % PRESETS.length) + PRESETS.length) % PRESETS.length]!;

function cases(): Case[] {
  const out: Case[] = [];
  const add = (i: number, path: string, value: unknown) => {
    const p = preset(i);
    out.push({ name: `${p.id} ${path}=${JSON.stringify(value)}`, spec: setAt(p.spec, path, value) });
  };
  FIELDS.forEach((f, i) => {
    const cur = getAt(preset(i).spec, f.path);
    if (f.kind === 'select') f.options!.forEach((o, k) => add(i + k, f.path, o.value));
    else if (f.kind === 'bool') [true, false].forEach((b, k) => add(i + k, f.path, b));
    else if (typeof cur === 'number') {
      const r = (x: number) => (f.kind === 'int' ? Math.round(x) : x);
      add(i, f.path, r(f.min ?? 0));
      add(i + 1, f.path, r(f.max ?? 2 * cur + 10));
      add(i + 2, f.path, r((getAt(preset(i + 2).spec, f.path) as number) * 0.5));
      add(i + 3, f.path, r((getAt(preset(i + 3).spec, f.path) as number) * 1.5));
    }
  });
  PRESETS.forEach((p, i) => {
    const thou = p.spec.strings.gauges.map((g) => g / 0.0254);
    for (const n of [4, 12]) add(i, 'strings.gauges', gaugesForCount(p.spec.meta.instrument, n, thou).map(gaugeToMm));
    add(i, 'strings.gauges', [...p.spec.strings.gauges].reverse());
    add(i, 'body.pickups', []);
    add(i, 'body.pickups', [{ type: 'single', fromBridge: 600, angle: 45 }]);
    add(i, 'fretboard.inlays.frets', [1, 36]);
    add(i, 'body.shape', 'custom'); // no outline imported yet
    add(i, 'headstock.shape', 'custom');
    // Far outside the form limits but schema-valid (typos): must be reported, not crash.
    add(i, 'nut.stringSpread', 10000);
    add(i, 'bridge.stringSpread', 10000);
    add(i, 'scale.treble', 0.001);
  });
  return out;
}

function badCoordinate(d: Drawing): string | null {
  for (const l of d.layers) {
    for (const s of l.shapes) {
      const pts = s.kind === 'polyline' ? s.points : s.kind === 'circle' ? [s.center] : [s.at];
      if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return `${l.name}: non-finite ${s.kind}`;
      if (s.kind === 'circle' && !(Number.isFinite(s.r) && s.r > 0)) return `${l.name}: circle r=${s.r}`;
      if (s.kind === 'text' && !(s.size > 0)) return `${l.name}: text size ${s.size}`;
    }
  }
  return null;
}

describe('robustness fuzz', () => {
  const all = cases().filter((c) => checkSchema(c.spec).spec);

  it('has a meaningful number of schema-valid cases', () => {
    expect(all.length).toBeGreaterThanOrEqual(240);
  });

  it('validateSpec never throws, templates either build finite drawings or are explained by an error', { timeout: 60_000 }, () => {
    const problems: string[] = [];
    let pdfs = 0;
    all.forEach((c, k) => {
      let issues;
      try {
        issues = validateSpec(c.spec).issues;
      } catch (e) {
        problems.push(`${c.name}: validateSpec threw ${String(e)}`);
        return;
      }
      const explained = issues.some((i) => i.level === 'error');
      if (geometryBlocker(c.spec)) {
        // The app refuses to build these; check that it does so with the explanation.
        if (!explained) problems.push(`${c.name}: blocked without an error issue`);
        const r = buildTemplate(c.spec, TEMPLATES[0]!.id);
        if (r.ok) problems.push(`${c.name}: blocked spec still built`);
        return;
      }
      try {
        buildFretboardLayout(c.spec);
      } catch (e) {
        if (!explained) problems.push(`${c.name}: layout threw without an error issue: ${String(e)}`);
      }
      for (const t of TEMPLATES) {
        let d: Drawing;
        try {
          d = t.build(c.spec);
        } catch (e) {
          if (!explained) problems.push(`${c.name}: ${t.id} threw without an error issue: ${String(e)}`);
          continue;
        }
        const bad = badCoordinate(d);
        if (bad) problems.push(`${c.name}: ${t.id} ${bad}`);
        try {
          drawingToSvg(d);
          drawingToDxf(d);
          // PDF is slow; export a rotating sample.
          if (k % 40 === TEMPLATES.indexOf(t) * 5) {
            drawingToPdf(d);
            pdfs++;
          }
        } catch (e) {
          problems.push(`${c.name}: ${t.id} export threw ${String(e)}`);
        }
      }
    });
    expect(problems).toEqual([]);
    expect(pdfs).toBeGreaterThan(5);
  });

  it('wildly mismatched string spreads give a clear error instead of crashing', () => {
    for (const path of ['nut.stringSpread', 'bridge.stringSpread']) {
      const r = validateSpec(setAt(PRESETS[0]!.spec, path, 10000));
      expect(r.issues.find((i) => i.level === 'error' && i.path === 'bridge.stringSpread')?.message).toMatch(/too far apart/);
    }
  });
});
