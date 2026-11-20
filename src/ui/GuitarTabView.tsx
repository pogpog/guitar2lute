import type { TabEvent, Tuning } from '../core/model';
import { renderAsciiSystem, splitSystems, tuningLabels } from '../core/asciiRender';

export function GuitarTabView({ events, tuning }: { events: TabEvent[]; tuning: Tuning }) {
  const systems = splitSystems(events);
  if (!systems.length) {
    return <p className="muted" data-testid="guitar-tab-empty">No tab yet. Use “Import tab…” to paste text or upload a PDF.</p>;
  }
  const labels = tuningLabels(tuning);
  return (
    <div className="ascii-tabs" data-testid="guitar-tab">
      {systems.map((sys, i) => (
        <pre key={i} className="ascii-tab">{renderAsciiSystem(sys, labels).join('\n')}</pre>
      ))}
    </div>
  );
}
