import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { ImportDialog } from '../../src/ui/ImportDialog';
import { GuitarView } from '../../src/ui/GuitarView';
import { newPiece } from '../../src/core/piece';
import { addChord } from '../../src/core/edit';
import { AM_ARPEGGIO } from '../core/parse/fixtures';

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
