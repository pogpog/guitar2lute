import { describe, it, expect } from 'vitest';
import { splitSystems, tuningLabels, renderAsciiSystem } from '../../src/core/asciiRender';
import { parseAsciiTab } from '../../src/core/parse/asciiTab';
import { STANDARD_GUITAR } from '../../src/core/tunings';
import type { TabEvent } from '../../src/core/model';
import { AM_ARPEGGIO, TWO_DIGIT, TWO_BLOCKS_NO_GAP } from './parse/fixtures';

const cols = (events: TabEvent[]) => events.flatMap((e) => (e.kind === 'col' ? [e.col.notes] : []));

describe('asciiRender', () => {
  it('labels standard tuning', () => {
    expect(tuningLabels(STANDARD_GUITAR)).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
  });
  it('splits systems at breaks', () => {
    expect(splitSystems(parseAsciiTab(TWO_BLOCKS_NO_GAP).events)).toHaveLength(2);
    expect(splitSystems([])).toEqual([]);
  });
  it('renders equal-length rows', () => {
    const rows = renderAsciiSystem(splitSystems(parseAsciiTab(AM_ARPEGGIO).events)[0], tuningLabels(STANDARD_GUITAR));
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    expect(rows[0].startsWith('e|')).toBe(true);
    expect(rows[0].endsWith('|')).toBe(true);
  });
  for (const [name, fixture] of [['arpeggio', AM_ARPEGGIO], ['two-digit', TWO_DIGIT]] as const) {
    it(`round-trips ${name} through the parser`, () => {
      const first = parseAsciiTab(fixture);
      const text = renderAsciiSystem(splitSystems(first.events)[0], tuningLabels(STANDARD_GUITAR)).join('\n');
      expect(cols(parseAsciiTab(text).events)).toEqual(cols(first.events));
    });
  }
});
