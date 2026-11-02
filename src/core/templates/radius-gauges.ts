// SPDX-License-Identifier: GPL-3.0-or-later
import type { TemplateDef } from '../template';
import { placeholderDrawing } from './_placeholder';

export const radiusGaugesTemplate: TemplateDef = {
  id: 'radius-gauges',
  title: 'Radius gauges',
  description: 'Cut out and use to check the fretboard radius while sanding.',
  category: 'gauge',
  build: (spec) => placeholderDrawing('radius-gauges', 'Radius gauges', spec),
};
