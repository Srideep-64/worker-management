import { NavLink } from "react-router-dom";
import {
  FileSpreadsheet,
  FolderLock,
  History,
  LayoutDashboard,
  MapPin,
  Settings as SettingsIcon,
  Users,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/workers", label: "Workers", icon: Users },
  { to: "/timesheets", label: "Timesheets", icon: FileSpreadsheet },
  { to: "/documents", label: "Documents", icon: FolderLock },
  { to: "/logs", label: "Logs", icon: History },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

// Lightweight original SVG skyline: no image file, network call, or dependency needed.

function DubaiSkyline() {
  return (
    <svg
      viewBox="0 0 190 175"
      className="pointer-events-none mx-auto block h-auto w-full max-w-[208px] select-none"
      role="img"
      aria-label="Dubai skyline with Burj Khalifa, Burj Al Arab, and a palm tree"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="skyline-tint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7899C9" />
          <stop offset="1" stopColor="#496FAD" />
        </linearGradient>
      </defs>

      {/* Distant buildings */}
      <g fill="url(#skyline-tint)" opacity="0.48">
        <path d="M58 161v-19h7v-12h7v-10h5v41ZM110 161v-25h7v-13h5v22h11v16Z" />
        <path d="M70 161v-31h8v-20h4v51ZM118 161v-15h8v-6h6v21Z" />
      </g>

      {/* Burj Khalifa */}
      <path
        fill="url(#skyline-tint)"
        opacity="0.83"
        d="M73 161v-8h5v-28h4V94h3V78h3V56h3V40h1V24h1v16h2v18h3v19h3v24h4v28h5v23h15v9Z"
      />
      <path
        d="M92.5 24V15M92 49v101M85 102v50M101 119v33"
        fill="none"
        stroke="#9DB7D9"
        strokeWidth="0.9"
        opacity="0.34"
      />

      {/* Burj Al Arab */}
      <path
        d="M34 160v-27c0-18 10-30 25-42v69Z"
        fill="url(#skyline-tint)"
        opacity="0.82"
      />
      <path
        d="M42 157v-24c0-13 6-23 15-33v57Z"
        fill="#163258"
        opacity="0.86"
      />
      <path
        d="M59 91v69M33 129c7-16 17-27 27-38M35 160h30"
        fill="none"
        stroke="#85A6D0"
        strokeWidth="1.5"
        opacity="0.8"
      />
      <g stroke="#789BCA" strokeWidth="1" opacity="0.55">
        <path d="M42 124h16M39 132h19M39 139h19M39 146h19M39 153h19" />
      </g>

      {/* Palm tree */}
      <path
        d="M153 162c3-12 5-21 1-32"
        fill="none"
        stroke="#6E94C4"
        strokeWidth="3.4"
        strokeLinecap="round"
        opacity="0.85"
      />
      <g fill="#7197C7" opacity="0.83">
        <path d="M155 130c-6-10-16-16-24-8 9-3 17 3 24 12Z" />
        <path d="M155 130c-4-13-12-20-19-17 7 1 13 10 19 21Z" />
        <path d="M155 131c-2-13-3-20-9-23 4 7 6 16 9 26Z" />
        <path d="M155 131c4-15 10-19 17-17-8 3-12 12-17 21Z" />
        <path d="M155 131c11-11 19-10 24-3-9-3-16 2-23 7Z" />
        <path d="M156 134c13-5 19 0 21 8-6-6-13-7-21-5Z" />
        <path d="M155 134c-7-3-13 1-16 10 5-5 11-7 16-7Z" />
      </g>

      {/* Ground */}
      <path
        d="M3 169c47-13 111-15 184 0"
        fill="none"
        stroke="#7498C6"
        strokeWidth="1.8"
        opacity="0.76"
      />
    </svg>
  );
}

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col bg-gradient-to-b from-[#101D35] via-[#132B50] to-[#0E274A] text-white shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2168F2] text-lg font-bold text-white shadow-sm">
              W
            </div>
            <div className="leading-tight">
              <p className="text-base font-semibold tracking-tight">Workforce</p>
              <p className="text-xs text-white/65">Internal</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pt-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#1762E8] text-white shadow-sm"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.85} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Dubai illustration stays near the bottom, above UAE Operations. */}
        <div className="shrink-0 px-4 pb-3 pt-2">
          <DubaiSkyline />
          <div className="mt-2 flex items-center gap-2 border-t border-white/20 py-3 text-xs text-white/85">
            <MapPin className="h-4 w-4 shrink-0" />
            Sharjah
          </div>
          <div className="border-t border-white/15 pt-3 text-[11px] text-white/60">
            Made by Srideep Reddy
          </div>
        </div>
      </aside>
    </>
  );
}
