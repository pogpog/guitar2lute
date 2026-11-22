import { tuningLabels } from '../../core/asciiRender';
import { luteLineWidth, LUTE_VIEW_WIDTH } from '../../core/luteTabLayout';
import { midiToName } from '../../core/pitch';
import { guitarTuningFromCourses } from '../../core/tunings';
import type { TabScore } from './read';

// Writes a TabScore as ASCII tab text (spec §5.5 "The generated text"). Positions are global
// characters: the whole piece as one line whose opening `|` is character 0. Blocks are slices of
// that line from one barline to another, so each block's closing `|` is the next block's opening
// one, and the parser (§5.3 step 6) counts it once, keeping time continuous across blocks.

interface Column {
  time: number;
  slot: number;
  /** fret per string, index 0 = highest; null = no note */
  frets: (number | null)[];
  /** characters of the widest fret */
  width: number;
  x: number;
}

type LineItem = { kind: 'col'; x: number } | { kind: 'bar' };

/** Characters per grace column, taken from the gap before its note: a two-digit fret and a dash. */
const SLOT = 3;

/** Each measure's columns in time order: notes sharing a time and slot form one column. */
function columnsByMeasure(score: TabScore): Column[][] {
  const out: Column[][] = score.measures.map(() => []);
  for (const note of score.notes) {
    const list = out[note.measure];
    let col = list[list.length - 1];
    if (!col || col.time !== note.time || col.slot !== note.slot) {
      col = { time: note.time, slot: note.slot, frets: Array(6).fill(null), width: 1, x: 0 };
      list.push(col);
    }
    col.frets[note.string] = note.fret;
    col.width = Math.max(col.width, String(note.fret).length);
  }
  return out;
}

/**
 * Characters per time unit as a fraction `chars / units`: the shortest gap making up at least 5% of
 * the gap list gets 3 characters. The list holds each gap between consecutive onsets (grace columns
 * excluded) and each measure's gap from its last onset to its end, every gap counted once. With no
 * gap between onsets (a single column), a quarter gets 12 characters.
 */
