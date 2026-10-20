
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal data-loading hook: { data, error, loading, reload }.
export function useFetch(fn, deps) {
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: true,
  });

  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    setState((s) => ({
      ...s,
      loading: true,
      error: null,
    }));

    try {
      const data = await fn();

      if (requestId !== requestIdRef.current) return;

      setState({
        data,
        error: null,
        loading: false,
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      setState({
        data: null,
        error: err?.message || "Failed to load",
        loading: false,
      });

      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();

    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  return { ...state, reload: load };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return v;
}

export const fmtDate = (d) => (d ? String(d).slice(0, 10) : "—");

export const fmtMonth = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

// Whole days from today (UTC) until a YYYY-MM-DD / ISO date.
// Negative = expired.
export function daysUntil(d) {
  if (!d) return null;

  const t = new Date();
  const today = Date.UTC(
    t.getUTCFullYear(),
    t.getUTCMonth(),
    t.getUTCDate(),
  );

  return Math.round(
    (Date.parse(String(d).slice(0, 10)) - today) / 86400000,
  );
}

export const DOC_LABELS = {
  PHOTO: "Photo",
  PASSPORT: "Passport",
  VISA: "Visa",
  EMIRATES_ID: "Emirates ID",
  LABOUR_CARD: "Labour card",
};
