import type { ColumnCandidate } from './types';
import { transitionCost } from './cost';

export interface ViterbiResult { path: number[]; cost: number; }

interface State { cost: number; back: number; hand: number | null; }

export function viterbi(columns: ColumnCandidate[][]): ViterbiResult {
  if (columns.length === 0) return { path: [], cost: 0 };
  const table: State[][] = [columns[0].map((c) => ({ cost: c.cost, back: -1, hand: c.hand }))];
  for (let i = 1; i < columns.length; i++) {
    const prev = table[i - 1];
    const prevCands = columns[i - 1];
    table.push(
      columns[i].map((c) => {
        let best = Infinity;
        let back = 0;
        prev.forEach((ps, k) => {
          const t = ps.cost + transitionCost(ps.hand, prevCands[k].bass, c);
          if (t < best) {
            best = t;
            back = k;
          }
        });
        return { cost: best + c.cost, back, hand: c.hand ?? prev[back].hand };
      }),
    );
  }
  const last = table[table.length - 1];
  let end = 0;
  last.forEach((s, j) => {
    if (s.cost < last[end].cost) end = j;
  });
  const path = new Array<number>(columns.length);
  path[columns.length - 1] = end;
  for (let i = columns.length - 1; i > 0; i--) path[i - 1] = table[i][path[i]].back;
  return { path, cost: last[end].cost };
}
