// SPDX-License-Identifier: GPL-3.0-or-later
/** Template registry, in the order shown in the UI. One file per template. */
import type { TemplateDef } from '../template';
import { fretboardTemplate } from './fretboard';
import { scaleLayoutTemplate } from './scale-layout';
import { radiusGaugesTemplate } from './radius-gauges';
import { neckSideTemplate } from './neck-side';
import { neckSectionsTemplate } from './neck-sections';
import { headstockTemplate } from './headstock';
import { bodyTemplate } from './body';
import { fullLayoutTemplate } from './full-layout';

export const TEMPLATES: TemplateDef[] = [
  fullLayoutTemplate,
  fretboardTemplate,
  scaleLayoutTemplate,
  radiusGaugesTemplate,
  neckSideTemplate,
  neckSectionsTemplate,
  headstockTemplate,
  bodyTemplate,
];

export const templateById = (id: string): TemplateDef | undefined => TEMPLATES.find((t) => t.id === id);
