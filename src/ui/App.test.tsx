// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_SPEC, PRESETS, inToMm } from '../core';
import { App } from './App';
import { STORAGE_KEY, specReducer, initState } from './state';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const dim = (name: string) => document.querySelector(`[data-dim="${name}"]`)?.textContent ?? '';
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const openStep = (title: string) => {
  const btn = screen.getByRole('button', { name: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  if (btn.getAttribute('aria-expanded') !== 'true') fireEvent.click(btn);
};
const checkPanel = () => within(screen.getByRole('region', { name: 'Check' }));

describe('App', () => {
  it('renders the main areas', () => {
    render(<App />);
    expect(screen.getByText('Fretwright')).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Templates' })).toBeTruthy();
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Check' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Key dimensions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print templates (PDF)' })).toBeTruthy();
    // Placeholder templates still draw something.
    expect(document.querySelectorAll('.dv-svg [data-shape]').length).toBeGreaterThan(0);
    expect(dim('Scale')).toContain('647.7 mm');
  });

  it('every visible input has a label', () => {
    render(<App />);
    for (const s of ['Instrument & strings', 'Scale & frets', 'Fretboard', 'Neck', 'Headstock', 'Body & pickups']) {
      openStep(s);
      const more = screen.queryByRole('button', { name: /More options/ });
      if (more) fireEvent.click(more);
      for (const el of document.querySelectorAll('.left input, .left select')) {
        const id = el.getAttribute('id');
        const labelled = (id && document.querySelector(`label[for="${id}"]`)) || el.getAttribute('aria-label') || el.closest('label');
        expect(labelled, `input ${id} has a label`).toBeTruthy();
      }
    }
  });

  it('selecting a preset changes the scale shown', () => {
    render(<App />);
    const bass = PRESETS.find((p) => p.id === 'bass-4-34')!;
    fireEvent.change(screen.getByLabelText('Start from a preset'), { target: { value: bass.id } });
    expect(dim('Scale')).toContain('863.6 mm');
    expect(dim('Strings')).toBe('4');
  });

  it('editing a length in inches stores millimetres', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'inches' }));
    openStep('Scale & frets');
    const scale = input('f-scale-bass');
    expect(scale.value).toBe('25.5');
    fireEvent.change(scale, { target: { value: '25' } });
    fireEvent.blur(scale);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).scale.bass).toBeCloseTo(635, 9);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).scale.treble).toBeCloseTo(635, 9);
    fireEvent.click(screen.getByRole('radio', { name: 'mm' }));
    expect(input('f-scale-bass').value).toBe('635');
  });

  it('undo restores the previous value (button and keyboard), redo re-applies', () => {
    render(<App />);
    openStep('Scale & frets');
    const frets = input('f-frets-count');
    expect(frets.value).toBe('22');
    fireEvent.change(frets, { target: { value: '24' } });
    fireEvent.blur(frets);
    expect(input('f-frets-count').value).toBe('24');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(input('f-frets-count').value).toBe('22');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(input('f-frets-count').value).toBe('24');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(input('f-frets-count').value).toBe('22');
  });

  it('treble scale longer than bass with fanned frets shows an error that links to the field', () => {
    render(<App />);
    openStep('Scale & frets');
    expect(input('f-scale-treble')).toBeNull();
    fireEvent.click(screen.getByLabelText('Fanned frets (multiscale)'));
    const treble = input('f-scale-treble');
    expect(treble).not.toBeNull();
    fireEvent.change(treble, { target: { value: '700' } });
    fireEvent.blur(treble);
    const issue = checkPanel().getByRole('button', { name: /Treble scale .* longer than the bass scale/ });
    expect(issue.className).toContain('lvl-error');
    // Printing is blocked while there are errors.
    expect((screen.getByRole('button', { name: 'Print templates (PDF)' }) as HTMLButtonElement).disabled).toBe(true);
    // Clicking the issue focuses the field (after collapsing the step).
    openStep('Instrument & strings');
    fireEvent.click(issue);
    expect(document.activeElement?.id).toBe('f-scale-treble');
  });

  it('schema errors are friendly and the preview keeps the last valid design', () => {
    render(<App />);
    openStep('Scale & frets');
    const frets = input('f-frets-count');
    fireEvent.change(frets, { target: { value: '5' } });
    expect(checkPanel().getByRole('button', { name: /Number of frets must be at least 12/ })).toBeTruthy();
    expect(screen.getByText(/Showing the last valid design/)).toBeTruthy();
    expect(dim('Frets')).toBe('22');
  });

  it('exporter failures show a friendly message instead of crashing', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'SVG' }));
    // Either the exporter works (download message) or it is still a stub (friendly message).
    expect(document.querySelector('.export-status')?.textContent).toMatch(/Downloaded|isn’t available|failed/);
  });

  it('fanned frets toggle reveals treble scale and perpendicular fret; turning off makes them equal', () => {
    render(<App />);
    openStep('Scale & frets');
    const toggle = screen.getByLabelText('Fanned frets (multiscale)');
    fireEvent.click(toggle);
    expect(input('f-frets-perpendicularFret').value).toBe('8');
    expect(Number(input('f-scale-treble').value)).toBeLessThan(Number(input('f-scale-bass').value));
    fireEvent.click(toggle);
    expect(input('f-scale-treble')).toBeNull();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.scale.treble).toBe(saved.scale.bass);
  });

  it('gauges editor: string count change applies a common set, and gauges are in thousandths', () => {
    render(<App />);
    expect(input('f-strings-gauges-0').value).toBe('10');
    fireEvent.change(screen.getByLabelText('Number of strings'), { target: { value: '7' } });
    expect(document.querySelectorAll('.gauges input')).toHaveLength(7);
    expect(input('f-strings-gauges-6').value).toBe('56');
    fireEvent.change(input('f-strings-gauges-0'), { target: { value: '9' } });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).strings.gauges[0]).toBeCloseTo(inToMm(0.009), 9);
  });

  it('restores an autosaved design and ignores a corrupt one', () => {
    const saved = { ...DEFAULT_SPEC, frets: { ...DEFAULT_SPEC.frets, count: 21 } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    expect(dim('Frets')).toBe('21');
    cleanup();
    localStorage.setItem(STORAGE_KEY, '{not json');
    render(<App />);
    expect(dim('Frets')).toBe(String(DEFAULT_SPEC.frets.count));
  });

  it('opens a project file and reports invalid ones', async () => {
    render(<App />);
    const file = (body: string) => new File([body], 'x.fretwright.json', { type: 'application/json' });
    const picker = screen.getByTestId('open-file');
    const good = { app: 'fretwright', spec: PRESETS.find((p) => p.id === 'bass-4-34')!.spec };
    await act(async () => {
      fireEvent.change(picker, { target: { files: [file(JSON.stringify(good))] } });
    });
    await vi.waitFor(() => expect(dim('Scale')).toContain('863.6 mm'));
    await act(async () => {
      fireEvent.change(picker, { target: { files: [file(JSON.stringify({ version: 1, scale: 'long' }))] } });
    });
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/couldn’t be opened/));
  });
});

describe('specReducer', () => {
  it('coalesces rapid edits of one field into a single undo step', () => {
    let s = initState(DEFAULT_SPEC);
    s = specReducer(s, { type: 'edit', writes: [['frets.count', 2]], key: 'frets.count', at: 1000 });
    s = specReducer(s, { type: 'edit', writes: [['frets.count', 24]], key: 'frets.count', at: 1200 });
    expect(s.past).toHaveLength(1);
    s = specReducer(s, { type: 'undo' });
    expect(s.present.frets.count).toBe(22);
    expect(s.lastValid.frets.count).toBe(22);
  });

  it('keeps lastValid at the last schema-valid spec', () => {
    let s = initState(DEFAULT_SPEC);
    s = specReducer(s, { type: 'edit', writes: [['frets.count', 3]] });
    expect(s.present.frets.count).toBe(3);
    expect(s.lastValid).toBe(DEFAULT_SPEC);
  });
});
