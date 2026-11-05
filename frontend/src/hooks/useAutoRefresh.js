import { useEffect, useRef } from 'react';

// Runs `callback` again and again so a page stays up to date
// without the user pressing refresh.
//  - runs every `intervalMs` (default 20 seconds)
//  - waits while the browser tab is hidden
//  - runs right away when the user comes back to the tab
// Use it like:  useAutoRefresh(loadTickets);
export default function useAutoRefresh(callback, intervalMs = 20000) {
  const saved = useRef(callback);

  // always call the newest version of the function
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    function run() {
      if (document.visibilityState === 'hidden') return;
      try {
        const result = saved.current();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        // ignore, the next check will try again
      }
    }

    const interval = setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
    };
  }, [intervalMs]);
}