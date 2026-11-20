export const AM_ARPEGGIO = [
  'e|-------0---|',
  'B|-----1---1-|',
  'G|---2-------|',
  'D|-----------|',
  'A|-0---------|',
  'E|-----------|',
].join('\n');

export const TWO_DIGIT = [
  'e|--10--12--|',
  'B|---8---10-|',
  'G|----------|',
  'D|----------|',
  'A|----------|',
  'E|----------|',
].join('\n');

const messyTab = [
  '|--7b9--5--x--<12>--|',
  '|-------------------|',
  '|-------------------|',
  '|-------------------|',
  '|-------------------|',
  '|-------------------|',
].map((l) => l.replace(/-/g, '–'));
export const MESSY = ['Capo 2', 'Tuning: Drop D', '', ...messyTab].join('\r\n');

export const WITH_LYRICS_AND_COUNTS = [
  'Am        G',
  '|---1---2---|',
  'e|---0---3---|',
  'B|---1---0---|',
  'G|---2---0---|',
  'D|---2---0---|',
  'A|---0---2---|',
  'E|-------3---|',
  'la la la',
].join('\n');

export const TWO_BLOCKS_NO_GAP = [AM_ARPEGGIO, AM_ARPEGGIO].join('\n');

export const MIXED_LABEL_WIDTHS = [
  'e  |--0--|',
  'B |--1--|',
  'G |--0--|',
  'D#|--2--|',
  'A |--3--|',
  'E |-----|',
].join('\n');

export const REPEATS = [
  'e|:--0--:|  x4',
  'B|:-----:|',
  'G|:-----:|',
  'D|:-----:|',
  'A|:-----:|',
  'E|:-----:|',
].join('\n');

/** Real-world variations that must not lose blocks or shift strings. */
export const TRAILING_TEXT = [
  'e|-------0---|  let ring',
  'B|-----1---1-| PM',
  'G|---2-------|',
  'D|-----------|',
  'A|-0---------|  (x2)',
  'E|-----------|',
].join('\n');

export const COLON_LABELS = AM_ARPEGGIO.replace(/^([eBGDAE])\|/gm, '$1:');

export const TWO_BLOCKS_AND_COUNT = [AM_ARPEGGIO, AM_ARPEGGIO, '|-1---2---3---4|'].join('\n');

export const COUNT_ABOVE_UNLABELLED = ['|---1-----2--|', ...AM_ARPEGGIO.split('\n').map((l) => l.slice(1))].join('\n');

export const WITH_TAB_CHARACTERS = AM_ARPEGGIO.split('\n').map((l) => `\t${l}`).join('\r\n');
