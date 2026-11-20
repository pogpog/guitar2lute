import type { TabEvent, Tuning, Warning } from '../model';
import { parseAsciiTab } from './asciiTab';
import { parseHeaders } from './headers';
import { inferGuitarTuning } from '../tunings';

export interface TextImport { events: TabEvent[]; warnings: Warning[]; tuning: Tuning | null; capo: number | null; }

export function importTabText(text: string): TextImport {
  const headers = parseHeaders(text);
  const parsed = parseAsciiTab(text);
  let tuning = headers.tuning;
  if (!tuning && parsed.labels && parsed.labels.length === 6) tuning = inferGuitarTuning(parsed.labels);
  return { events: parsed.events, warnings: parsed.warnings, tuning, capo: headers.capo };
}
