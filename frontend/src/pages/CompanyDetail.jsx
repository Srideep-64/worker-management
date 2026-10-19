import { useState, useEffect } from "react";
import { Link, useParams,useLocation } from "react-router-dom";
import {
  ChevronLeft,
} from "lucide-react";

import WorkersTab from "../components/company/WorkersTab.jsx";
import MonthlyStats from "../components/company/MonthlyStats.jsx";

import Card from "../components/ui/Card.jsx";
import { api } from "../api/client.js";
import { useFetch } from "../hooks.js";


import {
  getCachedCompanyDetails,
  setCachedCompanyDetails,
  getCachedCompanyWorkers,
  setCachedCompanyWorkers,
  invalidateCompanyDetails,
  invalidateCompanyWorkers,
} from "../utils/companyDetailCache.js";


const TABS = [ "Monthly stats","Workers"];


export default function CompanyDetail() {
  const { companyId } = useParams();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || "Monthly stats"
  );

  const PAGE_SIZE = 15;

  const [workersRefreshKey, setWorkersRefreshKey] = useState(0);
  const [workerPage, setWorkerPage] = useState(
    () => location.state?.workerPage ?? 1
  );

  const [workerStatus, setWorkerStatus] = useState(
    () => location.state?.workerStatus ?? "ACTIVE"
  );

  const [month, setMonth] = useState(() => {
    if (location.state?.month) return location.state.month;

    const now = new Date();
    const previousMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );

    return `${previousMonth.getFullYear()}-${String(
      previousMonth.getMonth() + 1
    ).padStart(2, "0")}`;
  });


    const {
      data: companyData,
      error: companyError,
      loading: companyLoading,
    } = useFetch(async () => {
      const cached = getCachedCompanyDetails(companyId);

      if (cached) return cached;

      const response = await api.get(`/companies/${companyId}`);
      setCachedCompanyDetails(companyId, response);

      return response;
    }, [companyId]);


    const {
      data: workerData,
      error: workerError,
      loading: workersLoading,
    } = useFetch(async () => {
      const cached = getCachedCompanyWorkers(
        companyId,
        workerPage,
        PAGE_SIZE,
        workerStatus,
        month
      );

      if (cached) return cached;

      const response = await api.get(
        `/workers?companyId=${companyId}&status=${workerStatus}&month=${month}&page=${workerPage}&limit=${PAGE_SIZE}`
      );

      setCachedCompanyWorkers(
        companyId,
        workerPage,
        PAGE_SIZE,
        response,
        workerStatus,
        month
      );

      return response;
    }, [
      companyId,
      workerPage,
      workersRefreshKey,
      workerStatus,
      month,
    ]);


  const company = companyData?.company || companyData;
  const workers = workerData?.workers || [];

  const pagination =
    workerData?.pagination || workerData?.meta || {};

  const totalWorkers =
    pagination.total ??
    workerData?.total ??
    workerData?.totalCount;

  const hasNextPage =
    pagination.hasNextPage ??
    workerData?.hasNextPage ??
    (totalWorkers != null
      ? workerPage * PAGE_SIZE < totalWorkers
      : workers.length === PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <Card
        title={
          company
            ? `${company.code} — ${company.name}`
            : "Company details"
        }
      >
        {companyLoading && (
          <p className="py-6 text-center text-sm text-text-muted">
            Loading company...
          </p>
        )}

        {(companyError || workerError) && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {(companyError || workerError).message ||
              "Failed to load company details."}
          </p>
        )}

        {company && (
          <>
            <div
              role="tablist"
              aria-label="Company information"
              className="mb-5 flex gap-1 overflow-x-auto border-b border-border"
            >
              {TABS.map((tab) => {
                const selected = activeTab === tab;

                return (
                  <button
                    key={tab}
                    id={`company-tab-${tab}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tab)}
                    className={`shrink-0 px-3 pb-3 text-sm font-medium transition-colors ${
                      selected
                        ? "border-b-2 border-accent text-text"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {activeTab === "Workers" && (
              <>
                {workersLoading ? (
                  <p className="py-6 text-center text-sm text-text-muted">
                    Loading workers...
                  </p>
                ) : (
                  <WorkersTab
                    workers={workers}
                    workerStatus={workerStatus}
                    setWorkerStatus={setWorkerStatus}
                    companyId={companyId}
                    month={month}
                    setMonth={setMonth}
                    page={workerPage}
                    setPage={setWorkerPage}
                    hasNextPage={hasNextPage}
                    workersLoading={workersLoading}
                    setWorkersRefreshKey={setWorkersRefreshKey}
                    PAGE_SIZE={PAGE_SIZE}
                  />
                )}
              </>
            )}

            {activeTab === "Monthly stats" && (
              <MonthlyStats
                companyId={companyId}
                companyCode={company.code}
                month={month}
                setMonth={setMonth}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