function scaleOf(score: TabScore, columns: Column[][]): { chars: number; units: number } {
  const onsets = [...new Set(columns.flat().filter((c) => c.slot === 0).map((c) => c.time))].sort((a, b) => a - b);
  if (onsets.length < 2) return { chars: 12, units: score.unit };
  const gaps: number[] = [];
  for (let i = 1; i < onsets.length; i++) gaps.push(onsets[i] - onsets[i - 1]);
  score.measures.forEach((m, i) => {
    const main = columns[i].filter((c) => c.slot === 0);
    if (main.length > 0) gaps.push(m.start + m.length - main[main.length - 1].time);
  });
  const counts = new Map<number, number>();
  for (const g of gaps) if (g > 0) counts.set(g, (counts.get(g) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const common = [...counts.entries()].filter(([, count]) => count * 20 >= total).map(([g]) => g);
  if (common.length > 0) return { chars: 3, units: Math.min(...common) };
  // No gap reaches 5% (over 20 different gaps, each rare): the most common one, the shortest on a tie.
  const [[most]] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return { chars: 3, units: most };
}

/**
 * Places every column and barline (spec §5.5 "Placement"); returns each measure's closing bar position.
 * A grace column aims 3 characters per slot before its note (after it, for an after-grace); a
 * measure's `|` aims one character before the next measure's first item, graces included, so a
 * grace on a downbeat takes its room from the gap before, yet stays after the `|`, in its own bar.
 */
function place(score: TabScore, columns: Column[][]): number[] {
  const { chars, units } = scaleOf(score, columns);
  const origin = score.measures.length > 0 ? score.measures[0].start : 0;
  const at = (time: number) => Math.round(((time - origin) * chars) / units);
  const target = (c: Column) => at(c.time) + SLOT * c.slot;
  const startOf = (i: number) => Math.min(at(score.measures[i].start), ...columns[i].map(target));
  // The opening `|` is character 0, the bar before measure 1, so measure 1's first item (a grace,
  // perhaps) sits at character 1.
  const base = score.measures.length > 0 ? 1 - startOf(0) : 1;
  const bars: number[] = [];
  let end = 0; // last character used: a digit or a `|`
  let afterCol = false;
  score.measures.forEach((m, i) => {
    for (const col of columns[i]) {
      col.x = Math.max(base + target(col), end + (afterCol ? 2 : 1));
      end = col.x + col.width - 1;
      afterCol = true;
    }
    const next = i + 1 < score.measures.length ? startOf(i + 1) : at(m.start + m.length);
    const bar = Math.max(base + next - 1, end + 1);
    bars.push(bar);
    end = bar;
    afterCol = false;
  });
  return bars;
}

/**
 * Groups measures into blocks of [first, last] measure: a new block at `newBlock` or before a measure
 * that would make the block too wide for one lute line; a lone wider measure stays whole.
 */
function blocksOf(score: TabScore, columns: Column[][]): [number, number][] {
  const blocks: [number, number][] = [];
  let items: LineItem[] = [];
  score.measures.forEach((m, i) => {
    const own: LineItem[] = columns[i].map((c) => ({ kind: 'col', x: c.x }));
    // The parser keeps one bar event for consecutive barlines (an empty measure).
    if (own.length > 0 || (items.length > 0 && items[items.length - 1].kind !== 'bar')) own.push({ kind: 'bar' });
    if (blocks.length > 0 && (m.newBlock || luteLineWidth([...items, ...own]) > LUTE_VIEW_WIDTH)) {
      blocks.push([i, i]);
      items = own;
    } else {
      if (blocks.length === 0) blocks.push([i, i]);
      blocks[blocks.length - 1][1] = i;
      items.push(...own);
    }
  });
  return blocks;
}

/** The six string bodies of a block, from its opening `|` to its closing one. */
function blockBodies(columns: Column[][], bars: number[], [first, last]: [number, number]): string[] {
  const open = first === 0 ? 0 : bars[first - 1];
  const lines = Array.from({ length: 6 }, () => Array<string>(bars[last] - open + 1).fill('-'));
  for (let i = first; i <= last; i++) {
    for (const col of columns[i]) {
      col.frets.forEach((fret, s) => {
        if (fret !== null) [...String(fret)].forEach((d, k) => (lines[s][col.x - open + k] = d));
      });
    }
  }
  for (let i = first - 1; i <= last; i++) {
    const x = i < 0 ? 0 : bars[i];
    for (const line of lines) line[x - open] = '|';
  }
  return lines.map((l) => l.join(''));
}

/** Whether the parser reads every line as tab (§5.3 step 3: 4+ characters, 3+ dashes). */
function readsAsTab(bodies: string[]): boolean {
  return bodies.every((b) => b.length >= 4 && [...b].filter((c) => c === '-').length >= 3);
}

export function writeTabText(score: TabScore): string {
  const columns = columnsByMeasure(score);
  const bars = place(score, columns);
  const blocks = blocksOf(score, columns);
  // A block too short to read as tab joins the block before it (or after it, when first).
  for (let k = 0; blocks.length > 1 && k < blocks.length; ) {
    if (readsAsTab(blockBodies(columns, bars, blocks[k]))) {
      k++;
    } else if (k > 0) {
      blocks[k - 1][1] = blocks[k][1];
      blocks.splice(k, 1);
      k--;
    } else {
      blocks[1][0] = blocks[0][0];
      blocks.splice(0, 1);
    }
  }
  const bodies = blocks.map((b) => blockBodies(columns, bars, b));
  // A piece that is one such block gets dashes before its final `|` (nothing comes after it).
  if (bodies.length === 1) {
    while (!readsAsTab(bodies[0])) bodies[0] = bodies[0].map((b) => `${b.slice(0, -1)}-|`);
  }
  const labels = tuningLabels(guitarTuningFromCourses(score.tuning));
  const width = Math.max(...labels.map((l) => l.length));
  const tuning = [...score.tuning].reverse().map((m) => midiToName(m, false)).join(' ');
  const text = bodies.map((lines) => lines.map((body, s) => labels[s].padEnd(width) + body).join('\n'));
  return [`Tuning: ${tuning}`, `Capo: ${score.capo}`, '', text.join('\n\n')].join('\n') + '\n';
}
