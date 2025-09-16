let wakeLock: any = null;
let reAcquireHandler: (() => void) | null = null;

export async function requestScreenWakeLock(): Promise<boolean> {
  try {
    // Only modern browsers (Chromium/Android) support this.
    const nav: any = navigator as any;
    if (!('wakeLock' in nav)) return false;
    wakeLock = await nav.wakeLock.request('screen');
    // Re-acquire on visibility changes when page becomes visible again
    const onVisibility = async () => {
      try {
        if (document.visibilityState === 'visible' && !wakeLock) {
          wakeLock = await nav.wakeLock.request('screen');
        }
      } catch {}
    };
    reAcquireHandler = onVisibility;
    document.addEventListener('visibilitychange', onVisibility);
    return true;
  } catch {
    return false;
  }
}

export function releaseScreenWakeLock(): void {
  try {
    if (wakeLock && typeof wakeLock.release === 'function') {
      wakeLock.release();
    }
  } catch {}
  wakeLock = null;
  if (reAcquireHandler) {
    document.removeEventListener('visibilitychange', reAcquireHandler);
    reAcquireHandler = null;
  }
}

