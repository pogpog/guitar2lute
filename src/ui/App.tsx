import { useCallback, useMemo, useState } from 'react';
import type { Midi } from '../core/model';
import { browserStorage, exportPieces, importPieces, type StorageLike } from '../core/storage';
import { convertPiece } from '../core/convert/convert';
import { chordPitches, guitarColumns } from '../core/piece';
import { preferFlats } from '../core/pitch';
import { toTabCode } from '../core/tabcode';
import { setTitle } from '../core/edit';
import { Player, stepsFromColumns } from '../audio/pluck';
import { importAgainMessage, usePieces } from './state';
import { Header, type ExportKind, type View } from './Header';
import { PieceList } from './PieceList';
import { GuitarView } from './GuitarView';
import { LuteView } from './LuteView';
import { combineSvgs, downloadText, slug, svgMarkup } from './util';

export function App({ storage }: { storage?: StorageLike }) {
  const [store] = useState<StorageLike>(() => storage ?? browserStorage());
  const s = usePieces(store);
  const { piece, update } = s;
  const [view, setView] = useState<View>('guitar');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [msPerUnit, setMsPerUnit] = useState(120);
  const player = useMemo(() => new Player(), []);

  const { guitar, lute, overrides } = piece;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => convertPiece(piece), [guitar, lute, overrides]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const guitarFlats = useMemo(
    () =>
      preferFlats([
        ...guitar.chords.flatMap((c) => chordPitches(c, guitar.tuning, guitar.capo).map((x) => x.pitch)),
        ...guitarColumns(piece).flatMap((c) => c.pitches),
      ]),
    [guitar],
  );

  const playChord = useCallback((pitches: Midi[]) => player.playChord(pitches), [player]);

  const playTab = () => {
    const cols =
      view === 'guitar'
        ? guitarColumns(piece)
        : result.tab.flatMap((e) => (e.kind === 'col' ? [{ x: e.x, pitches: e.notes.map((n) => n.pitch), index: e.index }] : []));
    player.playSteps(stepsFromColumns(cols, msPerUnit), setPlaying);
    setPlaying(cols.length ? cols[0].index : null);
  };
  const stop = () => {
    player.stop();
    setPlaying(null);
  };

  const onExport = (kind: ExportKind) => {
    const name = slug(piece.title);
    switch (kind) {
      case 'json':
        downloadText(`${name}.json`, exportPieces([piece]), 'application/json');
        return;
      case 'json-all':
        downloadText('guitar-to-lute-pieces.json', exportPieces(s.allPieces()), 'application/json');
        return;
      case 'tabcode':
        downloadText(`${name}.tc`, toTabCode(result, piece.title), 'text/plain');
        return;
      case 'tab-svg': {
        const el = document.getElementById('lute-tab-svg') as SVGSVGElement | null;
        if (!el) {
          window.alert('Open the Lute view (with some tab) first.');
          return;
        }
        downloadText(`${name}-lute-tab.svg`, svgMarkup(el), 'image/svg+xml');
        return;
      }
      case 'chords-svg': {
        const els = [...document.querySelectorAll<SVGSVGElement>('[data-testid="lute-chordbox"] svg')];
        if (!els.length) {
          window.alert('Open the Lute view (with some chord boxes) first.');
          return;
        }
        const labels = els.map((el) => el.closest('figure')?.querySelector('.chord-title')?.textContent ?? '');
        downloadText(`${name}-lute-chords.svg`, combineSvgs(els, 12, labels), 'image/svg+xml');
        return;
      }
      case 'print':
        window.print();
    }
  };

  const onImportJson = async (file: File) => {
    try {
      s.importMany(importPieces(await file.text()), (dups) => window.confirm(importAgainMessage(dups)));
    } catch (e) {
      window.alert(`Could not import: ${(e as Error).message}`);
    }
  };

  return (
    <div className="app">
      <Header
        title={piece.title}
        onTitle={(t) => update((p) => setTitle(p, t))}
        view={view}
        onView={setView}
        playing={playing !== null}
        onPlay={playTab}
        onStop={stop}
        msPerUnit={msPerUnit}
        onTempo={setMsPerUnit}
        onExport={onExport}
        onImportJson={(f) => void onImportJson(f)}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      {s.saveError && <div className="banner" role="alert">{s.saveError}</div>}
      {s.notice && (
        <div className="banner" role="alert">
          {s.notice}{' '}
          <button type="button" className="link" aria-label="Dismiss" onClick={s.dismissNotice}>✕</button>
        </div>
      )}
      <div className="layout">
        <PieceList
          open={sidebarOpen}
          list={s.list}
          currentId={piece.id}
          onOpen={(id) => {
            stop();
            s.open(id);
            setSidebarOpen(false);
          }}
          onNew={() => {
            stop();
            s.create();
            setSidebarOpen(false);
          }}
          onDelete={s.remove}
        />
        <main className="main">
          <h1 className="print-title">{piece.title}</h1>
          {view === 'guitar' ? (
            <GuitarView piece={piece} update={update} flats={guitarFlats} playing={playing} onPlayChord={playChord} />
          ) : (
            <LuteView piece={piece} update={update} result={result} playing={playing} onPlayChord={playChord} />
          )}
        </main>
      </div>
    </div>
  );
}
