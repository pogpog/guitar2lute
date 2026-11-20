import { describe, it, expect } from 'vitest';
import { initialPiece, safeLoad } from '../../src/ui/state';
import { MemoryStorage, PieceStore } from '../../src/core/storage';
import { newPiece } from '../../src/core/piece';
import { combineSvgs, parseIntInRange, slug } from '../../src/ui/util';

describe('state helpers', () => {
  it('starts with a new piece when storage is empty', () => {
    expect(initialPiece(new PieceStore(new MemoryStorage())).title).toBe('Untitled');
  });
  it('skips corrupt pieces when choosing the initial piece', () => {
    const s = new MemoryStorage();
    const store = new PieceStore(s);
    const good = newPiece('Good');
    store.save(good);
    s.setItem('g2l:index', JSON.stringify([{ id: 'bad', title: 'Bad', updatedAt: '' }, { id: good.id, title: 'Good', updatedAt: '' }]));
    s.setItem('g2l:piece:bad', 'garbage');
    expect(safeLoad(store, 'bad')).toBeNull();
    expect(initialPiece(store).id).toBe(good.id);
  });
  it('skips a stored piece that is valid JSON but the wrong shape', () => {
    const s = new MemoryStorage();
    const store = new PieceStore(s);
    s.setItem('g2l:index', JSON.stringify([{ id: 'bad', title: 'Bad', updatedAt: '' }]));
    s.setItem('g2l:piece:bad', JSON.stringify({ ...newPiece(), id: 'bad', guitar: {} }));
    expect(safeLoad(store, 'bad')).toBeNull();
    expect(initialPiece(store).title).toBe('Untitled');
  });
});

describe('util', () => {
  it('accepts only complete in-range integers while the user is typing', () => {
    expect(parseIntInRange('', -12, 12)).toBeNull();
    expect(parseIntInRange('-', -12, 12)).toBeNull();
    expect(parseIntInRange('-3', -12, 12)).toBe(-3);
    expect(parseIntInRange('1', 4, 12)).toBeNull(); // on the way to 10
    expect(parseIntInRange('10', 4, 12)).toBe(10);
    expect(parseIntInRange('40', 4, 12)).toBeNull();
    expect(parseIntInRange('2.5', 0, 12)).toBeNull();
  });
  it('labels each combined chord box with its name', () => {
    const fake = (w: number) => ({ getAttribute: (a: string) => (a === 'width' ? String(w) : '50'), innerHTML: '<rect/>' }) as unknown as SVGSVGElement;
    const out = combineSvgs([fake(40), fake(40)], 12, ['G', 'A<b>&']);
    expect(out).toContain('>G</text>');
    expect(out).toContain('>A&lt;b&gt;&amp;</text>');
    expect(out).toContain('translate(52,');
    expect(combineSvgs([fake(40)])).not.toContain('<text');
  });
  it('slugs titles for filenames', () => {
    expect(slug('  Greensleeves (arr.) ')).toBe('greensleeves-arr');
    expect(slug('')).toBe('piece');
  });
});
