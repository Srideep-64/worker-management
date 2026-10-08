import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users,
  Briefcase,
  FileSpreadsheet,
  FolderLock,
  Settings as SettingsIcon,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/workers", label: "Workers", icon: Users },
  { to: "/clients", label: "Clients", icon: Briefcase },
  { to: "/timesheets", label: "Timesheets", icon: FileSpreadsheet },
  { to: "/documents", label: "Documents", icon: FolderLock },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-ink text-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">
          W
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Workforce</p>
          <p className="text-xs text-white/50">Internal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-ink-soft text-white"
                  : "text-white/65 hover:bg-ink-soft hover:text-white"
              }`
            }
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-4 text-xs text-white/40">
        Made by &middot; Srideep Reddy
      </div>
    </aside>
  );
}
