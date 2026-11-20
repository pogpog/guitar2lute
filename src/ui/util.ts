export function clampInt(v: string, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || v.trim() === '') return lo;
  return Math.min(hi, Math.max(lo, n));
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

export function combineSvgs(els: SVGSVGElement[], gap = 12): string {
  let x = 0;
  let h = 0;
  const parts = els.map((el) => {
    const w = Number(el.getAttribute('width'));
    h = Math.max(h, Number(el.getAttribute('height')));
    const g = `<g transform="translate(${x},0)">${el.innerHTML}</g>`;
    x += w + gap;
    return g;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" color="#111111" width="${x}" height="${h}" viewBox="0 0 ${x} ${h}">${parts.join('')}</svg>`;
}
