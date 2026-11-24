import { useCallback, useMemo, useState } from 'react';
import type { Midi } from '../core/model';
import { browserStorage, exportPieces, importPieces, type StorageLike } from '../core/storage';
import { convertPiece } from '../core/convert/convert';
import { chordPitches, guitarColumns } from '../core/piece';
import { preferFlats } from '../core/pitch';
import { toTabCode } from '../core/tabcode';
import { setTitle } from '../core/edit';
import { Player, stepsFromColumns } from '../audio/pluck';
import { loadA4, saveA4, type Side } from '../core/pitchStandard';
import type { Tuner } from './TunePanel';
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
  // each side's pitch standard, kept on this device for every piece
  const [a4, setA4s] = useState<Record<Side, number>>(() => ({ lute: loadA4(store, 'lute'), guitar: loadA4(store, 'guitar') }));
  const changeA4 = (side: Side, next: number) => {
    player.stopTuningNote(); // its button would otherwise show the new frequency over the old sound
    saveA4(store, side, next);
    setA4s((prev) => ({ ...prev, [side]: next }));
  };
  const tunerFor = (side: Side): Tuner => ({
    play: (m, onEnd) => player.playTuningNote(m, a4[side], onEnd),
    stop: () => player.stopTuningNote(),
  });

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

  const playGuitarChord = useCallback((pitches: Midi[]) => player.playChord(pitches, a4.guitar), [player, a4.guitar]);
  const playLuteChord = useCallback((pitches: Midi[]) => player.playChord(pitches, a4.lute), [player, a4.lute]);

  const playTab = () => {
    const cols =
      view === 'guitar'
        ? guitarColumns(piece)
        : result.tab.flatMap((e) => (e.kind === 'col' ? [{ x: e.t ?? e.x, pitches: e.notes.map((n) => n.pitch), index: e.index }] : []));
    player.playSteps(stepsFromColumns(cols, msPerUnit), setPlaying, view === 'guitar' ? a4.guitar : a4.lute);
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
        downloadText('guitar2lute-pieces.json', exportPieces(s.allPieces()), 'application/json');
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
        onView={(v) => {
          player.stopTuningNote();
          setView(v);
        }}
        playing={playing !== null}
        onPlay={playTab}
        onStop={stop}
        msPerUnit={msPerUnit}
        onTempo={(next) => {
          player.setSpeed(next / msPerUnit);
          setMsPerUnit(next);
        }}
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
            <GuitarView
              piece={piece}
              update={update}
              flats={guitarFlats}
              playing={playing}
              onPlayChord={playGuitarChord}
              a4={a4.guitar}
              onA4={(v) => changeA4('guitar', v)}
              tuner={tunerFor('guitar')}
            />
          ) : (
            <LuteView
              piece={piece}
              update={update}
              result={result}
              playing={playing}
              onPlayChord={playLuteChord}
              a4={a4.lute}
              onA4={(v) => changeA4('lute', v)}
              tuner={tunerFor('lute')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
