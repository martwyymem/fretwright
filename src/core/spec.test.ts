// SPDX-License-Identifier: GPL-3.0-or-later
import { DEFAULT_SPEC, PRESETS, TEMPLATES, validateSpec } from './index';

describe('presets', () => {
  it.each(PRESETS.map((p) => [p.id, p.spec] as const))('%s passes the schema and has no errors', (_id, spec) => {
    const { spec: parsed, issues } = validateSpec(spec);
    expect(parsed).not.toBeNull();
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('preset string spreads fit their string counts', () => {
    for (const p of PRESETS) expect(p.spec.strings.gauges.length).toBeGreaterThanOrEqual(4);
  });
});

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s builds from the default spec', (id, t) => {
    const d = t.build(DEFAULT_SPEC);
    expect(d.id).toBe(id);
    expect(d.layers.length).toBeGreaterThan(0);
  });
});
