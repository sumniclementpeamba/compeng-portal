import { useEffect, useRef } from 'react';

/**
 * Polls `callback` every `intervalMs`, with safety rails:
 *   - Pauses when the tab is hidden (saves API calls)
 *   - Skips the tick if the previous call is still running (no overlap)
 *   - Silent on error (a failed poll does not surface an error to the user)
 *   - Cancels cleanly on unmount
 *
 * Usage:
 *   useAutoRefresh(() => fetchData({ silent: true }), 5000);
 */
export function useAutoRefresh(callback, intervalMs = 5000, options = {}) {
  const { enabled = true, pauseWhenHidden = true } = options;
  const savedCallback = useRef(callback);
  const inFlight = useRef(false);

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
        // Silent — an individual poll failing should not disturb the UI
      } finally {
        inFlight.current = false;
      }
    }

    const timer = setInterval(tick, intervalMs);

    // Immediately refresh when the tab becomes visible again
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

/** Interval in ms — change this ONE line to adjust the global poll rate */
export const AUTO_REFRESH_MS = 5000;