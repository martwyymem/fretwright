// SPDX-License-Identifier: GPL-3.0-or-later
/** The parameter form (fields.ts) must cover the GuitarSpec schema exactly, with sane limits. */
import { z } from 'zod';
import { GuitarSpecSchema, PRESETS, PickupType } from '../core';
import { FIELDS, PICKUP_TYPES, displayToLength, lengthToDisplay } from './fields';
import { getAt } from './paths';

interface Leaf {
  path: string;
  schema: z.ZodType;
}

const unwrap = (s: z.ZodType): z.ZodType => (s instanceof z.ZodOptional ? unwrap(s.unwrap() as z.ZodType) : s);

/** Leaf paths of the schema; arrays are leaves (edited by one list/table field). */
function leaves(s: z.ZodType, prefix = ''): Leaf[] {
  const u = unwrap(s);
  if (u instanceof z.ZodObject) {
    return Object.entries(u.shape as Record<string, z.ZodType>).flatMap(([k, c]) => leaves(c, prefix ? `${prefix}.${k}` : k));
  }
  return [{ path: prefix, schema: u }];
}

// Not edited through the form: the schema version, the informational preset id, imported outlines.
const NOT_IN_FORM = new Set(['version', 'meta.preset', 'headstock.customOutline', 'body.customOutline']);
const LEAVES = leaves(GuitarSpecSchema).filter((l) => !NOT_IN_FORM.has(l.path));
const leafByPath = new Map(LEAVES.map((l) => [l.path, l.schema]));

describe('fields.ts ↔ GuitarSpec schema', () => {
  it('every editable leaf of the schema has exactly one field', () => {
    for (const l of LEAVES) expect(FIELDS.filter((f) => f.path === l.path).map((f) => f.path)).toEqual([l.path]);
    expect(LEAVES.length).toBe(FIELDS.length);
    expect(LEAVES.length).toBeGreaterThan(50);
  });

  it('every field path exists in the schema', () => {
    for (const f of FIELDS) expect(leafByPath.has(f.path), f.path).toBe(true);
  });

  it('select options match the zod enums exactly; bools are booleans', () => {
    for (const f of FIELDS) {
      const s = leafByPath.get(f.path)!;
      if (f.kind === 'select') {
        expect(s, f.path).toBeInstanceOf(z.ZodEnum);
        const opts = (s as z.ZodEnum).options as string[];
        expect(f.options!.map((o) => o.value).sort(), f.path).toEqual([...opts].sort());
      }
      if (f.kind === 'bool') expect(s, f.path).toBeInstanceOf(z.ZodBoolean);
      if (f.kind === 'text') expect(s, f.path).toBeInstanceOf(z.ZodString);
      if (['gauges', 'intlist', 'pickups'].includes(f.kind)) expect(s, f.path).toBeInstanceOf(z.ZodArray);
    }
    expect(PICKUP_TYPES.map((o) => o.value).sort()).toEqual([...PickupType.options].sort());
  });

  it('numeric fields: kind matches the schema and min/max stay inside the schema limits', () => {
    for (const f of FIELDS.filter((x) => ['length', 'number', 'int', 'angle'].includes(x.kind))) {
      const s = leafByPath.get(f.path)!;
      expect(s, f.path).toBeInstanceOf(z.ZodNumber);
      const n = s as z.ZodNumber;
      expect(n.isInt, `${f.path} int`).toBe(f.kind === 'int');
      expect(f.min, `${f.path} has a min`).toBeDefined();
      if (f.max !== undefined) expect(f.max, f.path).toBeGreaterThan(f.min!);
      const lo = n.minValue ?? -Infinity;
      const hi = n.maxValue ?? Infinity;
      expect(f.min!, `${f.path} min`).toBeGreaterThanOrEqual(lo);
      if (f.max !== undefined) expect(f.max, `${f.path} max`).toBeLessThanOrEqual(hi);
      // Strictly positive schema fields need a positive form minimum.
      if (n.safeParse(0).success === false && lo <= 0) expect(f.min!, `${f.path} min > 0`).toBeGreaterThan(0);
    }
  });

  it.each(PRESETS.map((p) => [p.id, p.spec] as const))('preset %s: every value is inside its field limits', (_id, spec) => {
    for (const f of FIELDS) {
      const v = getAt(spec, f.path);
      if (typeof v !== 'number') continue;
      if (f.min !== undefined) expect(v, f.path).toBeGreaterThanOrEqual(f.min);
      if (f.max !== undefined) expect(v, f.path).toBeLessThanOrEqual(f.max);
    }
  });
});

describe('display-unit conversion', () => {
  it('typing inches stores the exact mm value', () => {
    expect(displayToLength('25.5', 'in')).toBe(647.7);
    expect(displayToLength('24.75', 'in')).toBe(628.65);
    expect(displayToLength('34', 'in')).toBe(863.6);
    expect(displayToLength('9.5', 'in')).toBe(241.3);
    expect(displayToLength('25,5', 'in')).toBe(647.7);
  });

  it('mm → in → mm round-trips through the displayed text for preset values', () => {
    for (const p of PRESETS) {
      for (const f of FIELDS.filter((x) => x.kind === 'length')) {
        const mm = getAt(p.spec, f.path) as number;
        expect(Math.abs(displayToLength(lengthToDisplay(mm, 'in'), 'in') - mm), f.path).toBeLessThan(0.0254 / 2 + 1e-9);
        expect(displayToLength(lengthToDisplay(mm, 'mm'), 'mm')).toBeCloseTo(mm, 2);
      }
    }
  });
});
