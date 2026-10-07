import { useCallback, useEffect, useState } from "react";

// Minimal data-loading hook: { data, error, loading, reload }.
export function useFetch(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await fn(), error: null, loading: false });
    } catch (err) {
      setState({ data: null, error: err.message || "Failed to load", loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
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
  d ? new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—";

// Whole days from today (UTC) until a YYYY-MM-DD / ISO date. Negative = expired.
export function daysUntil(d) {
  if (!d) return null;
  const t = new Date();
  const today = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.round((Date.parse(String(d).slice(0, 10)) - today) / 86400000);
}

export const DOC_LABELS = {
  PHOTO: "Photo",
  PASSPORT: "Passport",
  VISA: "Visa",
  EMIRATES_ID: "Emirates ID",
  LABOUR_CARD: "Labour card",
};
