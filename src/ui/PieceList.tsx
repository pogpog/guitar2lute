import type { PieceMeta } from '../core/storage';

export interface PieceListProps {
  list: PieceMeta[];
  currentId: string;
  open: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function PieceList({ list, currentId, open, onOpen, onNew, onDelete }: PieceListProps) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Saved pieces">
      <button type="button" className="primary" data-testid="new-piece" onClick={onNew}>+ New piece</button>
      <ul className="piece-list">
        {list.map((m) => {
          const title = m.title || 'Untitled';
          return (
            <li key={m.id} className={m.id === currentId ? 'current' : ''}>
              <button type="button" className="link piece-open" onClick={() => onOpen(m.id)}>
                <span>{title}</span>
                <small>{m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : ''}</small>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete ${title}`}
                onClick={() => {
                  if (window.confirm(`Delete "${title}"?`)) onDelete(m.id);
                }}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
