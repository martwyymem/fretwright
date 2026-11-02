// SPDX-License-Identifier: GPL-3.0-or-later
import type { TemplateDef } from '../template';
import { placeholderDrawing } from './_placeholder';

export const neckSectionsTemplate: TemplateDef = {
  id: 'neck-sections',
  title: 'Neck profile gauges',
  description: 'Cross-section gauges at fret 1 and fret 12 for carving the neck back.',
  category: 'gauge',
  build: (spec) => placeholderDrawing('neck-sections', 'Neck profile gauges', spec),
};
