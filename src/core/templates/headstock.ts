// SPDX-License-Identifier: GPL-3.0-or-later
import type { TemplateDef } from '../template';
import { placeholderDrawing } from './_placeholder';

export const headstockTemplate: TemplateDef = {
  id: 'headstock',
  title: 'Headstock',
  description: 'Headstock outline with tuner hole centres and the nut line.',
  category: 'headstock',
  build: (spec) => placeholderDrawing('headstock', 'Headstock', spec),
};
