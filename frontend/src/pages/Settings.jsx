import { Plus } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <Card title="Your account">
        <div className="grid max-w-md gap-4">
          <div>
            <label className="label">Name</label>
            <input className="input" defaultValue={user?.name || ""} disabled />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" defaultValue={user?.email || ""} disabled />
          </div>
          <div>
            <button type="button" className="btn-secondary w-fit">
              Change password
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="Users"
        action={
          <button type="button" className="btn-accent">
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add user
          </button>
        }
      >
        <p className="mb-4 text-sm text-text-muted">
          Every user currently has full admin access. 
        </p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-text-muted">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {user && (
              <tr>
                <td className="py-2.5 font-medium text-text">{user.name}</td>
                <td className="py-2.5 text-text-muted">{user.email}</td>
                <td className="py-2.5">
                  <Badge tone="neutral">Admin</Badge>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
