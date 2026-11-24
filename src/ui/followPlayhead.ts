/** How close (px) the playing note may get to the right edge before the view moves on. */
const EDGE = 40;

/**
 * The scrollLeft that keeps the playing note in view, or null to leave the scroll alone.
 * `note` is in the scrolled content's coordinates. When the note leaves the view, or nears
 * its right edge, it is brought to a quarter of the way in, so the view moves in steps.
 */
export function followScroll(note: { left: number; right: number }, view: { scrollLeft: number; width: number }): number | null {
  const inView = note.left >= view.scrollLeft && note.right <= view.scrollLeft + view.width - EDGE;
  if (inView) return null;
  return Math.max(0, Math.round(note.left - view.width / 4));
}

/** Scroll `container` (horizontally) and the page (vertically) so its playing note can be seen. */
export function followPlayingNote(container: HTMLElement): void {
  const mark = container.querySelector('mark.playing');
  if (!mark) return;
  const box = container.getBoundingClientRect();
  const m = mark.getBoundingClientRect();
  const left = m.left - box.left + container.scrollLeft;
  const target = followScroll({ left, right: left + m.width }, { scrollLeft: container.scrollLeft, width: box.width });
  if (target !== null) container.scrollLeft = target;
  const after = mark.getBoundingClientRect();
  if (after.top < 0 || after.bottom > window.innerHeight) mark.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
