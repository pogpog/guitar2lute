import { useMemo, useRef, useState } from 'react';
import { importTabText, type TextImport } from '../core/parse/importText';
import { looksLikeNotationPdf, NOTATION_PDF_MESSAGE } from '../import/pdfText';
import { WarningsPanel } from './WarningsPanel';

export interface ImportDialogProps {
  initialText: string;
  hasPins: boolean;
  onImport: (imp: TextImport, text: string) => void;
  onClose: () => void;
}

export function ImportDialog({ initialText, hasPins, onImport, onClose }: ImportDialogProps) {
  const [text, setText] = useState(initialText);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const preview = useMemo(() => importTabText(text), [text]);
  const cols = preview.events.filter((e) => e.kind === 'col').length;

  const onPdf = async (file: File) => {
    setBusy(true);
    setPdfMessage(null);
    try {
      const { extractPdfText } = await import('../import/pdf');
      const extracted = await extractPdfText(await file.arrayBuffer());
      if (!extracted.trim()) setPdfMessage('No text found in this PDF. Scanned (image) PDFs are not supported.');
      else if (looksLikeNotationPdf(extracted)) setPdfMessage(NOTATION_PDF_MESSAGE);
      setText(extracted);
    } catch (e) {
      setPdfMessage(`Could not read this PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
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
        <p className="muted">Paste plain-text tab, or upload a PDF that contains plain-text tab.</p>
        <textarea
          ref={ref}
          data-testid="import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          spellCheck={false}
          aria-label="Tab text"
        />
        <div className="row">
          <label className="file-button">
            Upload PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              data-testid="pdf-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPdf(f);
                e.target.value = '';
              }}
            />
          </label>
          {busy && <span className="muted">Reading PDF…</span>}
        </div>
        {pdfMessage && <p className="error" role="alert">{pdfMessage}</p>}
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
