// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF_OPTIONS, drawingToPdf, drawingsToPdf, planTiles, type PdfOptions } from './index';
import { coverCapacity, pdfSafe } from './pdf';
import { sampleDrawing } from './fixtures.test-util';

const opts = (o: Partial<PdfOptions> = {}): PdfOptions => ({ ...DEFAULT_PDF_OPTIONS, ...o });
const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
};
const pageCount = (b: Uint8Array) => (latin1(b).match(/\/Type \/Page\b/g) ?? []).length;
/** MediaBox of every page, in mm. */
const mediaBoxesMm = (b: Uint8Array) =>
  [...latin1(b).matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1]!.trim().split(/\s+/).map((n: string) => (Number(n) * 25.4) / 72));

describe('drawingToPdf', () => {
  const big = sampleDrawing(450, 350, -120, -80);

  it('emits a PDF with one page per planned tile', () => {
    const o = opts({ orientation: 'portrait' });
    const pdf = drawingToPdf(big, o);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(latin1(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(planTiles(big, o).tiles.length);
    expect(pageCount(pdf)).toBe(6);
  });

  it('pages are the real paper size in mm (no scaling)', () => {
    const boxes = mediaBoxesMm(drawingToPdf(big, opts({ orientation: 'portrait', paper: 'letter' })));
    expect(boxes.length).toBeGreaterThan(0);
    for (const [, , w, h] of boxes) {
      expect(w).toBeCloseTo(215.9, 2);
      expect(h).toBeCloseTo(279.4, 2);
    }
  });

  it('single mode is one page sized to the plan', () => {
    const o = opts({ mode: 'single' });
    const pdf = drawingToPdf(big, o);
    const plan = planTiles(big, o);
    expect(pageCount(pdf)).toBe(1);
    const [[, , w, h]] = mediaBoxesMm(pdf) as [number[]];
    expect(w).toBeCloseTo(plan.pageWidth, 2);
    expect(h).toBeCloseTo(plan.pageHeight, 2);
  });

  it('works with the default options and a small drawing', () => {
    expect(pageCount(drawingToPdf(sampleDrawing(60, 40)))).toBe(1);
  });
});

describe('drawingsToPdf', () => {
  it('has 1 cover page + the sum of every drawing’s tiles', () => {
    const ds = [sampleDrawing(450, 350), sampleDrawing(60, 40), sampleDrawing(150, 500)];
    const o = opts();
    const expected = 1 + ds.reduce((n, d) => n + planTiles(d, o).tiles.length, 0);
    const pdf = drawingsToPdf(ds, o);
    expect(latin1(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(expected);
  });

  it('adds cover pages only when the list overflows one page', () => {
    const n = coverCapacity(opts());
    expect(pageCount(drawingsToPdf(Array.from({ length: n }, () => sampleDrawing(60, 40)), opts()))).toBe(1 + n);
    const ds = Array.from({ length: n + 1 }, () => sampleDrawing(60, 40));
    expect(pageCount(drawingsToPdf(ds, opts()))).toBe(2 + n + 1);
  });
});

describe('pdfSafe', () => {
  it('maps typography outside WinAnsi to ASCII and keeps Latin-1', () => {
    expect(pdfSafe('a — b → c ° Ø ×')).toBe('a - b -> c ° Ø ×');
  });
});
