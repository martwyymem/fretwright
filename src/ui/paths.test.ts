// SPDX-License-Identifier: GPL-3.0-or-later
import { DEFAULT_SPEC } from '../core';
import { getAt, setAt, setMany } from './paths';

describe('getAt', () => {
  it('reads nested values and array indices', () => {
    expect(getAt(DEFAULT_SPEC, 'scale.bass')).toBe(DEFAULT_SPEC.scale.bass);
    expect(getAt(DEFAULT_SPEC, 'body.pickups.1.fromBridge')).toBe(DEFAULT_SPEC.body.pickups[1]!.fromBridge);
    expect(getAt(DEFAULT_SPEC, 'fretboard.inlays.style')).toBe('dots');
  });
  it('returns undefined for missing paths', () => {
    expect(getAt(DEFAULT_SPEC, 'nope.deeper')).toBeUndefined();
    expect(getAt(DEFAULT_SPEC, 'scale.bass.x')).toBeUndefined();
    expect(getAt(null, 'a')).toBeUndefined();
  });
  it('empty path returns the object', () => {
    expect(getAt(DEFAULT_SPEC, '')).toBe(DEFAULT_SPEC);
  });
});

describe('setAt', () => {
  it('writes immutably and preserves untouched branches', () => {
    const next = setAt(DEFAULT_SPEC, 'scale.treble', 600);
    expect(next.scale.treble).toBe(600);
    expect(DEFAULT_SPEC.scale.treble).not.toBe(600);
    expect(next).not.toBe(DEFAULT_SPEC);
    expect(next.scale).not.toBe(DEFAULT_SPEC.scale);
    expect(next.body).toBe(DEFAULT_SPEC.body);
  });
  it('writes into arrays and keeps them arrays', () => {
    const next = setAt(DEFAULT_SPEC, 'body.pickups.0.angle', -5);
    expect(Array.isArray(next.body.pickups)).toBe(true);
    expect(next.body.pickups[0]!.angle).toBe(-5);
    expect(next.body.pickups[1]).toBe(DEFAULT_SPEC.body.pickups[1]);
    expect(DEFAULT_SPEC.body.pickups[0]!.angle).toBe(8);
  });
  it('returns the same object when the value is unchanged', () => {
    expect(setAt(DEFAULT_SPEC, 'scale.bass', DEFAULT_SPEC.scale.bass)).toBe(DEFAULT_SPEC);
  });
  it('creates missing containers', () => {
    expect(setAt({} as Record<string, unknown>, 'a.0.b', 1)).toEqual({ a: [{ b: 1 }] });
  });
  it('setMany applies writes in order', () => {
    const next = setMany(DEFAULT_SPEC, [
      ['scale.bass', 700],
      ['scale.treble', 650],
      ['scale.bass', 710],
    ]);
    expect(next.scale).toEqual({ bass: 710, treble: 650 });
  });
});
