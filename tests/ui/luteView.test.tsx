import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { LuteSettingsBar } from '../../src/ui/LuteSettingsBar';
import { TuningEditor } from '../../src/ui/TuningEditor';
import { LuteView } from '../../src/ui/LuteView';
import { newPiece } from '../../src/core/piece';
import { convertPiece } from '../../src/core/convert/convert';
import { addBassCourse, findPreset } from '../../src/core/tunings';

describe('LuteSettingsBar', () => {
  it('shows that Auto is working and blocks a second click', () => {
    const out = html(<LuteSettingsBar settings={newPiece().lute} hasOverrides={false} autoBusy onChange={noop} onEditTuning={noop} onAuto={noop} onClearOverrides={noop} />);
    expect(out).toMatch(/data-testid="auto-transpose"[^>]*disabled=""/);
    expect(out).toContain('Working…');
  });
  it('shows presets, transpose shortcuts and notation choices', () => {
    const out = html(<LuteSettingsBar settings={newPiece().lute} hasOverrides={false} onChange={noop} onEditTuning={noop} onAuto={noop} onClearOverrides={noop} />);
    expect(out).toContain('Renaissance 6-course in G');
    expect(out).toContain('Baroque 13-course D minor');
    expect(out).toContain('+3 guitar shapes');
    expect(out).toContain('French (letters)');
    expect(out).toContain('Italian (numbers)');
    expect(out).toContain('Modern (numbers)');
  });
  it('lists a custom tuning as an extra option', () => {
    const s = { ...newPiece().lute, tuning: addBassCourse(findPreset('lute-6-g')!) };
    expect(html(<LuteSettingsBar settings={s} hasOverrides onChange={noop} onEditTuning={noop} onAuto={noop} onClearOverrides={noop} />)).toContain('>Custom<');
  });
});

describe('TuningEditor', () => {
  it('shows one row per course and the fretted/open status', () => {
    const out = html(<TuningEditor tuning={findPreset('lute-8-g')!} onChange={noop} onClose={noop} />);
    expect(out.match(/<tr>/g)).toHaveLength(9);
    expect(out).toContain('open (diapason)');
    expect(out).toContain('+ Add bass course');
  });
});

describe('LuteView', () => {
  it('renders chord boxes, tab section and settings', () => {
    const p = newPiece();
    p.guitar.chords = [{ name: '', frets: [0, 0, 1, 2, 2, 0], baseFret: 1 }];
    const out = html(<LuteView piece={p} update={noop} result={convertPiece(p)} playing={null} onPlayChord={noop} />);
    expect(out).toContain('data-testid="lute-settings"');
    expect(out).toContain('data-testid="lute-chordbox"');
    expect(out).toContain('Lute tab');
    expect(out).toContain('data-testid="warnings"');
  });
});
