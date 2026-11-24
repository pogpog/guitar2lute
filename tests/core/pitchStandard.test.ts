import { describe, it, expect } from 'vitest';
import { PITCH_PRESETS, isPresetA4, loadA4, parseA4, pitchKey, saveA4 } from '../../src/core/pitchStandard';
import { MemoryStorage, type StorageLike } from '../../src/core/storage';

describe('parseA4', () => {
  it('accepts whole and one-decimal values in range', () => {
    expect(parseA4('415')).toBe(415);
    expect(parseA4(' 430.5 ')).toBe(430.5);
    expect(parseA4('415,3')).toBe(415.3);
    expect(parseA4('380')).toBe(380);
    expect(parseA4('480')).toBe(480);
  });
  it('rejects out of range, extra decimals and non-numbers', () => {
    for (const t of ['379.9', '480.1', '415.25', '', 'abc', '4e2', '-440', '440Hz']) expect(parseA4(t), t).toBeNull();
  });
});

describe('loadA4 / saveA4', () => {
  it('defaults to 440 and keeps the two sides apart', () => {
    const s = new MemoryStorage();
    expect(loadA4(s, 'lute')).toBe(440);
    saveA4(s, 'lute', 415);
    expect(loadA4(s, 'lute')).toBe(415);
    expect(loadA4(s, 'guitar')).toBe(440);
    expect(s.getItem('g2l:pitch:lute')).toBe('415');
  });
  it('falls back to 440 for a corrupt stored value', () => {
    const s = new MemoryStorage();
    for (const v of ['abc', '1000', '{"a":1}', '415.25']) {
      s.setItem(pitchKey('guitar'), v);
      expect(loadA4(s, 'guitar'), v).toBe(440);
    }
  });
  it('survives storage that throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    } as unknown as StorageLike;
    expect(loadA4(bad, 'lute')).toBe(440);
    expect(() => saveA4(bad, 'lute', 415)).not.toThrow();
  });
});

it('knows the presets', () => {
  expect(PITCH_PRESETS).toEqual([440, 415, 392]);
  expect(isPresetA4(415)).toBe(true);
  expect(isPresetA4(430)).toBe(false);
});
