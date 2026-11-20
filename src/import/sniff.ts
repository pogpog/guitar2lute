export type Sniffed =
  | { kind: 'pdf' }
  | { kind: 'zip' }
  | { kind: 'musicxml'; text: string }
  | { kind: 'timewise' }
  | { kind: 'text'; text: string }
  | { kind: 'unknown' };

export const MAX_TEXT_BYTES = 1024 * 1024;

const PDF_WINDOW = 1024;

function hasPdfMarker(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, PDF_WINDOW) - 3;
  for (let i = 0; i < end; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46) return true;
  }
  return false;
}

function decode(label: string, bytes: Uint8Array): string {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// Name of the first tag after whitespace, the XML declaration, comments,
// processing instructions and a DOCTYPE; null if there is none.
export function xmlRootName(text: string): string | null {
  let i = 0;
  const n = text.length;
  for (;;) {
    while (i < n && /\s|﻿/.test(text[i])) i++;
    if (i >= n || text[i] !== '<') return null;
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end < 0) return null;
      i = end + 2;
    } else if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) return null;
      i = end + 3;
    } else if (text.startsWith('<!', i)) {
      // DOCTYPE: ends at the first '>' outside quotes and an internal [subset].
      let depth = 0;
      let quote = '';
      i += 2;
      for (; i < n; i++) {
        const c = text[i];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (i >= n) return null;
      i++;
    } else {
      const m = /^<([A-Za-z_:][^\s/>]*)/.exec(text.slice(i, i + 256));
      return m ? m[1] : null;
    }
  }
}

function classifyRoot(root: string, readText: () => string): Sniffed {
  if (root === 'score-partwise') return { kind: 'musicxml', text: readText() };
  if (root === 'score-timewise') return { kind: 'timewise' };
  return { kind: 'unknown' };
}

const SCAN_PREFIX = 64 * 1024;

// Root name found in a decoded prefix of `body`. The prefix grows only while
// it ends inside a prologue that still looks like XML (starts with '<').
function scanRoot(body: Uint8Array, label: string): { root: string | null; head: string } {
  for (let len = SCAN_PREFIX; ; len *= 2) {
    const head = decode(label, body.subarray(0, len));
    const root = xmlRootName(head);
    if (root !== null || len >= body.length || !/^[\s\uFEFF]*</.test(head)) return { root, head };
  }
}

export function sniff(bytes: Uint8Array): Sniffed {
  if (hasPdfMarker(bytes)) return { kind: 'pdf' };
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) return { kind: 'zip' };

  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    const label = bytes[0] === 0xff ? 'utf-16le' : 'utf-16be';
    const { root } = scanRoot(bytes, label);
    return root === null ? { kind: 'unknown' } : classifyRoot(root, () => decode(label, bytes));
  }

  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const body = bytes.subarray(start);
  const { root, head } = scanRoot(body, 'latin1');
  if (root !== null) {
    const declared = /^\s*<\?xml[^>]*?\bencoding\s*=\s*["']([^"']+)["']/.exec(head.slice(0, 512));
    return classifyRoot(root, () => decode(declared ? declared[1] : 'utf-8', body));
  }

  if (bytes.length > MAX_TEXT_BYTES || bytes.includes(0)) return { kind: 'unknown' };
  try {
    return { kind: 'text', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { kind: 'text', text: new TextDecoder('windows-1252').decode(bytes) };
  }
}
