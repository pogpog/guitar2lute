import { describe, it, expect } from 'vitest';
import * as E from '../../src/core/edit';
import { newPiece } from '../../src/core/piece';
import { findPreset } from '../../src/core/tunings';
import type { ChordShape } from '../../src/core/model';

const shape = (name: string): ChordShape => ({ name, frets: [0, null, null, null, null, null], baseFret: 1 });
const P = { course: 0, fret: 0 };

describe('chord shape edits', () => {
  it('toggles a fret on and off', () => {
    const s = E.toggleFret(E.emptyChord(), 1, 3);
    expect(s.frets[1]).toBe(3);
    expect(E.toggleFret(s, 1, 3).frets[1]).toBeNull();
    expect(E.toggleFret(s, 1, 5).frets[1]).toBe(5);
  });
  it('cycles the open/muted marker', () => {
    let s = E.emptyChord();
    s = E.cycleOpen(s, 0);
    expect(s.frets[0]).toBe(0);
    s = E.cycleOpen(s, 0);
    expect(s.frets[0]).toBe('x');
    s = E.cycleOpen(s, 0);
    expect(s.frets[0]).toBeNull();
    expect(E.cycleOpen(E.toggleFret(s, 0, 3), 0).frets[0]).toBe(0);
  });
  it('clamps the base fret', () => {
    expect(E.shiftBaseFret(E.emptyChord(), -1).baseFret).toBe(1);
    expect(E.shiftBaseFret({ ...E.emptyChord(), baseFret: 15 }, 1).baseFret).toBe(15);
    expect(E.shiftBaseFret(E.emptyChord(), 2).baseFret).toBe(3);
  });
  it('does not mutate its input', () => {
    const s = E.emptyChord();
    E.toggleFret(s, 0, 1);
    expect(s.frets[0]).toBeNull();
  });
});

describe('piece edits', () => {
  it('adds chords with one slot per guitar string', () => {
    const p = E.addChord(newPiece());
    expect(p.guitar.chords).toHaveLength(1);
    expect(p.guitar.chords[0].frets).toEqual([null, null, null, null, null, null]);
  });
  it('removes a chord and reindexes overrides', () => {
    let p = newPiece();
    p.guitar.chords = [shape('A'), shape('B'), shape('C')];
    p.overrides.chordVoicing = { 0: 1, 2: 2 };
    p.overrides.chordPins = { 2: { 0: P } };
    p = E.removeChord(p, 1);
    expect(p.guitar.chords.map((c) => c.name)).toEqual(['A', 'C']);
    expect(p.overrides.chordVoicing).toEqual({ 0: 1, 1: 2 });
    expect(p.overrides.chordPins).toEqual({ 1: { 0: P } });
  });
  it('moves a chord together with its overrides', () => {
    let p = newPiece();
    p.guitar.chords = [shape('A'), shape('B')];
    p.overrides.chordVoicing = { 0: 2 };
    p = E.moveChord(p, 0, 1);
    expect(p.guitar.chords.map((c) => c.name)).toEqual(['B', 'A']);
    expect(p.overrides.chordVoicing).toEqual({ 1: 2 });
    expect(E.moveChord(p, 0, -1)).toBe(p);
  });
  it('keeps overrides on rename but clears them when frets change', () => {
    let p = newPiece();
    p.guitar.chords = [shape('A')];
    p.overrides.chordVoicing = { 0: 1 };
    p = E.updateChord(p, 0, { ...p.guitar.chords[0], name: 'Am' });
    expect(p.overrides.chordVoicing).toEqual({ 0: 1 });
    p = E.updateChord(p, 0, E.toggleFret(p.guitar.chords[0], 1, 1));
    expect(p.overrides.chordVoicing).toEqual({});
  });
  it('applies an import and clears tab pins', () => {
    const p = newPiece();
    p.overrides.tabPins = { 0: { 0: P } };
    const q = E.applyImport(p, { events: [{ kind: 'break' }], warnings: [], tuning: findPreset('guitar-drop-d')!, capo: 2 }, 'text');
    expect(q.guitar.tab).toEqual([{ kind: 'break' }]);
    expect(q.guitar.tuning.id).toBe('guitar-drop-d');
    expect(q.guitar.capo).toBe(2);
    expect(q.guitar.sourceText).toBe('text');
    expect(q.overrides.tabPins).toEqual({});
    const r = E.applyImport(q, { events: [], warnings: [], tuning: null, capo: null }, '');
    expect(r.guitar.tuning.id).toBe('guitar-drop-d');
    expect(r.guitar.capo).toBe(2);
  });
  it('sets pins, voicings and clears overrides', () => {
    let p = E.setTabPin(newPiece(), 3, 1, { course: 2, fret: 1 });
    expect(p.overrides.tabPins).toEqual({ 3: { 1: { course: 2, fret: 1 } } });
    p = E.setChordPin(p, 0, 0, P);
    expect(p.overrides.chordPins).toEqual({ 0: { 0: P } });
    p = E.setChordVoicing(p, 0, 2);
    expect(p.overrides.chordVoicing).toEqual({ 0: 2 });
    expect(p.overrides.chordPins).toEqual({});
    expect(E.clearOverrides(p).overrides).toEqual({ chordVoicing: {}, chordPins: {}, tabPins: {} });
  });
  it('updates lute settings, guitar tuning, capo and title', () => {
    const p = newPiece();
    expect(E.setLuteSettings(p, { transpose: 3 }).lute.transpose).toBe(3);
    expect(E.setGuitarTuning(p, findPreset('guitar-dadgad')!).guitar.tuning.id).toBe('guitar-dadgad');
    expect(E.setCapo(p, 4).guitar.capo).toBe(4);
    expect(E.setTitle(p, 'Greensleeves').title).toBe('Greensleeves');
  });
});

