import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { ImportDialog } from '../../src/ui/ImportDialog';
import { GuitarView } from '../../src/ui/GuitarView';
import { GuitarTuningEditor } from '../../src/ui/GuitarTuningEditor';
import { findPreset } from '../../src/core/tunings';
import { newPiece } from '../../src/core/piece';
import { addChord, applyImport } from '../../src/core/edit';
import { importTabText } from '../../src/core/parse/importText';
import { AM_ARPEGGIO, WITH_LYRICS_AND_COUNTS } from '../core/parse/fixtures';

describe('ImportDialog', () => {
  it('disables import when nothing parses', () => {
    const out = html(<ImportDialog initialText="" hasPins={false} onImport={noop} onClose={noop} />);
    expect(out).toContain('0 columns found');
    expect(out).toMatch(/data-testid="do-import"[^>]*disabled|disabled[^>]*data-testid="do-import"/);
  });
  it('previews parsed tab', () => {
    const out = html(<ImportDialog initialText={AM_ARPEGGIO} hasPins={false} onImport={noop} onClose={noop} />);
    expect(out).toContain('5 columns found');
    expect(out).toContain('tuning Standard (E A D G B E)');
    expect(out).toContain('data-testid="pdf-input"');
  });
});

describe('GuitarView', () => {
  it('still shows the last import warnings when the view is opened again', () => {
    const imp = importTabText(WITH_LYRICS_AND_COUNTS);
    expect(imp.warnings.length).toBeGreaterThan(0);
    const p = applyImport(newPiece(), imp, WITH_LYRICS_AND_COUNTS);
    // a fresh render is what the user gets after switching views or reloading
    const out = html(<GuitarView piece={p} update={noop} flats={false} onPlayChord={noop} />);
    expect(out).toContain('data-testid="warnings"');
    for (const w of imp.warnings) expect(out).toContain(w.message.replace(/&/g, '&amp;').replace(/"/g, '&quot;'));
  });
  it('shows tuning, capo, chord boxes and tab section', () => {
    const p = addChord(newPiece());
    const out = html(<GuitarView piece={p} update={noop} flats={false} onPlayChord={noop} />);
    expect(out).toContain('Guitar tuning');
    expect(out).toContain('Capo');
    expect(out).toContain('data-testid="guitar-chordbox"');
    expect(out).toContain('data-testid="add-chord"');
    expect(out).toContain('data-testid="open-import"');
    expect(out).toContain('No tab yet');
  });
});

describe('GuitarTuningEditor', () => {
  it('shows a note and octave for each of the six strings, high to low', () => {
    const out = html(<GuitarTuningEditor tuning={findPreset('guitar-drop-d')!} onChange={noop} onClose={noop} />);
    expect(out).toContain('data-testid="guitar-tuning-editor"');
    expect(out.match(/<tr>/g)).toHaveLength(7);
    expect(out).toContain('aria-label="String 1 note"');
    expect(out).toContain('aria-label="String 6 octave"');
    // string 6 is D2: note D (pitch class 2) and octave 2 selected
    expect(out).toMatch(/aria-label="String 6 note"[^>]*>(?:(?!<\/select>).)*<option value="2" selected=""/s);
    expect(out).toMatch(/aria-label="String 6 octave"[^>]*>(?:(?!<\/select>).)*<option value="2" selected=""/s);
  });
});

describe('GuitarView tuning', () => {
  it('offers to edit the guitar tuning', () => {
    const out = html(<GuitarView piece={newPiece()} update={noop} flats={false} onPlayChord={noop} />);
    expect(out).toContain('data-testid="edit-guitar-tuning"');
  });
});
