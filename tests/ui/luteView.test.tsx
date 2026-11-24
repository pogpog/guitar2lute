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
    const out = html(<LuteSettingsBar settings={newPiece().lute} hasOverrides={false} autoBusy onChange={noop} onEditTuning={noop} onAuto={noop} onClearOverrides={noop} a4={440} onA4={noop} onTune={noop} />);
    expect(out).toMatch(/data-testid="auto-transpose"[^>]*disabled=""/);
    expect(out).toContain('Working…');
  });
  it('shows presets, transpose shortcuts and notation choices', () => {
    const out = html(<LuteSettingsBar settings={newPiece().lute} hasOverrides={false} onChange={noop} onEditTuning={noop} onAuto={noop} onClearOverrides={noop} a4={440} onA4={noop} onTune={noop} />);
    expect(out).toContain('Renaissance 6-course in G');
    expect(out).toContain('Baroque 13-course D minor');
    expect(out).toContain('+3 guitar shapes');
    expect(out).toContain('French (letters)');
    expect(out).toContain('Italian (numbers)');
    expect(out).toContain('Modern (numbers)');
  });
  it('lists a custom tuning as an extra option', () => {
    const s = { ...newPiece().lute, tuning: addBassCourse(findPreset('lute-6-g')!) };
    expect(html(<LuteSettingsBar settings={s} hasOverrides onChange={noop} onEditTuning={noop} onAuto={noop} onClearOverrides={noop} a4={440} onA4={noop} onTune={noop} />)).toContain('>Custom<');
  });
});

describe('LuteSettingsBar pitch and tuning aid', () => {
  it('shows the lute pitch standard and a Tune… button', () => {
    const out = html(<LuteSettingsBar settings={newPiece().lute} hasOverrides={false} onChange={noop} onEditTuning={noop} onAuto={noop} onClearOverrides={noop} a4={415} onA4={noop} onTune={noop} />);
    expect(out).toContain('data-testid="lute-pitch"');
    expect(out).toMatch(/<option value="415" selected="">A = 415<\/option>/);
    expect(out).toContain('data-testid="open-tune"');
    expect(out).toContain('Tune…');
    expect(out.indexOf('Edit tuning…')).toBeLessThan(out.indexOf('lute-pitch'));
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
    const out = html(<LuteView piece={p} update={noop} result={convertPiece(p)} playing={null} onPlayChord={noop} a4={440} onA4={noop} tuner={{ play: noop, stop: noop }} />);
    expect(out).toContain('data-testid="lute-settings"');
    expect(out).toContain('data-testid="lute-chordbox"');
    expect(out).toContain('Lute tab');
    expect(out).toContain('data-testid="warnings"');
  });
});

describe('LuteView tuning line', () => {
  const text = (html: string, id: string) =>
    (new RegExp(`data-testid="${id}"[^>]*>(.*?)</p>`, 's').exec(html)?.[1] ?? '').replace(/<[^>]+>/g, '');
  it('spells out each course of the lute tuning', () => {
    const p = newPiece();
    const out = html(<LuteView piece={p} update={noop} result={convertPiece(p)} playing={null} onPlayChord={noop} a4={440} onA4={noop} tuner={{ play: noop, stop: noop }} />);
    expect(text(out, 'lute-tuning-line')).toBe('Lute tuning: 6 G2 · 5 C3 · 4 F3 · 3 A3 · 2 D4 · 1 G4');
  });
  it('lists open bass courses as diapasons', () => {
    const p = newPiece();
    p.lute.tuning = findPreset('lute-8-g')!;
    const out = html(<LuteView piece={p} update={noop} result={convertPiece(p)} playing={null} onPlayChord={noop} a4={440} onA4={noop} tuner={{ play: noop, stop: noop }} />);
    expect(text(out, 'lute-tuning-line')).toBe('Lute tuning: Diapasons: 8 D2 Fretted: 7 F2 · 6 G2 · 5 C3 · 4 F3 · 3 A3 · 2 D4 · 1 G4');
  });
});

describe('lute chord box play button', () => {
  it('is a labelled play button', () => {
    const p = newPiece();
    p.guitar.chords = [{ name: '', frets: [0, 0, 1, 2, 2, 0], baseFret: 1 }];
    const out = html(<LuteView piece={p} update={noop} result={convertPiece(p)} playing={null} onPlayChord={noop} a4={440} onA4={noop} tuner={{ play: noop, stop: noop }} />);
    expect(out).toMatch(/<button[^>]*class="play-chord"[^>]*>♪ Play<\/button>/);
  });
});
