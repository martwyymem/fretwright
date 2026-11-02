// SPDX-License-Identifier: GPL-3.0-or-later
import type { Drawing } from './geom';
import type { GuitarSpec } from './spec';

export type TemplateCategory = 'fretboard' | 'neck' | 'headstock' | 'body' | 'layout' | 'gauge';

/** A printable template: a pure function from a spec to a 1:1 Drawing. */
export interface TemplateDef {
  /** Stable id, kebab-case. Also the Drawing id. */
  id: string;
  title: string;
  /** One sentence shown in the UI: what to do with this template. */
  description: string;
  category: TemplateCategory;
  build(spec: GuitarSpec): Drawing;
}
