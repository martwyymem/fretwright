// SPDX-License-Identifier: GPL-3.0-or-later
/** Drawing → ASCII DXF R12 (AC1009), mm. DXF is y-up like the Drawing, so no flip. */
import { drawingBounds, type Drawing, type LayerKind, type Shape } from '../core/geom';
import { fmt } from './style';

/** ACI colour per layer kind: white/black, red, green, grey, blue. */
const KIND_COLOR: Record<LayerKind, number> = { cut: 7, slot: 1, mark: 3, reference: 8, annotation: 5 };
const DASH: [number, number] = [3, 1.5];

/** R12 text: special symbols via %% codes, other non-ASCII via \U+XXXX, no newlines. */
export function dxfText(s: string): string {
  let out = '';
  for (const ch of s.replace(/[\r\n]+/g, ' ')) {
    const cp = ch.codePointAt(0)!;
    if (ch === '°') out += '%%d';
    else if (ch === '±') out += '%%p';
    else if (ch === 'Ø' || ch === '⌀') out += '%%c';
    else if (ch === '%') out += '%%%';
    else if (cp < 128) out += ch;
    else out += `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}

export function drawingToDxfImpl(d: Drawing): string {
  const out: string[] = [];
  const g = (code: number, value: string | number) => {
    out.push(String(code), typeof value === 'number' ? fmt(value, 6) : value);
  };
  const b = drawingBounds(d) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, 4);
  g(9, '$EXTMIN'); g(10, b.minX); g(20, b.minY); g(30, 0);
  g(9, '$EXTMAX'); g(10, b.maxX); g(20, b.maxY); g(30, 0);
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, '__ __ __'); g(72, 65); g(73, 2);
  g(40, DASH[0] + DASH[1]); g(49, DASH[0]); g(49, -DASH[1]);
  g(0, 'ENDTAB');
  const layers = [{ name: '0', kind: 'cut' as LayerKind }, ...d.layers.filter((l) => l.name !== '0')];
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
  for (const l of layers) {
    g(0, 'LAYER'); g(2, l.name); g(70, 0);
    g(62, KIND_COLOR[l.kind]); g(6, l.kind === 'reference' ? 'DASHED' : 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'BLOCKS'); g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'ENTITIES');
  const entity = (layer: string, s: Shape) => {
    switch (s.kind) {
      case 'polyline':
        if (s.points.length === 0) return;
        g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, s.closed ? 1 : 0);
        for (const p of s.points) {
          g(0, 'VERTEX'); g(8, layer); g(10, p.x); g(20, p.y); g(30, 0);
        }
        g(0, 'SEQEND'); g(8, layer);
        return;
      case 'circle':
        g(0, 'CIRCLE'); g(8, layer); g(10, s.center.x); g(20, s.center.y); g(30, 0); g(40, s.r);
        return;
      case 'text': {
        const h = s.anchor === 'middle' ? 1 : s.anchor === 'end' ? 2 : 0;
        g(0, 'TEXT'); g(8, layer); g(10, s.at.x); g(20, s.at.y); g(30, 0); g(40, s.size);
        g(1, dxfText(s.text));
        if (s.rotate) g(50, s.rotate);
        if (h) {
          g(72, h); g(11, s.at.x); g(21, s.at.y); g(31, 0);
        }
        return;
      }
    }
  };
  for (const l of d.layers) for (const s of l.shapes) entity(l.name, s);
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\n') + '\n';
}
