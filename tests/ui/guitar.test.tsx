import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { GuitarChordBox } from '../../src/ui/GuitarChordBox';
import { GuitarTabView } from '../../src/ui/GuitarTabView';
import { STANDARD_GUITAR } from '../../src/core/tunings';
import { parseAsciiTab } from '../../src/core/parse/asciiTab';
import type { ChordShape } from '../../src/core/model';
import { AM_ARPEGGIO } from '../core/parse/fixtures';

const box = (shape: ChordShape) => html(
  <GuitarChordBox shape={shape} tuning={STANDARD_GUITAR} capo={0} flats={false} onChange={noop} onPlay={noop} onRemove={noop} onMove={noop} />,
);

describe('GuitarChordBox', () => {
  it('shows dots, note names and the detected chord name', () => {
    const out = box({ name: '', frets: [0, 1, 2, 2, 0, 'x'], baseFret: 1 });
    expect(out).toContain('A E A C E');
    expect(out).toContain('placeholder="Am"');
    expect(out.match(/class="dot"/g)).toHaveLength(3);
    expect(out).toContain('data-testid="cell-1-1"');
    expect(out).toContain('data-testid="open-5"');
    expect(out).toContain('×');
  });
  it('shows the base fret number when not at the nut', () => {
    const out = box({ name: 'X', frets: [5, 5, null, null, null, null], baseFret: 5 });
    expect(out).toContain('class="base-fret"');
    expect(out).toContain('data-testid="cell-0-5"');
    expect(out.match(/class="dot"/g)).toHaveLength(2);
  });
});

describe('GuitarTabView', () => {
  it('shows an empty state', () => {
    expect(html(<GuitarTabView events={[]} tuning={STANDARD_GUITAR} />)).toContain('No tab yet');
  });
  it('renders systems as monospace ASCII', () => {
    const out = html(<GuitarTabView events={parseAsciiTab(AM_ARPEGGIO).events} tuning={STANDARD_GUITAR} />);
    expect(out).toContain('<pre class="ascii-tab">');
    expect(out).toContain('e|');
  });
  it('highlights the playing column', () => {
    const events = parseAsciiTab(AM_ARPEGGIO).events;
    const out = html(<GuitarTabView events={events} tuning={STANDARD_GUITAR} playing={1} />);
    // column 1 is the G-string 2: one highlight per string row
    expect(out.match(/<mark class="playing">/g)).toHaveLength(6);
    expect(out).toContain('<mark class="playing">2</mark>');
    expect(html(<GuitarTabView events={events} tuning={STANDARD_GUITAR} playing={null} />)).not.toContain('<mark');
  });
});
