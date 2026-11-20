import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { makeZip } from '../helpers/zip';
import { openImportFile, type OpenDeps } from '../../src/import/openFile';
import { NOTATION_PDF_MESSAGE } from '../../src/import/pdfText';
import type { XmlParser } from '../../src/import/musicxml/xml';
import { n, score, tabAttrs } from './musicxml/build';

const parser = new DOMParser({ onError: () => {} }) as unknown as XmlParser;
const enc = (s: string) => new TextEncoder().encode(s);
const NOT_A_FILE = "This file isn't a PDF, MusicXML or text file.";
const DAMAGED = 'Could not read this MusicXML file; it may be damaged.';

const xml = score([{ id: 'P1', measures: [tabAttrs() + n({ s: 6, f: 0 }) + n({ s: 5, f: 2 })] }]);
const deps = (text = ''): OpenDeps => ({ parser, extractPdfText: async () => text });
const pdfBytes = enc('%PDF-1.4\n');

describe('openImportFile', () => {
  it('reads a text PDF through the extractor', async () => {
    const r = await openImportFile(pdfBytes, deps('e|---0---|\nB|---1---|'));
    expect(r).toEqual({ ok: true, text: 'e|---0---|\nB|---1---|', notices: [], message: null });
  });

  it('flags a PDF with no text', async () => {
    const r = await openImportFile(pdfBytes, deps('  \n'));
    expect(r).toMatchObject({ ok: true, message: 'No text found in this PDF. Scanned (image) PDFs are not supported.' });
  });

  it('flags a notation PDF but still places its text', async () => {
    const notation = 'Allegro 120\nmf cresc. 3 4\n';
    const r = await openImportFile(pdfBytes, deps(notation));
    expect(r).toMatchObject({ ok: true, text: notation, message: NOTATION_PDF_MESSAGE });
  });

  it('reports a PDF read error', async () => {
    const r = await openImportFile(pdfBytes, {
      parser,
      extractPdfText: async () => {
        throw new Error('boom');
      },
    });
    expect(r).toEqual({ ok: false, message: 'Could not read this PDF: boom' });
  });

  it('opens plain text as it is', async () => {
    const r = await openImportFile(enc('e|--0--|'), deps());
    expect(r).toEqual({ ok: true, text: 'e|--0--|', notices: [], message: null });
  });

  it('converts MusicXML', async () => {
    const r = await openImportFile(enc(xml), deps());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text.startsWith('Tuning: E2 A2 D3 G3 B3 E4\nCapo: 0\n')).toBe(true);
      expect(r.message).toBeNull();
    }
  });

  it('refuses score-timewise', async () => {
    const r = await openImportFile(enc('<score-timewise version="4.0"></score-timewise>'), deps());
    expect(r).toEqual({ ok: false, message: 'Only part-wise MusicXML is supported (what MuseScore and Guitar Pro write).' });
  });

  it('refuses other XML and unknown binary', async () => {
    expect(await openImportFile(enc('<html></html>'), deps())).toEqual({ ok: false, message: NOT_A_FILE });
    expect(await openImportFile(new Uint8Array([0, 1, 2, 3]), deps())).toEqual({ ok: false, message: NOT_A_FILE });
  });

  it('reports damaged XML', async () => {
    const r = await openImportFile(enc('<score-partwise><part-list></score-partwise>'), deps());
    expect(r).toEqual({ ok: false, message: DAMAGED });
  });

  it('reads an .mxl through its container', async () => {
    const container =
      '<?xml version="1.0"?><container><rootfiles><rootfile full-path="./sub\\score.xml"/></rootfiles></container>';
    const zip = makeZip([
      { name: 'META-INF/container.xml', data: container },
      { name: 'other.xml', data: '<html/>' },
      { name: 'sub/score.xml', data: xml },
    ]);
    const r = await openImportFile(zip, deps());
    expect(r.ok && r.text.includes('Tuning:')).toBe(true);
  });

  it('falls back when the container path is missing', async () => {
    const container = '<container><rootfiles><rootfile full-path="gone.xml"/></rootfiles></container>';
    const zip = makeZip([
      { name: 'META-INF/container.xml', data: container },
      { name: 'score.xml', data: xml },
    ]);
    const r = await openImportFile(zip, deps());
    expect(r.ok && r.text.includes('Tuning:')).toBe(true);
  });

  it('picks the score without a container, skipping [Content_Types].xml', async () => {
    const zip = makeZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'META-INF/other.xml', data: xml },
      { name: 'song.musicxml', data: xml },
    ]);
    const r = await openImportFile(zip, deps());
    expect(r.ok && r.text.includes('Tuning:')).toBe(true);
  });

  it('refuses a zip with no score', async () => {
    const zip = makeZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document/>' },
    ]);
    expect(await openImportFile(zip, deps())).toEqual({ ok: false, message: NOT_A_FILE });
  });

  it('refuses a timewise score inside an .mxl', async () => {
    const zip = makeZip([
      { name: 'META-INF/container.xml', data: '<container><rootfiles><rootfile full-path="t.xml"/></rootfiles></container>' },
      { name: 't.xml', data: '<score-timewise/>' },
    ]);
    const r = await openImportFile(zip, deps());
    expect(r).toEqual({ ok: false, message: 'Only part-wise MusicXML is supported (what MuseScore and Guitar Pro write).' });
  });

  it('refuses a non-MusicXML container target', async () => {
    const zip = makeZip([
      { name: 'META-INF/container.xml', data: '<container><rootfiles><rootfile full-path="t.xml"/></rootfiles></container>' },
      { name: 't.xml', data: '<html/>' },
    ]);
    expect(await openImportFile(zip, deps())).toEqual({ ok: false, message: NOT_A_FILE });
  });

  it('reports a damaged zip', async () => {
    const r = await openImportFile(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]), deps());
    expect(r.ok).toBe(false);
  });
});
