import type { TabEvent, Tuning } from '../core/model';
import { layoutAsciiSystem, splitSystems, systemOrigins, tuningLabels } from '../core/asciiRender';

interface GuitarTabViewProps {
  events: TabEvent[];
  tuning: Tuning;
  /** index of the playing tab column (counted over the whole piece), or null */
  playing?: number | null;
}

export function GuitarTabView({ events, tuning, playing = null }: GuitarTabViewProps) {
  const systems = splitSystems(events);
  const origins = systemOrigins(events);
  if (!systems.length) {
    return <p className="muted" data-testid="guitar-tab-empty">No tab yet. Use “Import tab…” to paste text or upload a PDF.</p>;
  }
  const labels = tuningLabels(tuning);
  let first = 0; // column index of each system's first column
  return (
    <div className="ascii-tabs" data-testid="guitar-tab">
      {systems.map((sys, i) => {
        const { rows, spans } = layoutAsciiSystem(sys, labels, origins[i]);
        const local = playing === null ? -1 : playing - first;
        first += spans.length;
        const span = local >= 0 && local < spans.length ? spans[local] : null;
        if (!span) return <pre key={i} className="ascii-tab">{rows.join('\n')}</pre>;
        return (
          <pre key={i} className="ascii-tab">
            {rows.map((r, s) => (
              <span key={s}>
                {r.slice(0, span.start)}
                <mark className="playing">{r.slice(span.start, span.end)}</mark>
                {r.slice(span.end)}
                {s < rows.length - 1 ? '\n' : ''}
              </span>
            ))}
          </pre>
        );
      })}
    </div>
  );
}
