// SPDX-License-Identifier: GPL-3.0-or-later
/** Turn validation issues into friendly, field-labelled messages for the Check panel. */
import type { SpecIssue } from '../core';
import { fieldForPath } from './fields';

export interface UiIssue extends SpecIssue {
  /** Field that owns the issue (for focusing), if any. */
  fieldPath?: string;
  fieldLabel?: string;
}

/** Schema (zod) messages are terse; rephrase the common ones. */
export function friendlyMessage(message: string): string {
  let m: RegExpMatchArray | null;
  if ((m = message.match(/expected (?:number|array|string)[^>=<]*>=\s*(-?[\d.]+)/i))) return `must be at least ${m[1]}.`;
  if ((m = message.match(/expected (?:number|array|string)[^>=<]*<=\s*(-?[\d.]+)/i))) return `must be at most ${m[1]}.`;
  if ((m = message.match(/expected (?:number)[^>=<]*>\s*(-?[\d.]+)/i))) return `must be more than ${m[1]}.`;
  if (/expected int/i.test(message)) return 'must be a whole number.';
  if (/expected number/i.test(message)) return 'needs a number.';
  return message;
}

const LEVEL_ORDER = { error: 0, warning: 1, info: 2 } as const;

export function toUiIssues(issues: SpecIssue[], fromSchema: boolean): UiIssue[] {
  return issues
    .map((i) => {
      const f = fieldForPath(i.path);
      const msg = fromSchema ? friendlyMessage(i.message) : i.message;
      const index = i.path.match(/\.(\d+)(?:\.|$)/);
      const where = f && index && f.kind !== 'intlist' ? `${f.label} #${Number(index[1]) + 1}` : f?.label;
      return {
        ...i,
        message: fromSchema && where ? `${where} ${msg}` : msg,
        fieldPath: f?.path,
        fieldLabel: where,
      };
    })
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
