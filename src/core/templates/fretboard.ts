// SPDX-License-Identifier: GPL-3.0-or-later
import type { TemplateDef } from '../template';
import { placeholderDrawing } from './_placeholder';

export const fretboardTemplate: TemplateDef = {
  id: 'fretboard',
  title: 'Fretboard',
  description: 'Glue to the blank, saw the fret slots, drill inlay centres, cut the outline.',
  category: 'fretboard',
  build: (spec) => placeholderDrawing('fretboard', 'Fretboard', spec),
};
