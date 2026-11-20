import type { Piece } from '../model';
import { emptyOverrides } from '../model';
import { convertPiece } from './convert';

export const AUTO_SHIFT_PENALTY = 20;
export const AUTO_DROP_PENALTY = 50;

const CANDIDATES = Array.from({ length: 13 }, (_, i) => i - 6);

function score(base: Piece, t: number): { t: number; score: number } {
  const r = convertPiece(base, t);
  return { t, score: r.totalCost + r.stats.shifted * AUTO_SHIFT_PENALTY + r.stats.dropped * AUTO_DROP_PENALTY };
}

/** Lowest score wins; ties go to the smaller |t|, then the positive one. */
function best(scored: { t: number; score: number }[]): number {
  return [...scored].sort((a, b) => a.score - b.score || Math.abs(a.t) - Math.abs(b.t) || b.t - a.t)[0].t;
}

export function autoTranspose(piece: Piece): number {
  const base: Piece = { ...piece, overrides: emptyOverrides() };
  return best(CANDIDATES.map((t) => score(base, t)));
}

/** Same result as `autoTranspose`, but awaits `pause` before each transpose so a long piece doesn't freeze the page. */
export async function autoTransposeAsync(
  piece: Piece,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): Promise<number> {
  const base: Piece = { ...piece, overrides: emptyOverrides() };
  const scored: { t: number; score: number }[] = [];
  for (const t of CANDIDATES) {
    await pause();
    scored.push(score(base, t));
  }
  return best(scored);
}
