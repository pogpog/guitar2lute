import { describe, it, expect } from 'vitest';
import { parseHeaders } from '../../../src/core/parse/headers';

describe('parseHeaders', () => {
  it('reads capo in common forms', () => {
    expect(parseHeaders('Capo 2').capo).toBe(2);
    expect(parseHeaders('capo: 3rd fret').capo).toBe(3);
    expect(parseHeaders('Capo on 5th fret').capo).toBe(5);
    expect(parseHeaders('No capo').capo).toBe(0);
    expect(parseHeaders('nothing here').capo).toBeNull();
  });
  it('reads tuning by name or note list', () => {
    expect(parseHeaders('Tuning: Drop D').tuning!.id).toBe('guitar-drop-d');
    expect(parseHeaders('tuning - DADGAD').tuning!.id).toBe('guitar-dadgad');
    expect(parseHeaders('Tuning: D A D G B E').tuning!.id).toBe('guitar-drop-d');
    expect(parseHeaders('Tuning: Eb Ab Db Gb Bb Eb').tuning!.id).toBe('guitar-half-down');
    expect(parseHeaders('no tuning line').tuning).toBeNull();
  });
});
