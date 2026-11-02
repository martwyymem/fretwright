// SPDX-License-Identifier: GPL-3.0-or-later
import type { TemplateDef } from '../template';
import { placeholderDrawing } from './_placeholder';

export const bodyTemplate: TemplateDef = {
  id: 'body',
  title: 'Body',
  description: 'Body outline with neck pocket, pickup routes and the bridge line.',
  category: 'body',
  build: (spec) => placeholderDrawing('body', 'Body', spec),
};
