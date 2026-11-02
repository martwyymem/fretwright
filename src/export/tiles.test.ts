// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { drawingBounds } from '../core/geom';
import { DEFAULT_PDF_OPTIONS, FOOTER_H, planTiles, type PdfOptions, type TilePlan } from './index';
import { rowLabel } from './style';
import { sampleDrawing } from './fixtures.test-util';

const opts = (o: Partial<PdfOptions> = {}): PdfOptions => ({ ...DEFAULT_PDF_OPTIONS, ...o });

function expectCovers(plan: TilePlan, d = big) {
  const b = drawingBounds(d)!;
  const minX = Math.min(...plan.tiles.map((t) => t.window.minX));
  const maxX = Math.max(...plan.tiles.map((t) => t.window.maxX));
  const minY = Math.min(...plan.tiles.map((t) => t.window.minY));
  const maxY = Math.max(...plan.tiles.map((t) => t.window.maxY));
  expect(minX).toBeLessThan(b.minX);
  expect(maxX).toBeGreaterThan(b.maxX);
  expect(minY).toBeLessThan(b.minY);
  expect(maxY).toBeGreaterThan(b.maxY);
}

// 450 × 350 mm with an off-origin corner: bigger than A4 in both axes.
const big = sampleDrawing(450, 350, -120, -80);

describe('planTiles (tiled)', () => {
  const o = opts({ paper: 'a4', orientation: 'portrait', overlap: 10, margin: 8 });
  const plan = planTiles(big, o);
  const tw = 210 - 16;
  const th = 297 - 16 - FOOTER_H;

  it('uses the paper size and a window = printable area minus footer', () => {
    expect(plan.pageWidth).toBe(210);
    expect(plan.pageHeight).toBe(297);
    expect(plan.orientation).toBe('portrait');
    for (const t of plan.tiles) {
      expect(t.window.maxX - t.window.minX).toBeCloseTo(tw, 9);
      expect(t.window.maxY - t.window.minY).toBeCloseTo(th, 9);
    }
  });

  it('uses the minimum grid and covers the bounds', () => {
    // 454 mm wide (incl. pad) over 194 mm windows with 10 mm overlap -> 3 cols; 354 over 265 -> 2 rows.
    expect(plan.cols).toBe(3);
    expect(plan.rows).toBe(2);
    expect(plan.tiles).toHaveLength(6);
    expectCovers(plan);
  });

  it('overlaps neighbours by exactly the requested amount', () => {
    const at = (r: number, c: number) => plan.tiles.find((t) => t.row === r && t.col === c)!.window;
    for (let r = 0; r < plan.rows; r++)
      for (let c = 0; c + 1 < plan.cols; c++) expect(at(r, c).maxX - at(r, c + 1).minX).toBeCloseTo(10, 9);
    for (let c = 0; c < plan.cols; c++)
      for (let r = 0; r + 1 < plan.rows; r++) expect(at(r, c).minY - at(r + 1, c).maxY).toBeCloseTo(-10, 9);
  });

  it('labels rows A, B… from the top (highest y) and columns 1, 2…', () => {
    expect(plan.tiles.map((t) => t.label)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
    const a1 = plan.tiles[0]!.window;
    const b1 = plan.tiles[3]!.window;
    expect(a1.maxY).toBeGreaterThan(b1.maxY);
    expect(plan.tiles[1]!.window.minX).toBeGreaterThan(a1.minX);
    expect(rowLabel(25)).toBe('Z');
    expect(rowLabel(26)).toBe('AA');
  });

  it('auto orientation picks fewer pages, tie -> landscape', () => {
    // 450 × 350: portrait 3×2 = 6, landscape (281 × 178 windows) 2×3 = 6 -> tie -> landscape.
    const tie = planTiles(big, opts({ orientation: 'auto' }));
    expect(tie.orientation).toBe('landscape');
    expect(tie.tiles).toHaveLength(planTiles(big, opts({ orientation: 'portrait' })).tiles.length);
    // A tall narrow drawing fits fewer portrait pages.
    const tall = sampleDrawing(150, 500);
    const p = planTiles(tall, opts({ orientation: 'portrait' }));
    const l = planTiles(tall, opts({ orientation: 'landscape' }));
    expect(p.tiles.length).toBeLessThan(l.tiles.length);
    expect(planTiles(tall, opts({ orientation: 'auto' })).orientation).toBe('portrait');
    // A wide flat one fits fewer landscape pages.
    const wide = sampleDrawing(500, 150);
    expect(planTiles(wide, opts({ orientation: 'auto' })).orientation).toBe('landscape');
    expectCovers(planTiles(tall, opts()), tall);
  });

  it('single mode: one page of drawing size + margin (+ footer band)', () => {
    const s = planTiles(big, opts({ mode: 'single', margin: 8 }));
    const b = drawingBounds(big)!;
    expect(s.tiles).toHaveLength(1);
    expect(s.tiles[0]!.label).toBe('A1');
    expect(s.pageWidth).toBeCloseTo(b.maxX - b.minX + 4 + 16, 9);
    expect(s.pageHeight).toBeCloseTo(b.maxY - b.minY + 4 + 16 + FOOTER_H, 9);
    expectCovers(s);
  });

  it('fits a small drawing on one page and rejects impossible settings with a clear message', () => {
    expect(planTiles(sampleDrawing(50, 50), opts()).tiles).toHaveLength(1);
    expect(() => planTiles(big, opts({ overlap: 300 }))).toThrow(/overlap/);
  });
});
