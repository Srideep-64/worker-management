import { RefreshCw } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api, invalidate } from "../api/client.js";
import { useFetch } from "../hooks.js";
export default function Settings() {
  const { user } = useAuth();

  const { data, error, loading, reload } = useFetch(() => api.get("/users"), []);
  const users = data?.users ?? [];

  async function handleRefresh() {
    invalidate("/users");
    await reload();
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
                    
                    <th className="pb-2 font-medium">Role</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 font-medium text-text">
                        {item.name}
                      </td>
                      
                      <td className="py-2.5">
                        <Badge tone="neutral">
                        {item.name === "Super Admin" ? "Super Admin" : "Admin"}
                      </Badge>
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