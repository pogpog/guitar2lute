import { useMemo } from 'react';
import type { LuteResult, Notation, Tuning } from '../core/model';
import { layoutLuteTab, LAYOUT } from '../core/luteTabLayout';

export interface LuteTabViewProps {
  result: LuteResult;
  tuning: Tuning;
  notation: Notation;
  playing: number | null;
  onCycle: (colIndex: number, noteIndex: number) => void;
  width?: number;
}

export function LuteTabView({ result, tuning, notation, playing, onCycle, width = 900 }: LuteTabViewProps) {
  const layout = useMemo(() => layoutLuteTab(result.tab, tuning, notation, width), [result.tab, tuning, notation, width]);
  if (!layout.systems.length) {
    return <p className="muted" data-testid="lute-tab-empty">No tab yet. Import guitar tab in the Guitar view.</p>;
  }
  return (
    <svg
      id="lute-tab-svg"
      data-testid="lute-tab"
      className="lute-tab"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
    >
      {layout.systems.map((s, si) => (
        <g key={si}>
          {s.columns
            .filter((c) => c.colIndex === playing)
            .map((c) => (
              <rect key="hl" className="playing" x={c.x - 9} y={s.y} width={18} height={s.height} fill="transparent" />
            ))}
          {s.lineYs.map((y, i) => (
            <line key={`l${i}`} x1={LAYOUT.margin / 2} x2={s.width - LAYOUT.margin / 2} y1={y} y2={y} stroke="currentColor" strokeWidth={0.8} />
          ))}
          {s.bars.map((x, i) => (
            <line key={`b${i}`} x1={x} x2={x} y1={s.lineYs[0]} y2={s.lineYs[s.lineYs.length - 1]} stroke="currentColor" strokeWidth={1} />
          ))}
          {s.glyphs.map((g, gi) => {
            const w = Math.max(12, g.text.length * 7 + 4);
            return (
              <g
                key={gi}
                className={`glyph${g.shifted ? ' shifted' : ''}${g.pinned ? ' pinned' : ''}`}
                data-testid={`glyph-${g.colIndex}-${g.noteIndex}`}
                onClick={() => onCycle(g.colIndex, g.noteIndex)}
              >
                {g.ledger && <line x1={g.x - 9} x2={g.x + 9} y1={g.y} y2={g.y} stroke="currentColor" strokeWidth={0.8} />}
                <rect className="glyph-bg" x={g.x - w / 2} y={g.y - 7} width={w} height={14} fill="#ffffff" />
                <text x={g.x} y={g.y + 4} textAnchor="middle" fontSize={13} fill="currentColor" fontFamily="Georgia, serif">{g.text}</text>
                {g.shifted && <circle cx={g.x} cy={g.y - 10} r={1.8} fill="currentColor" />}
                {g.pinned && <line x1={g.x - 5} x2={g.x + 5} y1={g.y + 9} y2={g.y + 9} stroke="currentColor" strokeWidth={1.2} />}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
