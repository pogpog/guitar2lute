import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { LuteChordBox } from '../../src/ui/LuteChordBox';
import { LuteTabView } from '../../src/ui/LuteTabView';
import { convertPiece } from '../../src/core/convert/convert';
import { newPiece } from '../../src/core/piece';
import { parseAsciiTab } from '../../src/core/parse/asciiTab';
import { findPreset } from '../../src/core/tunings';
import { AM_ARPEGGIO } from '../core/parse/fixtures';
import type { LuteNote, LuteResult, Notation, Tuning } from '../../src/core/model';

const six = findPreset('lute-6-g')!;

function eChordAtPlus3() {
  const p = newPiece();
  p.guitar.chords = [{ name: '', frets: [0, 0, 1, 2, 2, 0], baseFret: 1 }];
  p.lute.transpose = 3;
  return convertPiece(p);
}

describe('LuteChordBox', () => {
  it('draws stopped notes with French letters', () => {
    const r = eChordAtPlus3();
    const out = html(<LuteChordBox chord={r.chords[0]} tuning={six} notation="french" flats={r.flats} onCycle={noop} onVoicing={noop} onPlay={noop} />);
    expect(out).toContain('data-testid="lute-chordbox"');
    expect(out).toContain('>G<');
    expect(out.match(/>c<\/text>/g)).toHaveLength(3);
    expect(out).toContain('1/');
  });
  it('uses numbers in Italian notation', () => {
    const r = eChordAtPlus3();
    const out = html(<LuteChordBox chord={r.chords[0]} tuning={six} notation="italian" flats={r.flats} onCycle={noop} onVoicing={noop} onPlay={noop} />);
    expect(out.match(/>2<\/text>/g)).toHaveLength(3);
  });
  it('writes diapasons under the diagram', () => {
    const eight = findPreset('lute-8-g')!;
    const chord = { name: 'D', chosen: 0, voicings: [{ notes: [{ placement: { course: 7, fret: 0 }, pitch: 38, shifted: 0, pinned: false, srcNoteIndex: 0 }], dropped: [], cost: 0 }] };
    const out = html(<LuteChordBox chord={chord} tuning={eight} notation="french" flats onCycle={noop} onVoicing={noop} onPlay={noop} />);
    expect(out).toContain('>/a</text>');
  });
  it('keeps the voicing buttons usable on a pinned chord', () => {
    const r = eChordAtPlus3();
    const one = { ...r.chords[0], chosen: 0, voicings: [{ ...r.chords[0].voicings[0], notes: r.chords[0].voicings[0].notes.map((n) => ({ ...n, pinned: true })) }] };
    const out = html(<LuteChordBox chord={one} tuning={six} notation="french" flats={false} onCycle={noop} onVoicing={noop} onPlay={noop} />);
    expect(out).not.toMatch(/aria-label="(Previous|Next) voicing" disabled/);
    const auto = { ...r.chords[0], chosen: 0, voicings: [r.chords[0].voicings[0]] };
    expect(html(<LuteChordBox chord={auto} tuning={six} notation="french" flats={false} onCycle={noop} onVoicing={noop} onPlay={noop} />)).toMatch(/aria-label="Next voicing" disabled/);
  });
  it('renders empty states', () => {
    const empty = { name: '', chosen: 0, voicings: [{ notes: [], dropped: [], cost: 0 }] };
    expect(() => html(<LuteChordBox chord={empty} tuning={six} notation="french" flats onCycle={noop} onVoicing={noop} onPlay={noop} />)).not.toThrow();
    const none = { name: '', chosen: 0, voicings: [] };
    expect(html(<LuteChordBox chord={none} tuning={six} notation="french" flats onCycle={noop} onVoicing={noop} onPlay={noop} />)).toContain('No playable voicing');
  });
});

describe('LuteTabView', () => {
  it('renders glyphs with ids and highlights the playing column', () => {
    const p = newPiece();
    p.guitar.tab = parseAsciiTab(AM_ARPEGGIO).events;
    p.lute.transpose = 3;
    const out = html(<LuteTabView result={convertPiece(p)} tuning={six} notation="french" playing={0} onCycle={noop} />);
    expect(out).toContain('id="lute-tab-svg"');
    expect(out).toContain('data-testid="glyph-0-0"');
    expect(out).toContain('class="playing"');
  });
  it('shows an empty state', () => {
    expect(html(<LuteTabView result={convertPiece(newPiece())} tuning={six} notation="french" playing={null} onCycle={noop} />)).toContain('No tab yet');
  });
});

/** One note on every course (fret 2 on fretted courses, open on diapasons), as a chord and as a tab run. */
function everyCourse(t: Tuning): LuteResult {
  const notes: LuteNote[] = t.courses.map((open, course) => {
    const fret = course < t.frettedCourses ? 2 : 0;
    return { placement: { course, fret }, pitch: open + fret, shifted: 0, pinned: false, srcNoteIndex: course };
  });
  return {
    chords: [{ name: 'G', chosen: 0, voicings: [{ notes, dropped: [], cost: 0 }] }],
    tab: [...notes.map((n, i) => ({ kind: 'col' as const, index: i, x: i * 3, notes: [n], dropped: [] })), { kind: 'bar' }, { kind: 'break' }],
    warnings: [],
    totalCost: 0,
    stats: { shifted: 0, dropped: 0 },
    flats: false,
  };
}

describe('SVG snapshots', () => {
  const presets = ['lute-6-g', 'lute-7-g', 'lute-8-g', 'lute-10-g', 'lute-13-baroque-dm'];
  const notations: Notation[] = ['french', 'italian', 'modern'];
  for (const notation of notations) {
    for (const id of presets) {
      it(`${notation}, ${id}`, () => {
        const t = findPreset(id)!;
        const r = everyCourse(t);
        expect(html(<LuteChordBox chord={r.chords[0]} tuning={t} notation={notation} flats={false} onCycle={noop} onVoicing={noop} onPlay={noop} />)).toMatchSnapshot();
        expect(html(<LuteTabView result={r} tuning={t} notation={notation} playing={null} onCycle={noop} />)).toMatchSnapshot();
      });
    }
  }
});
