import { useMemo, useRef, useState } from 'react';
import { importTabText, type TextImport } from '../core/parse/importText';
import { WarningsPanel } from './WarningsPanel';

/** Larger files are refused before reading: a picked video would stall the tab. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const TOO_BIG = 'This file is too large to open (over 100 MB).';

export interface ImportDialogProps {
  initialText: string;
  hasPins: boolean;
  onImport: (imp: TextImport, text: string) => void;
  onClose: () => void;
}

export function ImportDialog({ initialText, hasPins, onImport, onClose }: ImportDialogProps) {
  const [text, setText] = useState(initialText);
  const [message, setMessage] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Each pick gets a number; a read that finishes after a newer pick is dropped.
  const latestPick = useRef(0);
  const preview = useMemo(() => importTabText(text), [text]);
  const cols = preview.events.filter((e) => e.kind === 'col').length;

  const onFile = async (file: File) => {
    const pick = ++latestPick.current;
    if (file.size > MAX_FILE_BYTES) {
      setBusy(false);
      setMessage(TOO_BIG);
      setNotices([]);
      return;
    }
    setBusy(true);
    setMessage(null);
    setNotices([]);
    try {
      const { openImportFile } = await import('../import/openFile');
      const opened = await openImportFile(new Uint8Array(await file.arrayBuffer()), {
        parser: new DOMParser(),
        extractPdfText: async (d) => (await import('../import/pdf')).extractPdfText(d),
      });
      if (pick !== latestPick.current) return;
      if (!opened.ok) {
        setMessage(opened.message);
        return;
      }
      setText(opened.text);
      setNotices(opened.notices);
      setMessage(opened.message || null);
    } catch (e) {
      if (pick === latestPick.current) setMessage(`Could not read this file: ${(e as Error).message}`);
    } finally {
      if (pick === latestPick.current) setBusy(false);
    }
  };

  const selectLine = (line: number) => {
    const ta = ref.current;
    if (!ta) return;
    const lines = text.split('\n');
    const start = lines.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
    ta.focus();
    ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  };

  const doImport = () => {
    if (hasPins && !window.confirm('Re-importing will clear your manual lute placements for the tab. Continue?')) return;
    onImport(preview, text);
  };

  const summary =
    `${cols} column${cols === 1 ? '' : 's'} found` +
    (preview.capo !== null ? ` · capo ${preview.capo}` : '') +
    (preview.tuning ? ` · tuning ${preview.tuning.name}` : '');

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import guitar tab">
      <div className="modal">
        <h2>Import guitar tab</h2>
        <p className="muted">Paste plain-text tab, or open a file: a PDF of plain-text tab, a MusicXML file with a tab staff (.musicxml, .mxl), or a text file.</p>
        <textarea
          ref={ref}
          data-testid="import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          spellCheck={false}
          wrap="off"
          aria-label="Tab text"
        />
        <div className="row">
          <label className="file-button">
            Open file…
            <input
              type="file"
              data-testid="import-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </label>
          {busy && <span className="muted">Reading file…</span>}
        </div>
        {notices.length > 0 && (
          <ul className="muted" data-testid="import-notices">
            {notices.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}
        {message && <p className="error" role="alert">{message}</p>}
        <p className="muted">{summary}</p>
        <WarningsPanel warnings={preview.warnings} onSelect={(w) => w.line && selectLine(w.line)} />
        <div className="row end">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" data-testid="do-import" disabled={cols === 0} onClick={doImport}>Import</button>
        </div>
      </div>
    </div>
  );
}
