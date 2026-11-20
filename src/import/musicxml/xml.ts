export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** The browser's `DOMParser`, or `@xmldom/xmldom`'s in unit tests; app code never imports xmldom. */
export interface XmlParser {
  parseFromString(text: string, type: 'application/xml'): Document;
}

const DAMAGED = 'Could not read this MusicXML file; it may be damaged.';

/** Parses XML, treating both failure styles as a damaged file: xmldom throws, the browser returns a `<parsererror>`. */
export function parseXml(text: string, parser: XmlParser): Document {
  let doc: Document;
  try {
    doc = parser.parseFromString(text, 'application/xml');
  } catch {
    throw new ImportError(DAMAGED);
  }
  if (!doc || !doc.documentElement || doc.getElementsByTagName('parsererror').length > 0) {
    throw new ImportError(DAMAGED);
  }
  return doc;
}

/** Direct child elements, optionally only those with the given tag name. */
export function childElements(el: Element, name?: string): Element[] {
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.nodeType === 1 && (name === undefined || node.nodeName === name)) out.push(node as Element);
  }
  return out;
}

/** Trimmed text of the first child element with this name, or null when there is none. */
export function childText(el: Element, name: string): string | null {
  const child = childElements(el, name)[0];
  return child ? (child.textContent ?? '').trim() : null;
}
