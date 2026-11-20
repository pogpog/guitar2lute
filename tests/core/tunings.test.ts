import { describe, it, expect } from 'vitest';
import {
  LUTE_PRESETS, GUITAR_PRESETS, findPreset, guitarTuningByName, inferGuitarTuning,
  addBassCourse, removeBassCourse, setCoursePitch, setFrettedCourses, setGuitarStringPitch,
} from '../../src/core/tunings';

describe('tuning presets', () => {
  it('defines the Renaissance G lute', () => {
    expect(findPreset('lute-6-g')!.courses).toEqual([67, 62, 57, 53, 48, 43]);
    expect(findPreset('lute-6-g')!.frettedCourses).toBe(6);
  });
  it('defines 7-, 8- and 10-course lutes with 7 fretted courses', () => {
    expect(findPreset('lute-7-g')!.courses.slice(6)).toEqual([41]);
    expect(findPreset('lute-8-g')!.courses.slice(6)).toEqual([41, 38]);
    expect(findPreset('lute-10-g')!.courses.slice(6)).toEqual([41, 39, 38, 36]);
    for (const id of ['lute-7-g', 'lute-8-g', 'lute-10-g']) expect(findPreset(id)!.frettedCourses).toBe(7);
  });
  it('defines the Baroque 13-course D minor lute', () => {
    const t = findPreset('lute-13-baroque-dm')!;
    expect(t.courses).toEqual([65, 62, 57, 53, 50, 45, 43, 41, 40, 38, 36, 35, 33]);
    expect(t.frettedCourses).toBe(6);
  });
  it('has 6 guitar presets and 5 lute presets', () => {
    expect(GUITAR_PRESETS).toHaveLength(6);
    expect(LUTE_PRESETS).toHaveLength(5);
  });
});

describe('guitar tuning detection', () => {
  it('matches names', () => {
    expect(guitarTuningByName('Drop D')!.courses).toEqual([64, 59, 55, 50, 45, 38]);
    expect(guitarTuningByName('DADGAD')!.courses).toEqual([62, 57, 55, 50, 45, 38]);
    expect(guitarTuningByName('Half step down (Eb)')!.id).toBe('guitar-half-down');
    expect(guitarTuningByName('Standard (E A D G B E)')!.id).toBe('guitar-standard');
    expect(guitarTuningByName('nonsense')).toBeNull();
  });
  it('infers tuning from string labels (high to low)', () => {
    expect(inferGuitarTuning([4, 11, 7, 2, 9, 4]).id).toBe('guitar-standard');
    expect(inferGuitarTuning([4, 11, 7, 2, 9, 2]).id).toBe('guitar-drop-d');
    const custom = inferGuitarTuning([4, 11, 7, 2, 7, 2]);
    expect(custom.id).toBe('guitar-custom');
    expect(custom.courses).toEqual([64, 59, 55, 50, 43, 38]);
  });
});

describe('tuning edits', () => {
  const six = findPreset('lute-6-g')!;
  it('adds bass courses on the next natural note down', () => {
    const seven = addBassCourse(six);
    expect(seven.courses.slice(6)).toEqual([41]);
    expect(addBassCourse(seven).courses.slice(6)).toEqual([41, 40]);
    expect(seven.frettedCourses).toBe(6);
    expect(seven.id).toBe('lute-custom');
  });
  it('never removes below 6 courses', () => {
    expect(removeBassCourse(six)).toBe(six);
    const eight = findPreset('lute-8-g')!;
    const seven = removeBassCourse(eight);
    expect(seven.courses).toHaveLength(7);
    expect(seven.frettedCourses).toBe(7);
  });
  it('edits course pitch and fretted count', () => {
    expect(setCoursePitch(six, 5, 41).courses[5]).toBe(41);
    expect(setFrettedCourses(six, 3).frettedCourses).toBe(3);
  });
});

describe('guitar string edits', () => {
  const std = findPreset('guitar-standard')!;
  it('names a non-preset tuning by its notes, low to high', () => {
    const t = setGuitarStringPitch(std, 4, 43); // A2 -> G2
    expect(t.id).toBe('guitar-custom');
    expect(t.name).toBe('Custom (E G D G B E)');
    expect(t.courses).toEqual([64, 59, 55, 50, 43, 40]);
    expect(t.frettedCourses).toBe(6);
    expect(std.courses[4]).toBe(45);
  });
  it('becomes the preset when the strings match one', () => {
    const dropD = setGuitarStringPitch(std, 5, 38);
    expect(dropD.id).toBe('guitar-drop-d');
    expect(dropD.name).toBe('Drop D');
    expect(setGuitarStringPitch(dropD, 5, 40).id).toBe('guitar-standard');
  });
});
