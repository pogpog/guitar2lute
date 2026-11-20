import { describe, it, expect } from 'vitest';
import { initialPiece, safeLoad } from '../../src/ui/state';
import { MemoryStorage, PieceStore } from '../../src/core/storage';
import { newPiece } from '../../src/core/piece';
import { clampInt, slug } from '../../src/ui/util';

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
  it('clamps integers from input strings', () => {
    expect(clampInt('5', 0, 12)).toBe(5);
    expect(clampInt('99', 0, 12)).toBe(12);
    expect(clampInt('-3', 0, 12)).toBe(0);
    expect(clampInt('abc', 2, 6)).toBe(2);
  });
  it('slugs titles for filenames', () => {
    expect(slug('  Greensleeves (arr.) ')).toBe('greensleeves-arr');
    expect(slug('')).toBe('piece');
  });
});
