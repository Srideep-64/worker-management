import { useState } from "react";
import { Link } from "react-router-dom";
import { FolderLock, Search } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import ExpiryBadge from "../components/ui/ExpiryBadge.jsx";
import { api } from "../api/client.js";
import { useFetch, DOC_LABELS } from "../hooks.js";

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
  const { data, error, loading } = useFetch(() => api.get(`/documents/expiring?days=${days}`), [days]);

  const q = search.trim().toLowerCase();
  const items = (data?.items || []).filter(
    (i) => (!type || i.type === type) && (!q || i.workerCode.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
  );

  return (
    <Card title="Document expiry">
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input type="text" placeholder="Search by worker ID or name" className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All document types</option>
          {["PASSPORT", "VISA", "EMIRATES_ID"].map((t) => <option key={t} value={t}>{DOC_LABELS[t]}</option>)}
        </select>
        <select className="input w-auto" value={days} onChange={(e) => setDays(e.target.value)}>
          {WINDOWS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!loading && items.length === 0 ? (
        <EmptyState icon={FolderLock} title="Nothing expiring in this window" description="Documents are stored privately and only opened through an authenticated request — open a worker's profile to view or replace files." />
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-text-muted">
              <th className="pb-2 font-medium">Worker</th><th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">Company</th>
              <th className="pb-2 font-medium">Document</th><th className="pb-2 font-medium">Expires</th><th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => (
              <tr key={`${i.workerId}-${i.type}`}>
                <td className="py-2.5 font-medium"><Link className="text-accent-dark hover:underline" to={`/workers/${i.workerId}`}>{i.workerCode}</Link></td>
                <td className="py-2.5 text-text">{i.name}</td>
                <td className="py-2.5 text-text-muted">{i.company}</td>
                <td className="py-2.5 text-text-muted">{DOC_LABELS[i.type]}</td>
                <td className="py-2.5 tabular-nums text-text-muted">{i.expiry}</td>
                <td className="py-2.5"><ExpiryBadge daysLeft={i.daysLeft} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
