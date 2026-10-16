import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FolderLock, Search, RefreshCw } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import ExpiryBadge from "../components/ui/ExpiryBadge.jsx";

import { api } from "../api/client.js";
import { useFetch, DOC_LABELS } from "../hooks.js";

import {
  saveScrollPosition,
  useRestoreScrollPosition,
} from "../utils/scrollPosition.js";

// Cache each expiry window indefinitely until manually refreshed.
const expiringDocumentsCache = new Map();

const WINDOWS = [
  { value: "30", label: "Expired or within 30 days" },
  { value: "60", label: "Within 60 days" },
  { value: "90", label: "Within 90 days" },
  { value: "365", label: "Within 1 year" },
];

export default function Documents() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [days, setDays] = useState("30");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("ACTIVE");
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  useEffect(() => {
      setPage(1);
    }, [search, type, status, days]);

  const { data, error, loading, reload } = useFetch(async () => {
    // Use cached data unless a manual refresh was requested.
    if (refreshKey === 0 && expiringDocumentsCache.has(days)) {
      return expiringDocumentsCache.get(days);
    }

    const response = await api.get(
      `/documents/expiring?days=${days}`
    );

    expiringDocumentsCache.set(days, response);

    return response;
  }, [days, refreshKey]);

  useRestoreScrollPosition("/documents", !loading);

  async function handleRefresh() {
    if (loading || refreshing) return;

    setRefreshing(true);
    expiringDocumentsCache.delete(days);
    setRefreshKey((key) => key + 1);

    try {
      // useFetch reruns when refreshKey changes.
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  const q = search.trim().toLowerCase();

  const items = (data?.items || []).filter(
    (i) =>
      (!type || i.type === type) &&
      (!q ||
        i.workerCode.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q)) &&
      (status === "ALL" || i.workerStatus === status)
  );

  const totalPages = Math.ceil(items.length / PAGE_SIZE);

  const paginatedItems = items.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  return (
    <Card title="Document expiry">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search by worker ID or name"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="input w-auto"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All document types</option>
          {["PASSPORT", "VISA", "EMIRATES_ID"].map((t) => (
            <option key={t} value={t}>
              {DOC_LABELS[t]}
            </option>
          ))}
        </select>
        
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ACTIVE">Active workers</option>
          <option value="INACTIVE">Inactive workers</option>
          <option value="ALL">All workers</option>
        </select>

        <select
          className="input w-auto"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        >
          {WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn-secondary"
          onClick={handleRefresh}
          disabled={loading || refreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${
              refreshing ? "animate-spin" : ""
            }`}
          />
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && items.length === 0 ? (
        <EmptyState
          icon={FolderLock}
          title="Nothing expiring in this window"
          description="Documents are stored privately and only opened through an authenticated request — open a worker's profile to view or replace files."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-text-muted">
                  <th className="pb-2 font-medium"></th>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Company</th>
                  <th className="pb-2 font-medium">Document</th>
                  <th className="pb-2 font-medium">Expires</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {paginatedItems.map((i, index) => (
                  <tr key={`${i.workerId}-${i.type}`}>
                    <td className="py-2.5">
                      {(page - 1) * PAGE_SIZE + index + 1}
                    </td>
                    <td className="py-2.5 font-medium">
                      <Link
                        className="text-accent-dark hover:underline"
                        to={`/workers/${i.workerId}`}
                        state={{
                          returnTo: "/documents",
                          returnLabel: "Documents",
                          restoreScrollOnReturn: true,
                        }}
                        onClick={() => saveScrollPosition("/documents")}
                      >
                        {i.name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-text-muted">{i.company}</td>
                    <td className="py-2.5 text-text-muted">
                      {DOC_LABELS[i.type]}
                    </td>
                    <td className="py-2.5 tabular-nums text-text-muted">
                      {i.expiry}
                    </td>
                    <td className="py-2.5">
                      <ExpiryBadge daysLeft={i.daysLeft} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {items.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, items.length)} of {items.length} documents
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>

                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>

                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}