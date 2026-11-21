import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/** Fetch JSON from the API with loading/error state; refetches when `path` changes. */
export function useApi(path, { poll = 0, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path && enabled));
  const ctrl = useRef(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!path || !enabled) return;
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      if (!quiet) setLoading(true);
      try {
        const d = await api(path, { signal: c.signal });
        setData(d);
        setError(null);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e);
      } finally {
        if (ctrl.current === c) setLoading(false);
      }
    },
    [path, enabled],
  );

  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!poll) return undefined;
    const t = setInterval(() => load(true), poll);
    return () => clearInterval(t);
  }, [poll, load]);

  return { data, error, loading, reload: load, setData };
}
