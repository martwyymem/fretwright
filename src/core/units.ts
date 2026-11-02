// SPDX-License-Identifier: GPL-3.0-or-later
/** All internal lengths are millimetres. Inches exist only at the UI boundary. */

export const MM_PER_INCH = 25.4;

export const inToMm = (inches: number): number => inches * MM_PER_INCH;
export const mmToIn = (mm: number): number => mm / MM_PER_INCH;
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

/** String gauge given in thousandths of an inch (e.g. 10 for a .010 string) → diameter in mm. */
export const gaugeToMm = (thou: number): number => inToMm(thou / 1000);

export type DisplayUnit = 'mm' | 'in';

/** Format a mm value for display in the chosen unit. */
export function formatLength(mm: number, unit: DisplayUnit, digits?: number): string {
  if (unit === 'in') return `${mmToIn(mm).toFixed(digits ?? 3)}"`;
  return `${mm.toFixed(digits ?? 2)} mm`;
}
