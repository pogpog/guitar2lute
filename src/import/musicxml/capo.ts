const ROMAN: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
};

const SEP = '[\\s:.,;\\-–—]*';
/** After "capo": optional "on"/"at", optional "fret", then the number. */
const AFTER = new RegExp(`^${SEP}(?:(?:on|at)\\b${SEP})?(?:the\\b${SEP})?(?:fret\\b${SEP})?(?:the\\b${SEP})?(\\d{1,2}(?:st|nd|rd|th)?|[IVXivx]+)(?![A-Za-z0-9])`);

/**
 * The capo a text names: "capo" (never "Da Capo"), then an Arabic number 1–99 or a Roman I–XII
 * ("Capo III", "capo at fret 3", "Capo on the 3rd fret"). The reader range-checks the result (above 12 is not usable).
 */
export function capoFromText(text: string): number | null {
  for (const m of text.matchAll(/(?<![A-Za-z])capo(?![A-Za-z])/gi)) {
    const index = m.index ?? 0;
    if (/(?<![A-Za-z])da[\s-]+$/i.test(text.slice(0, index))) continue;
    const after = AFTER.exec(text.slice(index + m[0].length));
    if (!after) continue;
    const token = after[1];
    const value = /^\d/.test(token) ? parseInt(token, 10) : (ROMAN[token.toUpperCase()] ?? 0);
    if (value >= 1 && value <= 99) return value;
  }
  return null;
}
