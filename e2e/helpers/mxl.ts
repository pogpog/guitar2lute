import { makeZip } from '../../tests/helpers/zip';

export { makeZip };

const TUNING = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

const note = (s: number, f: number) =>
  `<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><notations><technical><string>${s}</string><fret>${f}</fret></technical></notations></note>`;

/** A tiny hand-written tab score: standard tuning, "Capo III", four quarter notes. */
export const TINY_SCORE =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>' +
  '<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>' +
  '<clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>6</staff-lines>' +
  TUNING.map((t, i) => `<staff-tuning line="${i + 1}"><tuning-step>${t[0]}</tuning-step><tuning-octave>${t[1]}</tuning-octave></staff-tuning>`).join('') +
  '</staff-details></attributes>' +
  '<direction placement="above"><direction-type><words>Capo III</words></direction-type></direction>' +
  note(5, 0) + note(3, 2) + note(2, 1) + note(1, 0) +
  '</measure></part></score-partwise>';

export function tinyMxl(): Buffer {
  const container =
    '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>';
  return Buffer.from(
    makeZip([
      { name: 'META-INF/container.xml', data: container },
      { name: 'score.musicxml', data: TINY_SCORE },
    ]),
  );
}
