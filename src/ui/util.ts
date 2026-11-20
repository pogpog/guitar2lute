/** The integer a number field holds, or null while it is incomplete ('', '-', '1' on the way to '10') or out of range. */
export function parseIntInRange(v: string, lo: number, hi: number): number | null {
  if (!/^\s*-?\d+\s*$/.test(v)) return null;
  const n = Number(v);
  return n >= lo && n <= hi ? n : null;
}

export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'piece';
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function svgMarkup(el: SVGSVGElement): string {
  const clone = el.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('color', '#111111');
  return new XMLSerializer().serializeToString(clone);
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lays the SVGs side by side in one SVG; with `labels`, each is titled (e.g. with its chord name). */
export function combineSvgs(els: SVGSVGElement[], gap = 12, labels?: string[]): string {
  const labelH = labels ? 18 : 0;
  let x = 0;
  let h = 0;
  const parts = els.map((el, i) => {
    const w = Number(el.getAttribute('width'));
    h = Math.max(h, Number(el.getAttribute('height')) + labelH);
    const label = labels?.[i]
      ? `<text x="${x + w / 2}" y="13" text-anchor="middle" font-size="13" font-weight="bold" fill="currentColor">${escapeXml(labels[i])}</text>`
      : '';
    const g = `${label}<g transform="translate(${x},${labelH})">${el.innerHTML}</g>`;
    x += w + gap;
    return g;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" color="#111111" width="${x}" height="${h}" viewBox="0 0 ${x} ${h}">${parts.join('')}</svg>`;
}
