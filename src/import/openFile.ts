import { looksLikeNotationPdf, NOTATION_PDF_MESSAGE } from './pdfText';
import { musicXmlToTabText } from './musicxml';
import { ImportError, parseXml, type XmlParser } from './musicxml/xml';
import { sniff } from './sniff';
import { listZip } from './unzip';

export type OpenedFile =
  | { ok: true; text: string; notices: string[]; message: string | null }
  | { ok: false; message: string };

export interface OpenDeps {
  parser: XmlParser;
  /** Passed in so pdf.js stays lazy-loaded by the caller. */
  extractPdfText: (data: ArrayBuffer) => Promise<string>;
}

const NOT_A_FILE = "This file isn't a PDF, MusicXML or text file.";
const TIMEWISE = 'Only part-wise MusicXML is supported (what MuseScore and Guitar Pro write).';
const DAMAGED = 'Could not read this MusicXML file; it may be damaged.';

const normalise = (name: string): string => name.replace(/\\/g, '/').replace(/^(\.\/)+/, '');

async function openPdf(bytes: Uint8Array, deps: OpenDeps): Promise<OpenedFile> {
  try {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const text = await deps.extractPdfText(copy);
    let message: string | null = null;
    if (!text.trim()) message = 'No text found in this PDF. Scanned (image) PDFs are not supported.';
    else if (looksLikeNotationPdf(text)) message = NOTATION_PDF_MESSAGE;
    return { ok: true, text, notices: [], message };
  } catch (e) {
    return { ok: false, message: `Could not read this PDF: ${(e as Error).message}` };
  }
}

function convert(xmlText: string, deps: OpenDeps): OpenedFile {
  const { text, notices } = musicXmlToTabText(xmlText, deps.parser);
  return { ok: true, text, notices, message: null };
}

async function openZip(bytes: Uint8Array, deps: OpenDeps): Promise<OpenedFile> {
  const entries = listZip(bytes);
  const byName = new Map(entries.map((e) => [normalise(e.name), e]));

  let root = null as (typeof entries)[number] | null;
  const container = byName.get('META-INF/container.xml');
  if (container) {
    try {
      const doc = parseXml(new TextDecoder().decode(await container.read()), deps.parser);
      const path = doc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
      if (path) root = byName.get(normalise(path.trim())) ?? null;
    } catch (e) {
      if (!(e instanceof ImportError)) throw e;
    }
  }

  if (root) {
    const s = sniff(await root.read());
    if (s.kind === 'timewise') return { ok: false, message: TIMEWISE };
    return s.kind === 'musicxml' ? convert(s.text, deps) : { ok: false, message: NOT_A_FILE };
  }

  for (const [name, entry] of byName) {
    if (!/\.(xml|musicxml)$/i.test(name) || name.startsWith('META-INF/')) continue;
    const s = sniff(await entry.read());
    if (s.kind === 'musicxml') return convert(s.text, deps);
  }
  return { ok: false, message: NOT_A_FILE };
}

/** Opens a PDF, MusicXML, `.mxl` or text file from its bytes. Never throws. */
export async function openImportFile(bytes: Uint8Array, deps: OpenDeps): Promise<OpenedFile> {
  const s = sniff(bytes);
  try {
    switch (s.kind) {
      case 'pdf':
        return await openPdf(bytes, deps);
      case 'zip':
        return await openZip(bytes, deps);
      case 'musicxml':
        return convert(s.text, deps);
      case 'timewise':
        return { ok: false, message: TIMEWISE };
      case 'text':
        return { ok: true, text: s.text, notices: [], message: null };
      default:
        return { ok: false, message: NOT_A_FILE };
    }
  } catch (e) {
    return { ok: false, message: e instanceof ImportError ? e.message : DAMAGED };
  }
}
