import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";

/** Cached-first fetching with stale-while-revalidate, for URL-keyed GETs. */
export function useApiQuery(path) {
  const [state, setState] = useState(() => ({
    path,
    data: api.peek(path)?.data ?? null,
    error: null,
    loading: !api.peek(path),
    refreshing: false,
  }));
  const counter = useRef(0);

  const fetchPath = useCallback(async (force = false) => {
    const requestId = ++counter.current;
    const cached = api.peek(path);
    setState((previous) => {
      const retained = force && previous.path === path ? previous.data : null;
      const existing = cached?.data ?? retained;
      return {
        path, data: existing, error: null,
        loading: existing == null,
        refreshing: existing != null && (force || !cached?.fresh),
      };
    });
    try {
      // Forced refresh or expired snapshot: get fresh data, keeping old data visible.
      const data = await api.get(path, { force });
      if (requestId === counter.current) {
        setState({ path, data, error: null, loading: false, refreshing: false });
      }
      return data;
    } catch (err) {
      if (requestId === counter.current) {
        setState((old) => ({
          ...old, path, error: err?.message || "Request failed", loading: false, refreshing: false,
        }));
      }
      throw err;
    }
  }, [path]);

  useEffect(() => {
    fetchPath().catch(() => {});
    return () => { counter.current++; };
  }, [fetchPath]);

  // Avoid showing previous month/company data while the new URL loads.
  const current = state.path === path
    ? state
    : { path, data: api.peek(path)?.data ?? null, error: null, loading: !api.peek(path), refreshing: false };
  return { ...current, reload: () => fetchPath(true) };
}
