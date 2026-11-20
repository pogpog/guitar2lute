import { describe, it, expect } from 'vitest';
import { expandTabs, normalizeTabText } from '../../../src/core/parse/normalize';

describe('normalizeTabText', () => {
  it('normalises line endings', () => {
    expect(normalizeTabText('a\r\nb\rc')).toBe('a\nb\nc');
  });
  it('expands tab characters to 8-column stops', () => {
    expect(expandTabs('ab\tc')).toBe('ab      c');
    expect(expandTabs('\tx')).toBe('        x');
  });
  it('replaces unicode dashes and non-breaking spaces', () => {
    expect(normalizeTabText('e|–—‐−‒| ')).toBe('e|-----| ');
  });
  it('rewrites repeat marks while keeping column widths', () => {
    expect(normalizeTabText('e|:--0--:|')).toBe('e|---0---|');
    expect(normalizeTabText('B|*-1-*|')).toBe('B|--1--|');
    expect(normalizeTabText('‖--0--‖')).toBe('|--0--|');
  });
});
