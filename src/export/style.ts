// SPDX-License-Identifier: GPL-3.0-or-later
/** Styling shared by every exporter, so SVG, PDF and DXF read the same way. */
import type { LayerKind } from '../core/geom';

export interface StrokeStyle {
  /** Line width, mm. */
  width: number;
  /** Hex colour. */
  color: string;
  /** Dash pattern [on, off] in mm; absent = solid. */
  dash?: [number, number];
}

export const LAYER_STYLE: Record<LayerKind, StrokeStyle> = {
  cut: { width: 0.35, color: '#000000' },
  slot: { width: 0.2, color: '#000000' },
  mark: { width: 0.2, color: '#000000' },
  reference: { width: 0.15, color: '#888888', dash: [3, 1.5] },
  // Annotation layers are mostly text; any lines on them (dimension lines) are hairlines.
  annotation: { width: 0.13, color: '#000000' },
};

/** Shape text size is cap height; font size ≈ cap height / 0.7. */
export const CAP_TO_FONT = 1 / 0.7;
/** 1 pt in mm. */
export const MM_PER_PT = 25.4 / 72;

export const FONT_FAMILY = 'Helvetica, Arial, sans-serif';

/** Compact number formatting: up to `digits` decimals, no trailing zeros, no "-0". */
export function fmt(n: number, digits = 3): string {
  const s = n.toFixed(digits).replace(/\.?0+$/, '');
  return s === '-0' || s === '' ? '0' : s;
}

/** Spreadsheet-style row letters: 0 → A, 25 → Z, 26 → AA. */
export function rowLabel(row: number): string {
  let s = '';
  let n = row + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const tileLabel = (row: number, col: number): string => `${rowLabel(row)}${col + 1}`;
