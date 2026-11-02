// SPDX-License-Identifier: GPL-3.0-or-later
/** Public API of the core (pure TS, no DOM). The UI imports only from here and from ../export. */
export * from './units';
export * from './geom';
export * from './spec';
export * from './presets';
export * from './layout';
export * from './template';
export * from './validate';
export { TEMPLATES, templateById } from './templates';
