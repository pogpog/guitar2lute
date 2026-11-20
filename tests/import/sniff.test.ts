import { describe, expect, it, vi } from 'vitest';
import { MAX_TEXT_BYTES, sniff, xmlRootName } from '../../src/import/sniff';

const enc = new TextEncoder();
const bytes = (...parts: (string | number[])[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...enc.encode(p)] : p)));
const latin1 = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const utf16 = (s: string, le: boolean): number[] => {
  const out = le ? [0xff, 0xfe] : [0xfe, 0xff];
  for (const c of s) {
    const u = c.charCodeAt(0);
    out.push(...(le ? [u & 255, u >> 8] : [u >> 8, u & 255]));
  }
  return out;
};

const SCORE = '<score-partwise version="4.0"><work><work-title>Étude</work-title></work></score-partwise>';

describe('sniff', () => {
  it('detects PDF at byte 0', () => {
    expect(sniff(bytes('%PDF-1.7\n'))).toEqual({ kind: 'pdf' });
  });
  it('detects PDF after junk bytes', () => {
    expect(sniff(bytes(new Array(20).fill(0x41), '%PDF-1.4'))).toEqual({ kind: 'pdf' });
  });
  it('detects a zip by its signature', () => {
    expect(sniff(bytes([0x50, 0x4b, 3, 4, 0, 0]))).toEqual({ kind: 'zip' });
  });
  it('reads XML with a declaration', () => {
    const s = sniff(bytes('<?xml version="1.0" encoding="UTF-8"?>\n', SCORE));
    expect(s.kind).toBe('musicxml');
    expect(s.kind === 'musicxml' && s.text).toContain('Étude');
  });
  it('reads XML starting with a DOCTYPE', () => {
    const s = sniff(bytes('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n', SCORE));
    expect(s.kind).toBe('musicxml');
  });
  it('reads XML starting with a comment', () => {
    expect(sniff(bytes('<!-- hi <score-timewise> -->\n', SCORE)).kind).toBe('musicxml');
  });
  it('reads UTF-16 LE and BE with a BOM', () => {
    for (const le of [true, false]) {
      const s = sniff(Uint8Array.from(utf16('<?xml version="1.0" encoding="UTF-16"?>' + SCORE, le)));
      expect(s.kind).toBe('musicxml');
      expect(s.kind === 'musicxml' && s.text).toContain('Étude');
    }
  });
  it('skips a UTF-8 BOM before <?xml', () => {
    const s = sniff(bytes([0xef, 0xbb, 0xbf], '<?xml version="1.0"?>', SCORE));
    expect(s.kind).toBe('musicxml');
    expect(s.kind === 'musicxml' && s.text.charCodeAt(0)).toBe('<'.charCodeAt(0));
  });
  it('decodes the declared ISO-8859-1 encoding', () => {
    const s = sniff(bytes('<?xml version="1.0" encoding="ISO-8859-1"?><score-partwise><work-title>Caf', [0xe9], '</work-title></score-partwise>'));
    expect(s.kind).toBe('musicxml');
    expect(s.kind === 'musicxml' && s.text).toContain('Café');
  });
  it('reports score-timewise', () => {
    expect(sniff(bytes('<score-timewise/>'))).toEqual({ kind: 'timewise' });
  });
  it('rejects other XML roots', () => {
    expect(sniff(bytes('<html><body/></html>'))).toEqual({ kind: 'unknown' });
  });
  it('passes plain UTF-8 text through', () => {
    expect(sniff(bytes('e|--0--|\nTitle: Café\n'))).toEqual({ kind: 'text', text: 'e|--0--|\nTitle: Café\n' });
  });
  it('drops a BOM from UTF-8 text', () => {
    expect(sniff(bytes([0xef, 0xbb, 0xbf], 'e|-0-|'))).toEqual({ kind: 'text', text: 'e|-0-|' });
  });
  it('decodes non UTF-8 text as Windows-1252', () => {
    expect(sniff(Uint8Array.from(latin1('Caf').concat([0xe9])))).toEqual({ kind: 'text', text: 'Café' });
  });
  it('refuses text over 1 MB', () => {
    expect(sniff(new Uint8Array(MAX_TEXT_BYTES).fill(0x61)).kind).toBe('text');
    expect(sniff(new Uint8Array(MAX_TEXT_BYTES + 1).fill(0x61))).toEqual({ kind: 'unknown' });
  });
  it('refuses bytes with a NUL', () => {
    expect(sniff(bytes('abc', [0], 'def'))).toEqual({ kind: 'unknown' });
  });
});

describe('sniff on large input', () => {
  it('classifies a multi-MB non-XML buffer', () => {
    expect(sniff(new Uint8Array(5 * 1024 * 1024).fill(0x61))).toEqual({ kind: 'unknown' });
  });
  it('finds the root after a prologue longer than the scan prefix', () => {
    const comment = '<!--' + 'x'.repeat(200 * 1024) + '-->';
    for (const head of [comment, '<?xml version="1.0" encoding="ISO-8859-1"?>' + comment]) {
      const s = sniff(bytes(head, '<score-partwise><work-title>Caf', [0xe9], '</work-title></score-partwise>'));
      expect(s.kind).toBe('musicxml');
      if (head !== comment) expect(s.kind === 'musicxml' && s.text).toContain('Café');
    }
    expect(sniff(bytes(comment, '<score-timewise/>'))).toEqual({ kind: 'timewise' });
  });
  it('reads a root tag straddling the end of the prefix', () => {
    const P = 64 * 1024;
    for (const before of [3, 5, 6, 12, 16, 40]) {
      const pad = (n: number) => '<!--' + 'x'.repeat(n - 7) + '-->';
      // Latin-1: root tag starts `before` bytes before the 64 KB mark.
      const l = sniff(bytes(pad(P - before), '<score-partwise/>'));
      expect(l.kind, `latin1 ${before}`).toBe('musicxml');
      // UTF-16: `before` characters (the prefix is 32K characters).
      const u = sniff(Uint8Array.from(utf16(pad(P / 2 - before) + '<score-partwise/>', true)));
      expect(u.kind, `utf16 ${before}`).toBe('musicxml');
    }
  });
  it('never decodes more than the prefix of a large non-XML buffer', () => {
    const spy = vi.spyOn(TextDecoder.prototype, 'decode');
    try {
      const plain = new Uint8Array(5 * 1024 * 1024).fill(0x61);
      const angle = new Uint8Array(5 * 1024 * 1024).fill(0x61);
      angle.set(enc.encode('<12>'));
      expect(sniff(plain)).toEqual({ kind: 'unknown' });
      expect(sniff(angle)).toEqual({ kind: 'unknown' });
      for (const call of spy.mock.calls) {
        expect((call[0] as Uint8Array).byteLength).toBeLessThanOrEqual(64 * 1024);
      }
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('finds a UTF-16 root after a long prologue', () => {
    const s = sniff(Uint8Array.from(utf16('<!--' + 'x'.repeat(100 * 1024) + '-->' + SCORE, true)));
    expect(s.kind).toBe('musicxml');
  });
});

describe('xmlRootName', () => {
  it('skips declaration, comments, PIs and DOCTYPE with internal subset', () => {
    expect(xmlRootName('<?xml version="1.0"?>\n<!-- c -->\n<?pi x?>\n<!DOCTYPE a [<!ENTITY e "<b>">]>\n<a x="1"/>')).toBe('a');
  });
  it('returns null when there is no tag', () => {
    expect(xmlRootName('just text')).toBeNull();
    expect(xmlRootName('<!-- unterminated')).toBeNull();
  });
});
