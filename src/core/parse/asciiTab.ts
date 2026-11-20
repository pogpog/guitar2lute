import type { TabEvent, TabNote, Warning } from '../model';
import { normalizeTabText } from './normalize';
import { parsePitchClass } from '../pitch';

export interface AsciiParseResult { events: TabEvent[]; warnings: Warning[]; labels: number[] | null; }

interface LineInfo {
  index: number;
  label: string | null;
  body: string;
  origin: number;
  isTab: boolean;
  /** the character just before the body is a space (where other lines may have their barline) */
  spaceBefore: boolean;
}
interface Token { string: number; start: number; end: number; fret: number; }

const LABEL_RE = /^\s*([A-Ga-g][#b]?)\s*(?=[|:\-])/;
const TAB_CHAR = /[-0-9|:hpbr/\\~x()<>sn^.*]/;
const TRAILING_ANNOTATION = /\s+(?:x\s*\d+|\d+\s*x|\(?repeat\b.*)$/i;

function analyzeLine(text: string, index: number): LineInfo {
  const m = LABEL_RE.exec(text);
  const label = m ? m[1] : null;
  const start = m ? m[0].length : 0;
  let origin = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '|' || c === '-' || c === ':') { origin = i; break; }
    if (c !== ' ') break;
  }
  if (origin < 0) return { index, label, body: '', origin: 0, isTab: false, spaceBefore: false };
  let body = text.slice(origin).replace(/\s+$/, '');
  // Text after the last barline ("|  let ring", "|PM", "| Am") is an annotation, not tab.
  const lastBar = body.lastIndexOf('|');
  const rest = lastBar > 0 ? body.slice(lastBar + 1) : '';
  if (rest && (/^\s/.test(rest) || /[A-Za-z]{2,}/.test(rest))) body = body.slice(0, lastBar + 1);
  body = body.replace(TRAILING_ANNOTATION, '');
  let tabChars = 0;
  let dashes = 0;
  for (const c of body) {
    if (TAB_CHAR.test(c)) tabChars++;
    if (c === '-') dashes++;
  }
  const isTab = body.length >= 4 && dashes >= 3 && tabChars / body.length >= 0.6;
  return { index, label, body, origin, isTab, spaceBefore: origin > 0 && text[origin - 1] === ' ' };
}

/** When most lines of a block start with a barline, a line that has a space there instead lines up as if it had one. */
function alignLeadingBars(block: LineInfo[]): LineInfo[] {
  const barLed = block.filter((l) => l.body.startsWith('|')).length;
  if (barLed * 2 <= block.length) return block;
  return block.map((l) => (!l.body.startsWith('|') && l.spaceBefore ? { ...l, body: `|${l.body}`, origin: l.origin - 1 } : l));
}

/** Lines like "|--1--2--3--|" that only count beats. */
function isCountLike(body: string): boolean {
  const nums = (body.match(/\d+/g) ?? []).map(Number);
  return nums.length > 0 && nums.every((n, k) => n === k + 1);
}

/** How much six lines look like one block: labels, equal lengths, shared barlines, no count lines. */
function windowScore(w: LineInfo[]): number {
  const mode = <T,>(xs: T[]) => {
    const counts = new Map<T, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    return Math.max(...counts.values());
  };
  const bars = w.map((l) => [...l.body].flatMap((c, k) => (c === '|' ? [k] : [])).join(','));
  return (
    w.filter((l) => l.label).length +
    mode(w.map((l) => l.body.length)) +
    mode(bars) -
    w.filter((l) => isCountLike(l.body)).length
  );
}

/**
 * Splits a run of tab-like lines into 6-line blocks. When the run has extra lines (count lines,
 * annotations), each block is the best-scoring window at that point and the rest are skipped.
 */
function blocksFromRun(run: LineInfo[]): { blocks: LineInfo[][]; skipped: LineInfo[] } {
  const blocks: LineInfo[][] = [];
  const skipped: LineInfo[] = [];
  let s = 0;
  while (s + 6 <= run.length) {
    const spare = (run.length - s) % 6;
    let best = s;
    for (let t = s + 1; t <= s + spare; t++) {
      if (windowScore(run.slice(t, t + 6)) > windowScore(run.slice(best, best + 6))) best = t;
    }
    skipped.push(...run.slice(s, best));
    blocks.push(run.slice(best, best + 6));
    s = best + 6;
  }
  skipped.push(...run.slice(s));
  return { blocks, skipped };
}

function parseBlock(lines: LineInfo[], xOffset: number): { events: TabEvent[]; width: number; warnings: Warning[]; endsWithBar: boolean } {
  const block = alignLeadingBars(lines);
  const warnings: Warning[] = [];
  const tokens: Token[] = [];
  const barCounts = new Map<number, number>();
  let width = 0;

  block.forEach((line, s) => {
    const body = line.body;
    width = Math.max(width, body.length);
    let skipNext = false;
    let harmonic = false;
    let c = 0;
    while (c < body.length) {
      const ch = body[c];
      if (ch >= '0' && ch <= '9') {
        let e = c;
        while (e + 1 < body.length && body[e + 1] >= '0' && body[e + 1] <= '9') e++;
        const digits = body.slice(c, e + 1);
        const pieces = Number(digits) <= 24
          ? [{ start: c, end: e, fret: Number(digits) }]
          : [...digits].map((d, k) => ({ start: c + k, end: c + k, fret: Number(d) }));
        for (const p of pieces) {
          if (skipNext) { skipNext = false; continue; }
          if (harmonic) {
            warnings.push({
              kind: 'parse',
              message: `Natural harmonic at fret ${p.fret} dropped.`,
              line: line.index + 1,
              textColumn: line.origin + p.start + 1,
            });
            continue;
          }
          tokens.push({ string: s, ...p });
        }
        skipNext = false;
        harmonic = false;
        c = e + 1;
        continue;
      }
      if (ch === 'b' || ch === 'r') skipNext = true;
      else if (ch === '<' || ch === 'n') harmonic = true;
      else if (ch === '>') harmonic = false;
      else if (ch === '-' || ch === '|') {
        skipNext = false;
        harmonic = false;
        if (ch === '|') barCounts.set(c, (barCounts.get(c) ?? 0) + 1);
      }
      c++;
    }
  });

  tokens.sort((a, b) => a.start - b.start || a.string - b.string);
  interface Group { start: number; end: number; notes: TabNote[]; strings: Set<number>; firstString: number; }
  const groups: Group[] = [];
  for (const t of tokens) {
    const g = groups[groups.length - 1];
    if (g && t.start <= g.end && !g.strings.has(t.string)) {
      g.end = Math.max(g.end, t.end);
      g.notes.push({ string: t.string, fret: t.fret });
      g.strings.add(t.string);
    } else {
      groups.push({ start: t.start, end: t.end, notes: [{ string: t.string, fret: t.fret }], strings: new Set([t.string]), firstString: t.string });
    }
  }

  const bars = [...barCounts.entries()].filter(([col, n]) => col > 0 && n >= 4).map(([col]) => col).sort((a, b) => a - b);
  const events: TabEvent[] = [];
  const pushBar = (col: number) => {
    if (events.length && events[events.length - 1].kind !== 'bar') events.push({ kind: 'bar', x: xOffset + col });
  };
  let bi = 0;
  for (const g of groups) {
    while (bi < bars.length && bars[bi] < g.start) { pushBar(bars[bi]); bi++; }
    const srcLine = block[g.firstString];
    events.push({
      kind: 'col',
      col: {
        notes: g.notes.sort((a, b) => a.string - b.string),
        x: xOffset + g.start,
        src: { line: srcLine.index + 1, col: srcLine.origin + g.start + 1 },
      },
    });
  }
  while (bi < bars.length) { pushBar(bars[bi]); bi++; }
  const endsWithBar = block.filter((l) => l.body.endsWith('|')).length >= 4;
  return { events, width, warnings, endsWithBar };
}

export function parseAsciiTab(raw: string): AsciiParseResult {
  const infos = normalizeTabText(raw).split('\n').map(analyzeLine);
  const warnings: Warning[] = [];
  const events: TabEvent[] = [];
  let labels: number[] | null = null;
  let xOffset = 0;
  let prevEnd: { width: number; endsWithBar: boolean } | null = null;
  let lastBreak: Extract<TabEvent, { kind: 'break' }> | null = null;
  let i = 0;
  while (i < infos.length) {
    if (!infos[i].isTab) { i++; continue; }
    let j = i;
    while (j < infos.length && infos[j].isTab) j++;
    const run = infos.slice(i, j);
    const { blocks, skipped } = blocksFromRun(run);
    if (blocks.length === 0) {
      if (run.length >= 3) {
        warnings.push({ kind: 'parse', message: `Found ${run.length} tab-like lines (expected 6); skipped.`, line: run[0].index + 1 });
      }
    } else {
      if (skipped.length) {
        const lines = skipped.map((l) => l.index + 1).join(', ');
        warnings.push({
          kind: 'parse',
          message: `Ignored line(s) ${lines} next to the tab (count or annotation lines?). If notes ended up on the wrong strings, delete the extra lines and import again.`,
          line: skipped[0].index + 1,
        });
      }
      for (const block of blocks) {
        // Blocks follow each other in time; a barline closing one block and opening the next counts once.
        if (prevEnd) {
          const shared = prevEnd.endsWithBar && block.filter((l) => l.body.startsWith('|')).length >= 4;
          xOffset += prevEnd.width - (shared ? 1 : 0);
          lastBreak!.next = xOffset;
        }
        const parsed = parseBlock(block, xOffset);
        lastBreak = { kind: 'break', next: xOffset + parsed.width };
        events.push(...parsed.events, lastBreak);
        warnings.push(...parsed.warnings);
        prevEnd = { width: parsed.width, endsWithBar: parsed.endsWithBar };
        if (!labels && block.every((l) => l.label)) labels = block.map((l) => parsePitchClass(l.label!)!);
      }
    }
    i = j;
  }
  if (events.length === 0) {
    warnings.push({ kind: 'parse', message: 'No guitar tab found. Expected blocks of 6 lines like "e|--0--3--|".' });
  }
  return { events, warnings, labels };
}
