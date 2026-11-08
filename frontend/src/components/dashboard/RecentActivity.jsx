import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  History,
  UserRound,
  Wallet,
  FileText,
} from "lucide-react";
import { api, qs } from "../../api/client.js";
import { useFetch } from "../../hooks.js";

const ICONS = {
  WORKERS: UserRound,
  WORK_RECORDS: ClipboardList,
  TIMESHEETS: FileSpreadsheet,
  PAYROLL: Wallet,
  DOCUMENTS: FileText,
  COMPANIES: Building2,
};

function uaeDate(day) {
  if (!day) return "";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function logLink(group) {
  return `/logs${qs({
    category: group.category,
    action: group.action,
    userId: group.userId,
    companyId: group.companyId,
    from: group.day,
    to: group.day,
  })}`;
}

// Four entries are visible at once; additional entries scroll inside the card.
const ACTIVITY_ROW_HEIGHT = 112;
const VISIBLE_ROWS = 4;

export default function RecentActivity({ refreshKey = 0 }) {
  const { data, loading, error } = useFetch(
    () => api.get("/logs/summary"),
    [refreshKey]
  );
  const groups = data?.groups ?? [];

  return (
    <section
      className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
      aria-label="Recent activity"
    >
      {/* Header stays visible when scrolling through activities. */}
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-accent" />
          <div>
            <h2 className="font-bold text-text">Recent Activity</h2>
            <p className="text-xs text-text-muted">Last 7 days · UAE time</p>
          </div>
        </div>
        <Link
          to="/logs"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:underline"
        >
          View all <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading && groups.length === 0 && (
        <p className="py-5 text-sm text-text-muted">Loading recent activity…</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          Couldn't load recent activity.
        </p>
      )}
      {!loading && !error && groups.length === 0 && (
        <p className="py-5 text-sm text-text-muted">No activity in the last 7 days.</p>
      )}

      {groups.length > 0 && (
        <div
          className="divide-y divide-border overflow-y-auto overscroll-contain pr-2"
          style={{ maxHeight: ACTIVITY_ROW_HEIGHT * VISIBLE_ROWS }}
          role="list"
          aria-label="Recent activity entries"
        >
          {groups.map((group) => {
            const Icon = ICONS[group.category] || History;
            const workerCodes = group.workerCodes ?? [];
            const workerCount = group.workerCount ?? 0;
            const remainder = Math.max(0, workerCount - workerCodes.length);

            return (
              <Link
                key={group.key}
                to={logLink(group)}
                role="listitem"
                className="group flex min-w-0 gap-3 overflow-hidden py-3 transition-colors hover:bg-accent-soft/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                style={{ height: ACTIVITY_ROW_HEIGHT }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft/60 text-accent">
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-text group-hover:text-accent">
                      {group.title}
                    </p>
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {uaeDate(group.day)}
                    </span>
                  </div>

                  {(group.companyName || group.reportMonth) && (
                    <p className="mt-0.5 truncate text-xs text-text-muted">
                      {[group.companyName, group.reportMonth].filter(Boolean).join(" · ")}
                    </p>
                  )}

                  {workerCount > 0 ? (
                    <p className="mt-1 truncate text-xs text-text">
                      {workerCodes.join(", ")}
                      {remainder > 0 ? ` + ${remainder} more` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 truncate text-xs text-text-muted">
                      {group.eventCount > 1
                        ? `${group.eventCount} activities`
                        : group.sampleDescription}
                    </p>
                  )}

                  <p className="mt-1 truncate text-[11px] text-text-muted">
                    {workerCount
                      ? `${workerCount} worker${workerCount === 1 ? "" : "s"} · `
                      : ""}
                    By {group.username}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {data?.truncated && (
        <p className="mt-3 text-xs text-text-muted">
          Showing a sample of recent logs. View all for the full history.
        </p>
      )}
    </section>
  );
}