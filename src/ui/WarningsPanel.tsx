import type { Warning } from '../core/model';

export interface WarningsPanelProps {
  warnings: Warning[];
  onSelect?: (w: Warning) => void;
  /** remove the manual placements of the chord or column a `pin` warning points at */
  onRemovePins?: (w: Warning) => void;
  /** remove every manual placement that no longer fits */
  onRemoveAllStale?: () => void;
}

export function WarningsPanel({ warnings, onSelect, onRemovePins, onRemoveAllStale }: WarningsPanelProps) {
  if (!warnings.length) return null;
  const stale = warnings.filter((w) => w.kind === 'pin').length;
  return (
    <details className="warnings" open={warnings.length <= 5} data-testid="warnings">
      <summary>{`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}</summary>
      {onRemoveAllStale && stale > 1 && (
        <button type="button" className="remove-stale" onClick={onRemoveAllStale}>Remove all that no longer fit</button>
      )}
      <ul>
        {warnings.map((w, i) => (
          <li key={i} className={`warning warning-${w.kind}`}>
            {onSelect && w.line ? (
              <button type="button" className="link" onClick={() => onSelect(w)}>{`Line ${w.line}: ${w.message}`}</button>
            ) : (
              w.message
            )}
            {onRemovePins && w.kind === 'pin' && (
              <>
                {' '}
                <button type="button" className="link remove-pins" title="Forget these manual placements" onClick={() => onRemovePins(w)}>Remove</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
