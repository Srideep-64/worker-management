import { useState, useEffect } from "react";
import { Link, useLocation} from "react-router-dom";
import { Plus, Search, Users, RefreshCw, ChevronLeft } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import AddWorkerModal from "../components/worker/AddWorkerModal.jsx";

import { api, qs } from "../api/client.js";
import { useFetch, useDebounced } from "../hooks.js";

import {
  saveScrollPosition,
  useRestoreScrollPosition,
} from "../utils/scrollPosition.js";

import {
  getCachedCompanies,
  setCachedCompanies,
  invalidateCachedCompanies,
  getCachedWorkers,
  setCachedWorkers,
  invalidateCachedWorkers,
} from "../utils/listCache.js";

const PAGE_SIZE = 25;

const WORKERS_STATE_KEY = "workers-page-state";

function getSavedWorkersState() {
  try {
    return JSON.parse(
      sessionStorage.getItem(WORKERS_STATE_KEY) || "null"
    ) || {};
  } catch {
    return {};
  }
}


export default function Workers() {
  const [initialState] = useState(getSavedWorkersState);

  const [search, setSearch] = useState(
    () => initialState.search ?? ""
  );
  const [companyId, setCompanyId] = useState(
    () => initialState.companyId ?? ""
  );
  const [status, setStatus] = useState(
    () => initialState.status ?? "ACTIVE"
  );
  const [page, setPage] = useState(
    () => Math.max(1, Number(initialState.page) || 1)
  );
  const [adding, setAdding] = useState(false);

  const debouncedSearch = useDebounced(search, 400);
  
  const {
    data: lookups,
    error: lookupError,
    loading: lookupsLoading,
    reload: reloadLookups,
  } = useFetch(async () => {
    const cached = getCachedCompanies();

    if (cached) {
      return {
        companies: cached.companies ?? [],
      };
    }

    const companyData = await api.get("/companies");
    setCachedCompanies(companyData);

    return {
      companies: companyData.companies ?? [],
    };
  }, []);

  useEffect(() => {
    sessionStorage.setItem(
      WORKERS_STATE_KEY,
      JSON.stringify({
        search,
        companyId,
        status,
        page,
      })
    );
  }, [search, companyId, status, page]);

  const workerCacheKey = JSON.stringify({
    search: debouncedSearch.trim(),
    companyId,
    status,
    page,
    pageSize: PAGE_SIZE,
  });

  const {
    data,
    error,
    loading,
    reload,
  } = useFetch(async () => {
    const cached = getCachedWorkers(workerCacheKey);

    if (cached) return cached;

    const response = await api.get(
      `/workers${qs({
        search: debouncedSearch.trim() || undefined,
        companyId: companyId || undefined,
        status,
        page,
        pageSize: PAGE_SIZE,
      })}`,
    );

    setCachedWorkers(workerCacheKey, response);

    return response;
  }, [debouncedSearch, companyId, status, page]);

  useRestoreScrollPosition("/workers", !loading && !error);


  const workers = data?.workers ?? [];
  const companies = lookups?.companies ?? [];
  const pagination = data?.pagination;

  function resetPageAnd(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

    useEffect(() => {
  if (pagination?.totalPages && page > pagination.totalPages) {
    setPage(1);
  }
}, [pagination?.totalPages, page]);


  function handleWorkerSaved() {
    setAdding(false);
    setPage(1);

    // A new worker affects the worker list and company worker counts.
    invalidateCachedWorkers();
    invalidateCachedCompanies();

    reload();
    reloadLookups();
  }


  const totalPages = Math.max(1, pagination?.totalPages ?? 1);

  return (
    <> 
      <Link
        to="/"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-accent"
      >
        <ChevronLeft className="h-4 w-4" />
        Dashboard
      </Link>
    <Card
      title="Workers"
      action={
        <div className="flex gap-2">
          {/* Refresh */}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              invalidateCachedWorkers();
              reload();
            }}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          {/* Add Worker */}
          <button
            type="button"
            className="btn-accent"
            onClick={() => setAdding(true)}
            disabled={lookupsLoading || companies.length === 0}
            title={
              companies.length === 0
                ? "Add a company before creating a worker"
                : undefined
            }
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add worker
          </button>
        </div>
      }
    >
      {(lookupError || error) && (
        <div className="mb-4 space-y-2">
          {lookupError && (
            <p role="alert" className="text-sm text-danger">
              Could not load company filters: {lookupError}
              <button
                type="button"
                className="ml-2 underline"
                onClick={reloadLookups}
              >
                Retry
              </button>
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              Could not load workers: {error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={reload}
              >
                Retry
              </button>
            </p>
          )}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            placeholder="Search by worker ID or name"
            aria-label="Search workers"
            className="input pl-9"
            value={search}
            onChange={resetPageAnd(setSearch)}
          />
        </div>

        <select
          className="input w-auto"
          aria-label="Filter by company"
          value={companyId}
          onChange={resetPageAnd(setCompanyId)}
        >
          <option value="">All companies</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.code}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="ACTIVE">Active workers</option>
          <option value="INACTIVE">Inactive workers</option>
          <option value="ALL">All workers</option>
        </select>
      </div>

      {loading && !data ? (
        <p className="py-6 text-center text-sm text-text-muted">
          Loading workers...
        </p>
      ) : workers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            search || companyId
              ? "No matching workers"
              : "No workers yet"
          }
          description={
            search || companyId 
              ? "Try changing your search or filters."
              : "Add your first worker to get started."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-3 py-3 font-medium"></th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Company</th>
                  <th className="px-3 py-3 font-medium">Job title</th>
                </tr>
              </thead>

              <tbody>
                {workers.map((worker,index) => (
                  <tr
                    key={worker.id}
                    className="border-b border-border last:border-0 hover:bg-paper"
                  >
                    <td className="px-3 py-3 text-text">
                      {(page - 1) * PAGE_SIZE +index+1}
                    </td>

                    <td className="px-3 py-3 font-medium">
                      <Link
                        to={`/workers/${worker.id}`}
                        className="text-accent-dark hover:underline"
                          state={{
                            returnTo: "/workers",
                            returnLabel: "Workers",
                            restoreScrollOnReturn: true,
                          }}
                          onClick={() => saveScrollPosition("/workers")}
                      >
                        {worker.name}
                      </Link>
                    </td>

                    <td className="px-3 py-3 text-text-muted">
                      {worker.company.code}
                    </td>

                    <td className="px-3 py-3 text-text-muted">
                      {worker.jobTitle || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-text-muted">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}{" – "}
              {Math.min(page * PAGE_SIZE, pagination?.total ?? 0)}
              {" "}of {pagination?.total ?? 0} workers
            </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </button>

                <span>
                  Page {page} of {totalPages}
                </span>

                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {adding && (
        <AddWorkerModal
          companies={companies}
          onClose={() => setAdding(false)}
          onSaved={handleWorkerSaved}
        />
      )}
    </Card>
    </>
  );
}