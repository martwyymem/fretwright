// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tiny immutable dot-path helpers ("scale.treble", "body.pickups.0.angle").
 * Numeric segments index arrays. `setAt` copies only the objects along the path, so
 * untouched branches keep their identity (cheap memoisation downstream).
 */

export type Path = string;

const split = (path: Path): string[] => (path === '' ? [] : path.split('.'));

const isIndex = (seg: string): boolean => /^\d+$/.test(seg);

/** Read the value at `path`, or undefined if any step is missing. */
export function getAt(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const seg of split(path)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Return a copy of `obj` with `value` written at `path`. Missing containers are created. */
export function setAt<T>(obj: T, path: Path, value: unknown): T {
  const segs = split(path);
  if (segs.length === 0) return value as T;
  const rec = (node: unknown, i: number): unknown => {
    const seg = segs[i]!;
    const last = i === segs.length - 1;
    const container: Record<string, unknown> | unknown[] =
      node !== null && typeof node === 'object'
        ? Array.isArray(node)
          ? [...node]
          : { ...(node as Record<string, unknown>) }
        : isIndex(seg)
          ? []
          : {};
    const key = isIndex(seg) && Array.isArray(container) ? Number(seg) : seg;
    const child = (container as Record<string | number, unknown>)[key];
    const next = last ? value : rec(child, i + 1);
    if (Object.is(child, next) && node !== null && typeof node === 'object') return node;
    (container as Record<string | number, unknown>)[key] = next;
    return container;
  };
  return rec(obj, 0) as T;
}

/** Apply several writes in order. */
export function setMany<T>(obj: T, writes: ReadonlyArray<readonly [Path, unknown]>): T {
  return writes.reduce<T>((acc, [p, val]) => setAt(acc, p, val), obj);
}

/** DOM id for the input that edits `path`. */
export const fieldDomId = (path: Path): string => `f-${path.replace(/\./g, '-')}`;
