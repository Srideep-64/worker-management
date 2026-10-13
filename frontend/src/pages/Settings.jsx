import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchUsers,getCachedUsers } from "../utils/usersCache.js";

export default function Settings() {
  const { user } = useAuth();

  const [users, setUsers] = useState(() => getCachedUsers() ?? []);
  const [loading, setLoading] = useState(
    () => getCachedUsers() === null
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (getCachedUsers() !== null) {
      setUsers(getCachedUsers());
      setLoading(false);
      return;
    }

    fetchUsers()
      .then((result) => {
        if (!cancelled) setUsers(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Failed to load users.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefresh() {
    setLoading(true);
    setError("");

    try {
      const result = await fetchUsers({ refresh: true });
      setUsers(result);
    } catch (err) {
      setError(err.message || "Failed to refresh users.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="My account">
        <div className="grid max-w-md gap-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={user?.name || ""}
              disabled
              readOnly
            />
          </div>

          <div>
            <label className="label">Email</label>
            <input
              className="input"
              value={user?.email || ""}
              disabled
              readOnly
            />
          </div>
        </div>
      </Card>

      <Card
        title="Users"
        action={
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        }
      >
        <p className="mb-4 text-sm text-text-muted">
          Every user currently has full admin access.
        </p>

        {loading && users.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">
            Loading users...
          </p>
        ) : error && users.length === 0 ? (
          <p className="py-4 text-sm text-red-600">
            {error}
          </p>
        ) : users.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">
            No users found.
          </p>
        ) : (
          <>
            {error && (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-text-muted">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Role</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 font-medium text-text">
                        {item.name}
                      </td>
                      <td className="py-2.5 text-text-muted">
                        {item.email}
                      </td>
                      <td className="py-2.5">
                        <Badge tone="neutral">Admin</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}