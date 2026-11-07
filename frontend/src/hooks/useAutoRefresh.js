import { useEffect, useRef } from 'react';

/**
 * Periodically calls `callback` while:
 *   - the tab is visible (unless pauseWhenHidden is false)
 *   - the previous call has completed (inFlight guard)
 *   - the component is still mounted
 *
 * On tab return, fires immediately so state is fresh before the user
 * interacts. Never throws — errors are swallowed so silent refreshes
 * can't crash the page.
 */
export function useAutoRefresh(callback, intervalMs = 5000, options = {}) {
  const { enabled = true, pauseWhenHidden = true } = options;
  const savedCallback = useRef(callback);
  const inFlight = useRef(false);

  // Keep the latest callback without restarting the interval every render
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      if (pauseWhenHidden && document.visibilityState !== 'visible') return;
      if (inFlight.current) return;

      inFlight.current = true;
      try {
        await savedCallback.current();
      } catch {
        // Silent — background refresh failures should never surface
      } finally {
        inFlight.current = false;
      }
    }

    const timer = setInterval(tick, intervalMs);

    function onVisibility() {
      if (document.visibilityState === 'visible') tick();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled, pauseWhenHidden]);
}

export const AUTO_REFRESH_MS = 5000; 