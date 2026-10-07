import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, Download } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import { api } from "../api/client.js";

const statusStyles = {
  PROCESSING: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  SUPERSEDED: "bg-gray-100 text-gray-600",
  FAILED: "bg-red-100 text-red-700",
};

export default function TimesheetDetail() {
  const { timesheetId } = useParams();
  const [upload, setUpload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/timesheets/${timesheetId}`)
      .then((data) => setUpload(data.upload || data))
      .catch((err) => setError(err.message || "Failed to load this timesheet."))
      .finally(() => setLoading(false));
  }, [timesheetId]);

  if (loading) return <p className="py-8 text-center text-sm text-text-muted">Loading timesheet...</p>;
  if (error) return <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>;

  return (
    <div className="space-y-4">
      <Link to="/timesheets" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ChevronLeft className="h-4 w-4" />
        Timesheets
      </Link>

      <Card title={upload?.originalFilename || "Timesheet upload"}>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">Company</dt>
            <dd className="mt-0.5 font-medium">{upload?.company?.name || upload?.companyId}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Period</dt>
            <dd className="mt-0.5 font-medium">{String(upload?.periodMonth || "").slice(0, 7)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Status</dt>
            <dd className="mt-0.5">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  statusStyles[upload?.status] || "bg-gray-100 text-gray-600"
                }`}
              >
                {upload?.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Rows</dt>
            <dd className="mt-0.5 font-medium">{upload?.rowCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Uploaded by</dt>
            <dd className="mt-0.5 font-medium">{upload?.uploadedBy?.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Uploaded at</dt>
            <dd className="mt-0.5 font-medium">
              {upload?.uploadedAt ? new Date(upload.uploadedAt).toLocaleString() : "—"}
            </dd>
          </div>
        </dl>

        <a href={`/api/timesheets/${timesheetId}/source`} className="btn-secondary mt-6 inline-flex w-fit">
          <Download className="h-4 w-4" />
          Download original file
        </a>
      </Card>
    </div>
  );
}
