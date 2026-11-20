import type { Piece } from '../model';
import { emptyOverrides } from '../model';
import { convertPiece } from './convert';

export const AUTO_SHIFT_PENALTY = 20;
export const AUTO_DROP_PENALTY = 50;

export function autoTranspose(piece: Piece): number {
  const base: Piece = { ...piece, overrides: emptyOverrides() };
  const scored: { t: number; score: number }[] = [];
  for (let t = -6; t <= 6; t++) {
    const r = convertPiece(base, t);
    scored.push({ t, score: r.totalCost + r.stats.shifted * AUTO_SHIFT_PENALTY + r.stats.dropped * AUTO_DROP_PENALTY });
  }
  scored.sort((a, b) => a.score - b.score || Math.abs(a.t) - Math.abs(b.t) || b.t - a.t);
  return scored[0].t;
}
