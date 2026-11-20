import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { openImportFile } from '../../../src/import/openFile';
import type { XmlParser } from '../../../src/import/musicxml/xml';

// Local only: MUSICXML_SAMPLES=<folder of real scores>. The files never enter the repo.
const dir = process.env.MUSICXML_SAMPLES;
const parser = new DOMParser({ onError: () => {} }) as unknown as XmlParser;

describe.skipIf(!dir)('real scores', () => {
  const files = dir ? readdirSync(dir).filter((f) => /\.(mxl|musicxml|xml)$/i.test(f)) : [];
  it('finds some scores', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    it(`opens ${f}`, async () => {
      const r = await openImportFile(new Uint8Array(readFileSync(join(dir!, f))), {
        parser,
        extractPdfText: async () => '',
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.notices.filter((x) => /written pitches/i.test(x))).toEqual([]);
    });
  }
});
