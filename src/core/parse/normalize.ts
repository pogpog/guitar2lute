export function expandTabs(line: string, width = 8): string {
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(width - (out.length % width));
    else out += ch;
  }
  return out;
}

/** Clean text before parsing. Repeat marks are rewritten without changing column widths. */
export function normalizeTabText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      expandTabs(line)
        .replace(/ /g, ' ')
        .replace(/[‐-―−]/g, '-')
        .replace(/‖/g, '|')
        .replace(/\|:/g, '|-')
        .replace(/:\|/g, '-|')
        .replace(/\*\|/g, '-|')
        .replace(/\|\*/g, '|-'),
    )
    .join('\n');
}
