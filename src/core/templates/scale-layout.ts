// SPDX-License-Identifier: GPL-3.0-or-later
import type { TemplateDef } from '../template';
import { placeholderDrawing } from './_placeholder';

export const scaleLayoutTemplate: TemplateDef = {
  id: 'scale-layout',
  title: 'Scale & bridge layout',
  description: 'Nut-to-saddle string paths, fret lines and the compensated saddle line for placing the bridge.',
  category: 'layout',
  build: (spec) => placeholderDrawing('scale-layout', 'Scale & bridge layout', spec),
};
