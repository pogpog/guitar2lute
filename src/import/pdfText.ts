import { normalizeTabText } from '../core/parse/normalize';
export interface PdfTextItem { str: string; x: number; y: number; width: number; height: number; fontName: string; }

export const NOTATION_PDF_MESSAGE =
  'This PDF looks like it was produced by notation software (e.g. Guitar Pro or MuseScore). ' +
  'Only PDFs of plain-text tab are supported in this version. The extracted text is shown below.';

const PAGE_NUM = /^\s*(page\s*)?\d+(\s*(of|\/)\s*\d+)?\s*$/i;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function reconstructPage(items: PdfTextItem[]): { y: number; text: string }[] {
  const clean = items
    .map((i) => ({ ...i, str: i.str.replace(/[-]/g, '') }))
    .filter((i) => i.str.trim().length > 0);
  if (!clean.length) return [];
  const widths = new Map<string, number[]>();
  for (const i of clean) {
    if (i.width > 0) {
      const a = widths.get(i.fontName) ?? [];
      a.push(i.width / i.str.length);
      widths.set(i.fontName, a);
    }
  }
  const globalW = median([...widths.values()].flat()) || 6;
  const charWidth = (font: string) => median(widths.get(font) ?? []) || globalW;
  const tol = (median(clean.map((i) => i.height).filter((h) => h > 0)) || 10) / 2;
  const left = Math.min(...clean.map((i) => i.x));
  const sorted = [...clean].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines.map((l) => {
    let text = '';
    for (const it of [...l.items].sort((a, b) => a.x - b.x)) {
      const col = Math.round((it.x - left) / charWidth(it.fontName));
      if (col > text.length) text += ' '.repeat(col - text.length);
      text += it.str;
    }
    return { y: l.y, text: text.replace(/\s+$/, '') };
  });
}

function looksLikeTab(t: string): boolean {
  return t.includes('|') || /-{3,}/.test(t);
}

export function reconstructText(pages: PdfTextItem[][]): string {
  const pageLines = pages.map(reconstructPage);
  const edgeCounts = new Map<string, number>();
  for (const lines of pageLines) {
    if (!lines.length) continue;
    const edges = new Set([lines[0].text.trim(), lines[lines.length - 1].text.trim()]);
    for (const e of edges) edgeCounts.set(e, (edgeCounts.get(e) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const lines of pageLines) {
    lines.forEach((l, i) => {
      const t = l.text.trim();
      const edge = i === 0 || i === lines.length - 1;
      if (edge && !looksLikeTab(t)) {
        if (PAGE_NUM.test(t)) return;
        if (pageLines.length > 1 && (edgeCounts.get(t) ?? 0) >= 2) return;
      }
      out.push(l.text);
    });
  }
  return out.join('\n');
}

/** Numbers but no dash runs, even after PDF dashes (– — −) are normalised: drawn staff lines, not text tab. */
export function looksLikeNotationPdf(text: string): boolean {
  const t = normalizeTabText(text);
  return /\d/.test(t) && !/-{3,}/.test(t);
}
