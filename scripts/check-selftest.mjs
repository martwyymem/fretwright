// SPDX-License-Identifier: GPL-3.0-or-later
// Checks the result of two FRETWRIGHT_SELFTEST runs of a desktop build.
//   node scripts/check-selftest.mjs <run1-dir> <run2-dir> <downloads-dir>
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [run1, run2, downloads] = process.argv.slice(2);
const fail = [];
const report = (dir) => {
  const p = join(dir, 'selftest.json');
  if (!existsSync(p)) return fail.push(`${p} missing (app did not load or did not finish)`), null;
  const r = JSON.parse(readFileSync(p, 'utf8'));
  console.log(dir, JSON.stringify({ ...r, text: r.text?.slice(0, 80) }));
  if (r.title !== 'Fretwright') fail.push(`${dir}: title is ${JSON.stringify(r.title)}`);
  if (!(r.svgs >= 1)) fail.push(`${dir}: no preview SVG rendered`);
  if (!(r.buttons >= 10)) fail.push(`${dir}: UI did not render (${r.buttons} buttons)`);
  return r;
};
report(run1);
const second = report(run2);
if (second && !second.previousRun) fail.push('localStorage did not persist between launches');
const files = existsSync(downloads) ? readdirSync(downloads) : [];
for (const ext of ['.svg', '.dxf', '.pdf']) {
  if (!files.some((f) => f.endsWith(ext))) fail.push(`no ${ext} export in ${downloads} (found: ${files.join(', ')})`);
}
if (fail.length) {
  console.error('SELF-TEST FAILED\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('self-test passed');
