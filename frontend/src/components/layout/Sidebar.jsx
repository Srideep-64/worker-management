import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users,
  Briefcase,
  FileSpreadsheet,
  FolderLock,
  Settings as SettingsIcon,
  X,
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

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col bg-ink text-white transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">
              W
            </div>

            <div className="leading-tight">
              <p className="text-sm font-semibold">Workforce</p>
              <p className="text-xs text-white/50">Internal</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:bg-ink-soft hover:text-white md:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
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
    </>
  );
}