describe('whole-shape pins', () => {
  it('replaces a column or chord pin set and clears the chord voicing index', () => {
    let p = E.setTabPin(newPiece(), 0, 3, { course: 0, fret: 1 });
    p = E.pinTabColumn(p, 0, { 0: { course: 1, fret: 0 }, 1: { course: 2, fret: 2 } });
    expect(p.overrides.tabPins).toEqual({ 0: { 0: { course: 1, fret: 0 }, 1: { course: 2, fret: 2 } } });
    p = E.setChordVoicing(p, 1, 2);
    p = E.pinChord(p, 1, { 0: { course: 0, fret: 0 } });
    expect(p.overrides.chordPins).toEqual({ 1: { 0: { course: 0, fret: 0 } } });
    expect(p.overrides.chordVoicing).toEqual({});
  });
});

describe('stale pin cleanup', () => {
  const at = (course: number, fret: number) => ({ course, fret });
  const pinned = () => {
    let p = newPiece();
    p = E.pinTabColumn(p, 2, { 0: at(1, 2), 1: at(2, 0) });
    p = E.pinTabColumn(p, 5, { 0: at(0, 3) });
    p = E.pinChord(p, 1, { 0: at(3, 2) });
    return p;
  };
  it('removes the pins of the column or chord a warning points at', () => {
    const p = pinned();
    expect(E.removePinsFor(p, { kind: 'pin', message: '', tabColumn: 2 }).overrides.tabPins).toEqual({ 5: { 0: at(0, 3) } });
    expect(E.removePinsFor(p, { kind: 'pin', message: '', chord: 1 }).overrides.chordPins).toEqual({});
    expect(p.overrides.tabPins[2]).toBeDefined(); // not mutated
  });
  it('removes every pin the warnings report as stale, and nothing else', () => {
    const out = E.removeStalePins(pinned(), [
      { kind: 'pin', message: '', tabColumn: 2 },
      { kind: 'drop', message: '', tabColumn: 5 },
      { kind: 'pin', message: '', chord: 1 },
    ]);
    expect(out.overrides.tabPins).toEqual({ 5: { 0: at(0, 3) } });
    expect(out.overrides.chordPins).toEqual({});
  });
});
