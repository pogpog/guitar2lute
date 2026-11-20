import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Piece } from '../core/model';
import { PieceStore, type PieceMeta, type StorageLike } from '../core/storage';
import { newPiece } from '../core/piece';
import { touch } from '../core/edit';

const SAVE_ERROR = 'Could not save: browser storage is full or unavailable. Export your pieces as JSON to keep them.';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const named = (m: PieceMeta | undefined) => `“${m?.title || 'Untitled'}”`;

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
  /** a message about a piece that could not be opened or exported; cleared by the user */
  const [notice, setNotice] = useState<string | null>(null);

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

  // Save at once when the page is hidden or closed, so the last half second of edits is not lost.
  const latest = useRef(piece);
  latest.current = piece;
  useEffect(() => {
    const flush = () => trySave(latest.current);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [trySave]);

  const update = useCallback((fn: (p: Piece) => Piece) => setPiece((p) => touch(fn(p))), []);

  const open = useCallback(
    (id: string) => {
      trySave(piece);
      const meta = store.list().find((m) => m.id === id);
      try {
        const p = store.load(id);
        if (p) {
          setPiece(p);
          setNotice(null);
        } else {
          setNotice(`${named(meta)} is no longer saved in this browser.`);
        }
      } catch (e) {
        setNotice(`Could not open ${named(meta)}: ${errorText(e)}`);
      }
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

  /** Every readable saved piece; pieces that cannot be read are reported in `notice`. */
  const allPieces = useCallback(() => {
    const pieces: Piece[] = [];
    const skipped: string[] = [];
    for (const m of store.list()) {
      const p = safeLoad(store, m.id);
      if (p) pieces.push(p);
      else skipped.push(named(m));
    }
    if (skipped.length) setNotice(`Left out of the export because they cannot be read: ${skipped.join(', ')}.`);
    return pieces;
  }, [store]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { piece, update, list, open, create, remove, importMany, allPieces, saveError, notice, dismissNotice };
}
