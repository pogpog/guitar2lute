import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Piece } from '../core/model';
import { PieceStore, type PieceMeta, type StorageLike } from '../core/storage';
import { newPiece } from '../core/piece';
import { touch } from '../core/edit';

const SAVE_ERROR = 'Could not save: browser storage is full or unavailable. Export your pieces as JSON to keep them.';

export function safeLoad(store: PieceStore, id: string): Piece | null {
  try {
    return store.load(id);
  } catch {
    return null;
  }
}

export function initialPiece(store: PieceStore): Piece {
  for (const m of store.list()) {
    const p = safeLoad(store, m.id);
    if (p) return p;
  }
  return newPiece();
}

export function usePieces(storage: StorageLike) {
  const store = useMemo(() => new PieceStore(storage), [storage]);
  const [list, setList] = useState<PieceMeta[]>(() => store.list());
  const [piece, setPiece] = useState<Piece>(() => initialPiece(store));
  const [saveError, setSaveError] = useState<string | null>(null);

  const trySave = useCallback(
    (p: Piece) => {
      try {
        store.save(p);
        setSaveError(null);
      } catch {
        setSaveError(SAVE_ERROR);
      }
      setList(store.list());
    },
    [store],
  );

  useEffect(() => {
    const t = window.setTimeout(() => trySave(piece), 500);
    return () => window.clearTimeout(t);
  }, [piece, trySave]);

  const update = useCallback((fn: (p: Piece) => Piece) => setPiece((p) => touch(fn(p))), []);

  const open = useCallback(
    (id: string) => {
      trySave(piece);
      const p = safeLoad(store, id);
      if (p) setPiece(p);
    },
    [piece, store, trySave],
  );

  const create = useCallback(() => {
    trySave(piece);
    setPiece(newPiece());
  }, [piece, trySave]);

  const remove = useCallback(
    (id: string) => {
      store.remove(id);
      const l = store.list();
      setList(l);
      if (id === piece.id) {
        const next = l.map((m) => safeLoad(store, m.id)).find((p): p is Piece => p !== null);
        setPiece(next ?? newPiece());
      }
    },
    [piece.id, store],
  );

  const importMany = useCallback(
    (pieces: Piece[]) => {
      for (const p of pieces) {
        try {
          store.save(p);
        } catch {
          setSaveError(SAVE_ERROR);
        }
      }
      setList(store.list());
      if (pieces[0]) setPiece(pieces[0]);
    },
    [store],
  );

  const allPieces = useCallback(
    () => store.list().map((m) => safeLoad(store, m.id)).filter((p): p is Piece => p !== null),
    [store],
  );

  return { piece, update, list, open, create, remove, importMany, allPieces, saveError };
}
