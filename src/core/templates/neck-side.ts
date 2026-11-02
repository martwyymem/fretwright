// SPDX-License-Identifier: GPL-3.0-or-later
import type { TemplateDef } from '../template';
import { placeholderDrawing } from './_placeholder';

export const neckSideTemplate: TemplateDef = {
  id: 'neck-side',
  title: 'Neck side profile',
  description: 'Side view of the neck: taper, heel and headstock transition, truss-rod channel.',
  category: 'neck',
  build: (spec) => placeholderDrawing('neck-side', 'Neck side profile', spec),
};
