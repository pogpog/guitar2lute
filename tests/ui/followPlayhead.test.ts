import { describe, expect, it } from 'vitest';
import { followScroll } from '../../src/ui/followPlayhead';

// view: scrollLeft 0, 300 px wide; positions are in the scrolled content
describe('followScroll', () => {
  it('leaves the scroll alone while the note is comfortably in view', () => {
    expect(followScroll({ left: 100, right: 110 }, { scrollLeft: 0, width: 300 })).toBeNull();
  });
  it('brings a note near or past the right edge to a quarter of the way in', () => {
    expect(followScroll({ left: 280, right: 290 }, { scrollLeft: 0, width: 300 })).toBe(280 - 75);
    expect(followScroll({ left: 900, right: 910 }, { scrollLeft: 0, width: 300 })).toBe(900 - 75);
  });
  it('brings a note left of the view back in', () => {
    expect(followScroll({ left: 20, right: 30 }, { scrollLeft: 500, width: 300 })).toBe(0);
    expect(followScroll({ left: 400, right: 410 }, { scrollLeft: 500, width: 300 })).toBe(400 - 75);
  });
});
