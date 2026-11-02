// SPDX-License-Identifier: GPL-3.0-or-later
import type { TemplateDef } from '../template';
import { placeholderDrawing } from './_placeholder';

export const fullLayoutTemplate: TemplateDef = {
  id: 'full-layout',
  title: 'Full instrument layout',
  description: 'The whole instrument at 1:1: body, neck, headstock and strings, for checking proportions.',
  category: 'layout',
  build: (spec) => placeholderDrawing('full-layout', 'Full instrument layout', spec),
};
