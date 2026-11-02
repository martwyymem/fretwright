// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { drawingToDxf } from './index';
import { sampleDrawing } from './fixtures.test-util';

type Pair = { code: number; value: string };
interface Entity {
  type: string;
  pairs: Pair[];
}

/** Tiny DXF reader: group-code/value pairs → sections → entities. */
function readDxf(src: string) {
  const lines = src.split('\n');
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push({ code: Number(lines[i]!.trim()), value: lines[i + 1]!.trim() });
  const sections: Record<string, Entity[]> = {};
  let section: Entity[] | null = null;
  let current: Entity | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]!;
    if (p.code === 0 && p.value === 'SECTION') {
      section = sections[pairs[++i]!.value] = [];
      current = null;
    } else if (p.code === 0 && p.value === 'ENDSEC') section = null;
    else if (p.code === 0) {
      current = { type: p.value, pairs: [] };
      section?.push(current);
    } else current?.pairs.push(p);
  }
  return { pairs, sections };
}

const get = (e: Entity, code: number) => e.pairs.find((p) => p.code === code)?.value;
const num = (e: Entity, code: number) => Number(get(e, code));

describe('drawingToDxf', () => {
  const d = sampleDrawing(100, 50, 10, 20);
  const dxf = drawingToDxf(d);
  const { pairs, sections } = readDxf(dxf);

  it('has a well-formed pair stream ending in EOF', () => {
    expect(pairs.every((p) => Number.isInteger(p.code))).toBe(true);
    expect(pairs[pairs.length - 1]).toEqual({ code: 0, value: 'EOF' });
  });

  it('declares R12, millimetres and extents in the header', () => {
    const vars = pairs.slice(0, pairs.findIndex((p) => p.value === 'ENDSEC'));
    const after = (name: string) => vars[vars.findIndex((p) => p.value === name) + 1]!;
    expect(after('$ACADVER')).toEqual({ code: 1, value: 'AC1009' });
    expect(after('$INSUNITS')).toEqual({ code: 70, value: '4' });
    expect(Number(after('$EXTMIN').value)).toBeLessThanOrEqual(10);
    expect(sections.HEADER).toBeDefined();
  });

  it('has a LAYER table entry per drawing layer, reference layers dashed', () => {
    const layers = sections.TABLES!.filter((e) => e.type === 'LAYER' && get(e, 2) !== 'LAYER');
    const names = layers.map((e) => get(e, 2));
    for (const l of d.layers) expect(names).toContain(l.name);
    expect(get(layers.find((e) => get(e, 2) === 'centerline')!, 6)).toBe('DASHED');
    expect(get(layers.find((e) => get(e, 2) === 'outline')!, 6)).toBe('CONTINUOUS');
    expect(sections.TABLES!.some((e) => e.type === 'LTYPE' && get(e, 2) === 'DASHED')).toBe(true);
  });

  it('writes polylines as POLYLINE/VERTEX/SEQEND with the closed flag and unchanged coordinates', () => {
    const ents = sections.ENTITIES!;
    const polys = ents.filter((e) => e.type === 'POLYLINE');
    expect(polys).toHaveLength(2);
    const outline = polys.find((e) => get(e, 8) === 'outline')!;
    expect(num(outline, 70)).toBe(1);
    expect(num(polys.find((e) => get(e, 8) === 'centerline')!, 70)).toBe(0);
    const start = ents.indexOf(outline);
    const verts = ents.slice(start + 1, start + 5);
    expect(verts.every((e) => e.type === 'VERTEX' && get(e, 8) === 'outline')).toBe(true);
    // No y flip: same coordinates as the Drawing.
    expect(verts.map((e) => [num(e, 10), num(e, 20)])).toEqual([[10, 20], [110, 20], [110, 70], [10, 70]]);
    expect(ents[start + 5]!.type).toBe('SEQEND');
  });

  it('writes circles and text', () => {
    const ents = sections.ENTITIES!;
    const c = ents.find((e) => e.type === 'CIRCLE')!;
    expect([num(c, 10), num(c, 20), num(c, 40)]).toEqual([60, 45, 4]);
    expect(get(c, 8)).toBe('holes');
    const texts = ents.filter((e) => e.type === 'TEXT');
    expect(texts.map((e) => get(e, 1))).toEqual(['Low', 'Up 45%%d']);
    expect(num(texts[0]!, 40)).toBe(3);
    const rotated = texts[1]!;
    expect(num(rotated, 50)).toBe(45);
    expect(num(rotated, 72)).toBe(1);
    expect([num(rotated, 11), num(rotated, 21)]).toEqual([60, 60]);
  });
});
