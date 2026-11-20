import { describe, it, expect } from 'vitest';
import { MemoryStorage, PieceStore, migrate, exportPieces, importPieces } from '../../src/core/storage';
import { newPiece } from '../../src/core/piece';

describe('PieceStore', () => {
  it('saves, lists, loads and removes pieces', () => {
    const store = new PieceStore(new MemoryStorage());
    const a = newPiece('A');
    const b = newPiece('B');
    store.save(a);
    store.save(b);
    expect(store.list().map((m) => m.title)).toEqual(['B', 'A']);
    expect(store.load(a.id)).toEqual(a);
    store.save(a);
    expect(store.list().map((m) => m.title)).toEqual(['A', 'B']);
    store.remove(a.id);
    expect(store.list().map((m) => m.title)).toEqual(['B']);
    expect(store.load(a.id)).toBeNull();
  });
  it('survives a corrupt index', () => {
    const s = new MemoryStorage();
    s.setItem('g2l:index', '{not json');
    expect(new PieceStore(s).list()).toEqual([]);
  });
  it('coerces index entries of the wrong shape and drops duplicates', () => {
    const s = new MemoryStorage();
    s.setItem(
      'g2l:index',
      JSON.stringify([{ id: 'a', title: { x: 1 } }, { id: 'a', title: 'dup' }, { title: 'no id' }, { id: 'b', title: 'B', updatedAt: 5 }]),
    );
    expect(new PieceStore(s).list()).toEqual([
      { id: 'a', title: '', updatedAt: '' },
      { id: 'b', title: 'B', updatedAt: '' },
    ]);
  });
  it('finds saved pieces the index has lost, and keeps them on the next save', () => {
    const s = new MemoryStorage();
    const store = new PieceStore(s);
    store.save(newPiece('A'));
    store.save(newPiece('B'));
    s.setItem('g2l:index', '{not json');
    expect(store.list().map((m) => m.title).sort()).toEqual(['A', 'B']);
    store.save(newPiece('C'));
    expect(store.list().map((m) => m.title).sort()).toEqual(['A', 'B', 'C']);
  });
  it('throws on a corrupt piece so callers can skip it', () => {
    const s = new MemoryStorage();
    s.setItem('g2l:piece:x', 'garbage');
    expect(() => new PieceStore(s).load('x')).toThrow();
  });
});

