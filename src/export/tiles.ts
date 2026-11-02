// SPDX-License-Identifier: GPL-3.0-or-later
/** Pure page planning: which drawing-space window lands on which sheet of paper. */
import { drawingBounds, type Bounds, type Drawing } from '../core/geom';
import type { PaperSize, PdfOptions, Tile, TilePlan } from './index';
import { tileLabel } from './style';

/** Portrait width × height, mm. */
export const PAPER_MM: Record<PaperSize, readonly [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
  a3: [297, 420],
  tabloid: [279.4, 431.8],
};

/** Pad added around the drawing bounds so hairlines at the extremes are not clipped, mm. */
export const BOUNDS_PAD = 2;
/**
 * Height of the footer band (rulers, label, print note) reserved at the bottom of the
 * printable area, mm. It is inside the margin box because the margin is assumed unprintable.
 */
export const FOOTER_H = 16;
/** Minimum printable width that fits the footer (rulers + text), mm. Used by 'single' mode. */
export const FOOTER_MIN_W = 190;

const EPS = 1e-6;

export function paddedBounds(d: Drawing): Bounds {
  const b = drawingBounds(d) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX: b.minX - BOUNDS_PAD, minY: b.minY - BOUNDS_PAD, maxX: b.maxX + BOUNDS_PAD, maxY: b.maxY + BOUNDS_PAD };
}

/** Number of windows of size `win`, overlapping by `overlap`, needed to cover `span`. */
function count(span: number, win: number, overlap: number): number {
  if (span <= win + EPS) return 1;
  return Math.ceil((span - overlap) / (win - overlap) - EPS);
}

function grid(
  b: Bounds,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  overlap: number,
): TilePlan {
  const tw = pageWidth - 2 * margin;
  const th = pageHeight - 2 * margin - FOOTER_H;
  if (tw <= overlap || th <= overlap) {
    throw new Error(
      `Page too small: printable area ${tw.toFixed(1)} × ${th.toFixed(1)} mm must be larger than the ` +
        `${overlap} mm overlap. Reduce the margin or overlap, or choose a larger paper size.`,
    );
  }
  const W = b.maxX - b.minX;
  const H = b.maxY - b.minY;
  const cols = count(W, tw, overlap);
  const rows = count(H, th, overlap);
  // Centre the grid on the drawing so the spare paper is split evenly.
  const spanW = cols * tw - (cols - 1) * overlap;
  const spanH = rows * th - (rows - 1) * overlap;
  const x0 = (b.minX + b.maxX) / 2 - spanW / 2;
  const yTop = (b.minY + b.maxY) / 2 + spanH / 2;
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const minX = x0 + col * (tw - overlap);
      const maxY = yTop - row * (th - overlap);
      tiles.push({ label: tileLabel(row, col), row, col, window: { minX, maxX: minX + tw, minY: maxY - th, maxY } });
    }
  }
  return {
    pageWidth,
    pageHeight,
    orientation: pageWidth > pageHeight ? 'landscape' : 'portrait',
    rows,
    cols,
    tiles,
  };
}

export function planTilesImpl(d: Drawing, opts: PdfOptions): TilePlan {
  const b = paddedBounds(d);
  const margin = Math.max(0, opts.margin);
  const overlap = Math.max(0, opts.overlap);
  if (opts.mode === 'single') {
    const pw = Math.max(b.maxX - b.minX, FOOTER_MIN_W) + 2 * margin;
    const ph = b.maxY - b.minY + FOOTER_H + 2 * margin;
    return grid(b, pw, ph, margin, 0);
  }
  const [a, c] = PAPER_MM[opts.paper];
  if (opts.orientation === 'portrait') return grid(b, a, c, margin, overlap);
  if (opts.orientation === 'landscape') return grid(b, c, a, margin, overlap);
  const p = grid(b, a, c, margin, overlap);
  const l = grid(b, c, a, margin, overlap);
  return p.tiles.length < l.tiles.length ? p : l;
}
