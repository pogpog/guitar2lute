// Builds small MusicXML scores for tests. Third-party scores never enter the repo.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STEPS = 'CDEFGAB';

/** 'F#3' → `<step>F</step><alter>1</alter><octave>3</octave>`, inside `<pitch>` or `<staff-tuning>` (with a prefix). */
function pitchParts(name: string, prefix = ''): string {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(name);
  if (!m || !STEPS.includes(m[1])) throw new Error(`Bad pitch ${name}`);
  const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (
    `<${prefix}step>${m[1]}</${prefix}step>` +
    (alter ? `<${prefix}alter>${alter}</${prefix}alter>` : '') +
    `<${prefix}octave>${m[3]}</${prefix}octave>`
  );
}

/**
 * A whole score. Each measure string is wrapped in `<measure number="i+1">`
 * unless it already starts with `<measure` (to set `number` or `implicit` yourself).
 */
export function score(
  parts: { id: string; name?: string; measures: string[] }[],
  opts: { credits?: string[] } = {},
): string {
  const credits = (opts.credits ?? [])
    .map((c) => `<credit page="1"><credit-words>${esc(c)}</credit-words></credit>`)
    .join('');
  const list = parts
    .map((p) => `<score-part id="${esc(p.id)}"><part-name>${esc(p.name ?? p.id)}</part-name></score-part>`)
    .join('');
  const body = parts
    .map((p) => {
      const ms = p.measures
        .map((m, i) => (m.trimStart().startsWith('<measure') ? m : `<measure number="${i + 1}">${m}</measure>`))
        .join('');
      return `<part id="${esc(p.id)}">${ms}</part>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<score-partwise version="4.0">${credits}<part-list>${list}</part-list>${body}</score-partwise>`
  );
}

/**
 * One `<note>`. Defaults: a quarter (`d` 1 at divisions 1), voice 1, staff unset (staff 1).
 * Without `pitch`, `rest` or `grace` options the note has no `<pitch>` (the reader does not need one).
 */
export function n(o: {
  s?: number;
  f?: number;
  d?: number;
  v?: number;
  chord?: boolean;
  staff?: number;
  pitch?: string;
  rest?: boolean;
  grace?: boolean;
  tie?: 'start' | 'stop';
  tied?: 'stop' | 'continue';
  cue?: boolean;
  head?: string;
  harmonic?: boolean;
}): string {
  let x = '<note>';
  if (o.grace) x += '<grace/>';
  if (o.cue) x += '<cue/>';
  if (o.chord) x += '<chord/>';
  if (o.rest) x += '<rest/>';
  else if (o.pitch) x += `<pitch>${pitchParts(o.pitch)}</pitch>`;
  if (!o.grace) x += `<duration>${o.d ?? 1}</duration>`;
  if (o.tie) x += `<tie type="${o.tie}"/>`;
  x += `<voice>${o.v ?? 1}</voice>`;
  if (o.head) x += `<notehead>${esc(o.head)}</notehead>`;
  if (o.staff !== undefined) x += `<staff>${o.staff}</staff>`;
  const technical =
    (o.harmonic ? '<harmonic/>' : '') +
    (o.s !== undefined ? `<string>${o.s}</string>` : '') +
    (o.f !== undefined ? `<fret>${o.f}</fret>` : '');
  const notations = (o.tied ? `<tied type="${o.tied}"/>` : '') + (technical ? `<technical>${technical}</technical>` : '');
  if (notations) x += `<notations>${notations}</notations>`;
  return x + '</note>';
}

const STANDARD = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

/**
 * `<attributes>` for a tab staff. Defaults: divisions 1, 4/4, one staff, standard tuning.
 * With `staves` > 1 every other staff gets a treble clef and the tab clef and staff-details
 * carry `number` = `tabStaff` (default the last staff). `tuning: []` writes no `<staff-tuning>`.
 */
export function tabAttrs(
  o: {
    divisions?: number;
    tuning?: string[];
    staves?: number;
    tabStaff?: number;
    capo?: number;
    lines?: number;
    beats?: string;
    transpose?: { chromatic: number; octave: number; number?: number };
  } = {},
): string {
  const staves = o.staves ?? 1;
  const tabStaff = o.tabStaff ?? staves;
  const numbered = staves > 1 || o.tabStaff !== undefined;
  const num = numbered ? ` number="${tabStaff}"` : '';
  const [beats, beatType] = (o.beats ?? '4/4').split('/');
  const tuning = o.tuning ?? STANDARD;
  const lines = o.lines ?? (tuning.length > 0 ? tuning.length : undefined);

  let x = `<attributes><divisions>${o.divisions ?? 1}</divisions>`;
  x += `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`;
  if (staves > 1) x += `<staves>${staves}</staves>`;
  for (let i = 1; i <= staves; i++) {
    if (i === tabStaff) x += `<clef${num}><sign>TAB</sign><line>5</line></clef>`;
    else x += `<clef number="${i}"><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>`;
  }
  x += `<staff-details${num}>`;
  if (lines !== undefined) x += `<staff-lines>${lines}</staff-lines>`;
  tuning.forEach((t, i) => {
    x += `<staff-tuning line="${i + 1}">${pitchParts(t, 'tuning-')}</staff-tuning>`;
  });
  if (o.capo !== undefined) x += `<capo>${o.capo}</capo>`;
  x += '</staff-details>';
  if (o.transpose) {
    const tn = o.transpose.number !== undefined ? ` number="${o.transpose.number}"` : '';
    x += `<transpose${tn}><chromatic>${o.transpose.chromatic}</chromatic><octave-change>${o.transpose.octave}</octave-change></transpose>`;
  }
  return x + '</attributes>';
}

export function backup(d: number): string {
  return `<backup><duration>${d}</duration></backup>`;
}

/** A `<forward>` without `<voice>`. */
export function forward(d: number): string {
  return `<forward><duration>${d}</duration></forward>`;
}

export function words(text: string): string {
  return `<direction placement="above"><direction-type><words>${esc(text)}</words></direction-type></direction>`;
}

export function print(o: { system?: boolean; page?: boolean }): string {
  return `<print${o.system ? ' new-system="yes"' : ''}${o.page ? ' new-page="yes"' : ''}/>`;
}
