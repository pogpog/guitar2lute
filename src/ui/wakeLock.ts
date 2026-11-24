interface WakeLockSentinelLike {
  release(): Promise<void>;
}
export interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}
type VisibilityDoc = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

/**
 * Keep the screen awake until the returned function is called. Browsers drop the lock whenever the
 * page is hidden, so it is asked for again each time the page becomes visible. Where wake locks
 * aren't supported, or a request is refused, the screen just follows its usual timeout.
 */
export function holdWakeLock(nav: WakeLockNavigator, doc: VisibilityDoc): () => void {
  let held: WakeLockSentinelLike | null = null;
  let released = false;
  const request = () => {
    nav.wakeLock
      ?.request('screen')
      .then((s) => {
        if (released) void s.release().catch(() => {});
        else held = s;
      })
      .catch(() => {});
  };
  const onVisibility = () => {
    if (doc.visibilityState === 'visible') request();
  };
  request();
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    released = true;
    doc.removeEventListener('visibilitychange', onVisibility);
    void held?.release().catch(() => {});
    held = null;
  };
}
