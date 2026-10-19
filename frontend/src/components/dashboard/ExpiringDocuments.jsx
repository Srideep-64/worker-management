
import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { api } from "../../api/client.js";
import { useFetch, DOC_LABELS } from "../../hooks.js";

import {
  saveScrollPosition,
  useRestoreScrollPosition,
} from "../../utils/scrollPosition.js";

// Cache expiring documents indefinitely until manually refreshed.
let expiringDocumentsCache = null;

export default function ExpiringDocuments() {
  const [refreshing, setRefreshing] = useState(false);


const { data, error, loading, reload } = useFetch(
  async () => {
    if (expiringDocumentsCache !== null) {
      return expiringDocumentsCache;
    }

    const response = await api.get("/documents/expiring?days=30");

    expiringDocumentsCache = response;

    return response;
  },
  []
);

useRestoreScrollPosition("/", !loading);

const documents = data?.items ?? [];

async function handleRefresh() {
  if (loading || refreshing) return;

  setRefreshing(true);

  // Invalidate the single dashboard cache.
  expiringDocumentsCache = null;

  try {
    await reload();
  } finally {
    setRefreshing(false);
  }
}


  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text">
            Documents expiring within 30 days
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Track upcoming document expirations.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
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

          <Link
            to="/documents"
            className="text-sm font-medium text-accent hover:underline"
          >
            View all
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Loading documents...
        </p>
      ) : error ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-600">
            Failed to load expiring documents.
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-2 text-sm font-medium text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      ) : documents.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing expiring soon.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-3 font-medium"></th>
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Document</th>
                <th className="px-3 py-3 font-medium">Expiry date</th>
              </tr>
            </thead>

            <tbody>
              {documents.slice(0, 8).map((document,index) => {
                const daysLeft = document.daysLeft;

                const expiryDate = document.expiry
                  ? new Date(document.expiry).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Dubai",
                    })
                  : "—";

                return (
                  <tr
                    key={`${document.workerId}-${document.type}-${document.expiry}`}
                    className="border-b border-border last:border-0 transition-colors hover:bg-paper"
                  >
                    <td>{index + 1}</td>
                    <td className="px-3 py-3">
                      <Link
                        to={`/workers/${document.workerId}`}
                        className="font-medium text-accent hover:underline"
                        state={{
                          returnTo: "/",
                          returnLabel:"Dashboard",
                          restoreScrollOnReturn: true,
                        }}
                        onClick={() => saveScrollPosition("/")}
                      >
                        {document.name}
                      </Link>
                    </td>

                    <td className="px-3 py-3 text-foreground">
                      {DOC_LABELS?.[document.type] || document.type}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{expiryDate}</span>

                        {Number.isFinite(daysLeft) && (
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                                daysLeft < 0
                                  ? "bg-danger-soft text-danger"
                                  : daysLeft <= 7
                                    ? "bg-accent-soft text-accent-dark"
                                    : "bg-paper text-text-muted"
                              }`}
                          >
                            {daysLeft < 0
                              ? "Expired"
                              : daysLeft === 0
                                ? "Expires today"
                                : `${daysLeft} days left`}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
