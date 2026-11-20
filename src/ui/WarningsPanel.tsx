import type { Warning } from '../core/model';

export interface WarningsPanelProps { warnings: Warning[]; onSelect?: (w: Warning) => void; }

export function WarningsPanel({ warnings, onSelect }: WarningsPanelProps) {
  if (!warnings.length) return null;
  return (
    <details className="warnings" open={warnings.length <= 5} data-testid="warnings">
      <summary>{`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}</summary>
      <ul>
        {warnings.map((w, i) => (
          <li key={i} className={`warning warning-${w.kind}`}>
            {onSelect && w.line ? (
              <button type="button" className="link" onClick={() => onSelect(w)}>{`Line ${w.line}: ${w.message}`}</button>
            ) : (
              w.message
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