describe('migrate', () => {
  it('accepts schema 1', () => {
    const p = newPiece();
    expect(migrate(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it('rejects newer, missing and invalid data', () => {
    expect(() => migrate({ ...newPiece(), schemaVersion: 2 })).toThrow(/newer version/);
    expect(() => migrate({ id: 'x' })).toThrow(/schemaVersion/);
    expect(() => migrate({ schemaVersion: 1, id: 'x' })).toThrow(/Invalid piece/);
    expect(() => migrate(null)).toThrow();
  });
  it('rejects data that parses but has the wrong shape', () => {
    const ok = () => JSON.parse(JSON.stringify(newPiece())) as Record<string, any>;
    const broken = [
      (p: any) => { p.guitar = {}; },
      (p: any) => { p.guitar.tab = 'nope'; },
      (p: any) => { p.guitar.tab = [{ kind: 'col', col: { x: 0, notes: [{ string: 'a', fret: 1 }] } }]; },
      (p: any) => { p.guitar.chords = [{ name: '', frets: [0, 0], baseFret: 1 }]; },
      (p: any) => { p.lute.tuning.courses = []; },
      (p: any) => { p.lute.maxFret = '8'; },
      (p: any) => { p.lute.notation = 'german'; },
      (p: any) => { p.overrides.tabPins = { 0: { 0: { course: 1 } } }; },
    ];
    for (const breakIt of broken) {
      const p = ok();
      breakIt(p);
      expect(() => migrate(p)).toThrow(/Invalid piece \(/);
    }
  });
  it('rejects values outside the ranges the app can produce', () => {
    const ok = () => JSON.parse(JSON.stringify(newPiece())) as Record<string, any>;
    const col = (string: number, fret: number) => [{ kind: 'col', col: { x: 0, notes: [{ string, fret }] } }];
    const broken: [string, (p: any) => void][] = [
      ['guitar.tab', (p) => { p.guitar.tab = col(9, 1); }],
      ['guitar.tab', (p) => { p.guitar.tab = col(0, 25); }],
      ['guitar.tuning', (p) => { p.guitar.tuning.courses = [64, 59]; }],
      ['guitar.capo', (p) => { p.guitar.capo = 13; }],
      ['guitar.chords', (p) => { p.guitar.chords = [{ name: '', frets: [25, 0, 0, 0, 0, 0], baseFret: 1 }]; }],
      ['guitar.chords', (p) => { p.guitar.chords = [{ name: '', frets: [0, 0, 0, 0, 0, 0], baseFret: 0 }]; }],
      ['lute.tuning', (p) => { p.lute.tuning.frettedCourses = 99; }],
      ['lute.tuning', (p) => { p.lute.tuning.frettedCourses = 0; }],
      ['lute.tuning', (p) => { p.lute.tuning.courses = [67, 200]; }],
      ['lute.transpose', (p) => { p.lute.transpose = 13; }],
      ['lute.maxFret', (p) => { p.lute.maxFret = 20; }],
      ['lute.maxFret', (p) => { p.lute.maxFret = 3; }],
      ['lute.maxStretch', (p) => { p.lute.maxStretch = 7; }],
    ];
    expect(() => migrate(ok())).not.toThrow();
    for (const [field, breakIt] of broken) {
      const p = ok();
      breakIt(p);
      expect(() => migrate(p), field).toThrow(`Invalid piece (${field})`);
    }
  });
});

describe('JSON import/export', () => {
  it('round-trips a bundle and accepts a single piece', () => {
    const a = newPiece('A');
    const b = newPiece('B');
    expect(importPieces(exportPieces([a, b]))).toEqual([a, b]);
    expect(importPieces(JSON.stringify(a))).toEqual([a]);
  });
  it('never overwrites a saved piece when importing', () => {
    const s = new MemoryStorage();
    const store = new PieceStore(s);
    const mine = newPiece('Greensleeves');
    const backup = JSON.parse(JSON.stringify(mine)) as typeof mine; // exported earlier
    mine.guitar.capo = 2; // edited since
    store.save(mine);
    const fresh = newPiece('New one');
    const saved = store.addImported([backup, fresh, backup]);
    // the edited piece is untouched; the older copy arrives under a new id
    expect(store.load(mine.id)).toEqual(mine);
    expect(saved[0].id).not.toBe(mine.id);
    expect(saved[0].title).toBe('Greensleeves (imported)');
    expect(store.load(saved[0].id)?.guitar.capo).toBe(0);
    // a piece that is new here keeps its id; the same piece twice in one file is not doubled
    expect(saved[1]).toEqual(fresh);
    expect(saved).toHaveLength(2);
    // importing an identical copy changes nothing
    expect(store.addImported([mine])).toEqual([mine]);
    expect(store.list()).toHaveLength(3);
  });
  it('never overwrites a saved piece it cannot read', () => {
    const s = new MemoryStorage();
    const store = new PieceStore(s);
    const p = newPiece('From the future');
    s.setItem(`g2l:piece:${p.id}`, JSON.stringify({ ...p, schemaVersion: 99 }));
    const [saved] = store.addImported([p]);
    expect(saved.id).not.toBe(p.id);
    expect(JSON.parse(s.getItem(`g2l:piece:${p.id}`)!).schemaVersion).toBe(99);
  });
  it('rejects invalid JSON and newer bundles', () => {
    expect(() => importPieces('nope')).toThrow(/Not valid JSON/);
    expect(() => importPieces(JSON.stringify({ schemaVersion: 9, pieces: [] }))).toThrow(/newer version/);
  });
});
