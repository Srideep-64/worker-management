import { useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";

const TITLES = [
  { match: /^\/$/, title: "Dashboard" },
  { match: /^\/companies/, title: "Companies" },
  { match: /^\/workers/, title: "Workers" },
  { match: /^\/clients/, title: "Clients" },
  { match: /^\/timesheets/, title: "Timesheets" },
  { match: /^\/documents/, title: "Documents" },
  { match: /^\/settings/, title: "Settings" },
];

function titleFor(pathname) {
  return TITLES.find(({ match }) => match.test(pathname))?.title ?? "Workforce";
}

export default function Topbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const initials = (user?.name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <h1 className="text-lg font-semibold text-text">{titleFor(pathname)}</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium text-text">{user?.name}</p>
            <p className="text-xs text-text-muted">Admin</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-paper hover:text-text"
          title="Log out"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
