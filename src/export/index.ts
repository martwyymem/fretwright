// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Exporters: Drawing (mm, +y up) → files. All output is 1:1.
 * OWNER: wave-1 "export" agent. Signatures are the contract.
 */
import type { Drawing } from '../core/geom';
import { drawingToDxfImpl } from './dxf';
import { drawingToPdfImpl, drawingsToPdfImpl } from './pdf';
import { drawingToSvgImpl } from './svg';
import { planTilesImpl } from './tiles';

export { PAPER_MM, FOOTER_H, BOUNDS_PAD } from './tiles';

export type PaperSize = 'a4' | 'letter' | 'a3' | 'tabloid';

export interface PdfOptions {
  paper: PaperSize;
  /** 'auto' picks whichever needs fewer pages. */
  orientation: 'portrait' | 'landscape' | 'auto';
  /** Overlap between neighbouring tiles, mm (for taping pages together). */
  overlap: number;
  /** Non-printable margin assumed on every page edge, mm. */
  margin: number;
  /**
   * 'tiled' splits the drawing over pages of `paper`;
   * 'single' emits one page exactly the drawing size + margin (for large-format / plotter printing).
   */
  mode: 'tiled' | 'single';
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = { paper: 'a4', orientation: 'auto', overlap: 10, margin: 8, mode: 'tiled' };

export interface Tile {
  /** Row/column label printed on the page, e.g. "B3". */
  label: string;
  row: number;
  col: number;
  /** Drawing-space window (mm) shown on this page. */
  window: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface TilePlan {
  pageWidth: number;
  pageHeight: number;
  orientation: 'portrait' | 'landscape';
  rows: number;
  cols: number;
  tiles: Tile[];
}

/** Pure page planning (testable without a PDF library). */
export function planTiles(d: Drawing, opts: PdfOptions): TilePlan {
  return planTilesImpl(d, opts);
}

/** SVG with width/height in mm and a viewBox in mm, so it prints and imports at 1:1. */
export function drawingToSvg(d: Drawing): string {
  return drawingToSvgImpl(d);
}

/** PDF bytes. Each page carries a calibration ruler, tile label, alignment marks and "print at 100%" note. */
export function drawingToPdf(d: Drawing, opts: PdfOptions = DEFAULT_PDF_OPTIONS): Uint8Array {
  return drawingToPdfImpl(d, opts);
}

/** One PDF containing several drawings (each tiled per `opts`), with a cover page listing them. */
export function drawingsToPdf(ds: Drawing[], opts: PdfOptions = DEFAULT_PDF_OPTIONS): Uint8Array {
  return drawingsToPdfImpl(ds, opts);
}

/** ASCII DXF (R12-compatible ENTITIES), units = mm ($INSUNITS 4), one DXF layer per Drawing layer. */
export function drawingToDxf(d: Drawing): string {
  return drawingToDxfImpl(d);
}
