import type { LuteNote, LuteResult } from './model';
import { FRENCH_FRETS } from './notation';

/** 0-based course. Courses 1-7: letter + course number; 8th+: X + letter + one slash per course beyond the 8th. */
export function tabCodeNote(course: number, fret: number): string {
  const letter = FRENCH_FRETS[fret];
  if (letter === undefined) throw new RangeError(`TabCode has no letter for fret ${fret}.`);
  if (course < 7) return `${letter}${course + 1}`;
  return `X${letter}${'/'.repeat(course - 7)}`;
}

export function tabCodeChord(notes: LuteNote[]): string {
  return [...notes]
    .sort((a, b) => a.placement.course - b.placement.course)
    .map((n) => tabCodeNote(n.placement.course, n.placement.fret))
    .join('');
}

export function toTabCode(result: LuteResult, title: string): string {
  const lines = [`{${title.replace(/[{}]/g, '')}}`];
  const chordTokens = result.chords.map((c) => tabCodeChord(c.voicings[c.chosen]?.notes ?? [])).filter(Boolean);
  if (chordTokens.length) lines.push('{Chords}', chordTokens.join(' | '));
  lines.push('{Tablature}');
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) lines.push(cur.join(' '));
    cur = [];
  };
  for (const ev of result.tab) {
    if (ev.kind === 'bar') cur.push('|');
    else if (ev.kind === 'break') flush();
    else {
      const t = tabCodeChord(ev.notes);
      if (t) cur.push(t);
    }
  }
  flush();
  return `${lines.join('\n')}\n`;
}
