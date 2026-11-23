export type View = 'guitar' | 'lute';
export type ExportKind = 'json' | 'json-all' | 'tabcode' | 'tab-svg' | 'chords-svg' | 'print';

export interface HeaderProps {
  title: string;
  onTitle: (t: string) => void;
  view: View;
  onView: (v: View) => void;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  msPerUnit: number;
  onTempo: (ms: number) => void;
  onExport: (kind: ExportKind) => void;
  onImportJson: (file: File) => void;
  onToggleSidebar: () => void;
}

export function Header(props: HeaderProps) {
  const { title, onTitle, view, onView, playing, onPlay, onStop, msPerUnit, onTempo, onExport, onImportJson, onToggleSidebar } = props;
  return (
    <header className="header">
      <button type="button" className="icon-btn menu" aria-label="Show saved pieces" onClick={onToggleSidebar}>☰</button>
      <span className="brand">Guitar → Lute</span>
      <input className="title" aria-label="Piece title" value={title} onChange={(e) => onTitle(e.target.value)} />
      <div className="segmented" role="radiogroup" aria-label="View">
        {(['guitar', 'lute'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            data-testid={`view-${v}`}
            className={view === v ? 'active' : ''}
            onClick={() => onView(v)}
          >
            {v === 'guitar' ? 'Guitar' : 'Lute'}
          </button>
        ))}
      </div>
      <div className="playback">
        {playing ? (
          <button type="button" data-testid="stop" onClick={onStop}>■ Stop</button>
        ) : (
          <button type="button" data-testid="play" onClick={onPlay}>▶ Play</button>
        )}
        <label className="tempo">
          Speed
          <input type="range" min={40} max={300} step={10} value={340 - msPerUnit} onChange={(e) => onTempo(340 - Number(e.target.value))} />
        </label>
      </div>
      <select
        aria-label="Export"
        data-testid="export"
        value=""
        onChange={(e) => {
          const v = e.target.value as ExportKind | '';
          if (v) onExport(v);
        }}
      >
        <option value="">Export…</option>
        <option value="json">This piece (JSON)</option>
        <option value="json-all">All pieces (JSON)</option>
        <option value="tabcode">Lute TabCode (.tc)</option>
        <option value="tab-svg">Lute tab (SVG)</option>
        <option value="chords-svg">Lute chord boxes (SVG)</option>
        <option value="print">Print…</option>
      </select>
      <label className="file-button">
        Import JSON
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportJson(f);
            e.target.value = '';
          }}
        />
      </label>
    </header>
  );
}
