import { reconstructText, type PdfTextItem } from './pdfText';

interface RawItem { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string; }

/** Lazy-loads pdf.js so it is only downloaded (and precached) when needed. */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  try {
    const pages: PdfTextItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        (content.items as unknown as RawItem[]).flatMap((it) =>
          typeof it.str === 'string' && it.transform
            ? [{
                str: it.str,
                x: it.transform[4],
                y: it.transform[5],
                width: it.width ?? 0,
                height: it.height || Math.hypot(it.transform[2], it.transform[3]),
                fontName: it.fontName ?? '',
              }]
            : [],
        ),
      );
    }
    return reconstructText(pages);
  } finally {
    await doc.destroy();
  }
}
