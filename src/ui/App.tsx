// SPDX-License-Identifier: GPL-3.0-or-later
/** OWNER: wave-1 "UI" agent. Placeholder shell. */
import { TEMPLATES } from '../core';

export function App() {
  return (
    <main>
      <h1>Fretwright</h1>
      <ul>{TEMPLATES.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
    </main>
  );
}
