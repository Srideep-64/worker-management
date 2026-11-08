import { useEffect, useRef, useState } from "react";
import Login from "../../pages/Login.jsx"; // src/components/layout/BackendLoadingScreen.jsx
import {
  ArrowRight, Building2, CalendarDays, CheckCircle2,
  FileSpreadsheet, FileText,
  FolderLock, History, LayoutDashboard, LoaderCircle, RefreshCw,
  Search, ShieldCheck, TrendingUp, UserPlus, Users, Wallet, Moon, Sun, LogIn,
} from "lucide-react";

// These previews are illustrations, not live application data.
const TOUR = [
  {
    id: "dashboard", label: "Dashboard", Icon: LayoutDashboard,
    eyebrow: "01 / Your overview", title: "Everything important, in one place.",
    description: "Review monthly company reports, workforce averages, recent changes, and documents that need attention.",
    features: ["Choose a reporting month", "Check per-worker trends", "Open company details or download reports"],
  },
  {
    id: "workers", label: "Workers", Icon: Users,
    eyebrow: "02 / Worker directory", title: "Every worker, easy to find.",
    description: "Search worker profiles, filter by company, and manage employment information in one organized directory.",
    features: ["Find workers by name or code", "View profiles and work history", "Add and update worker details"],
  },
  {
    id: "timesheets", label: "Timesheets", Icon: FileSpreadsheet,
    eyebrow: "03 / Monthly attendance", title: "Monthly work records, organized.",
    description: "Upload client-provided timesheets after the month ends, or enter work records manually when needed.",
    features: ["Upload and confirm timesheets", "Record worked, absent, holiday, and weekly-off days", "Review hours for the selected month"],
  },
  {
    id: "companies", label: "Companies", Icon: Building2,
    eyebrow: "04 / Company details", title: "Company records without the spreadsheet clutter.",
    description: "Open a company to see its workers and monthly statistics, with reports kept just a click away.",
    features: ["Workers and Monthly Stats tabs", "Monthly hours and payroll overview", "Excel attendance and PDF payroll exports"],
  },
  {
    id: "payroll", label: "Payroll", Icon: Wallet,
    eyebrow: "05 / Payroll details", title: "Understand the numbers behind every month.",
    description: "See gross pay, absence deductions, advances, net pay, and remaining balances in a consistent monthly summary.",
    features: ["Monthly payroll summaries", "Hourly-rate based calculations", "Advances and balances"],
  },
  {
    id: "documents", label: "Documents", Icon: FolderLock,
    eyebrow: "06 / Document tracking", title: "Know what needs renewing.",
    description: "Keep worker documents organized and spot upcoming expiry dates without searching individual profiles.",
    features: ["View worker documents", "Find upcoming expirations", "Keep document information together"],
  },
  {
    id: "logs", label: "Logs", Icon: History,
    eyebrow: "07 / Activity history", title: "Stay informed about changes.",
    description: "Review updates made by administrators, with searchable, dated activity and a concise dashboard summary.",
    features: ["Recent activity summaries", "Filter the audit history", "Follow links to affected workers"],
  },
];

function DemoPanel({ page }) {
  const panel = "rounded-xl border border-border bg-surface px-3 py-2.5";
  const muted = "text-text-muted";

  if (page === "dashboard") return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-text">Dashboard</span><span className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2 py-1 text-xs text-accent"><CalendarDays className="h-3 w-3" /> Reporting month</span></div>
      <div className="grid grid-cols-2 gap-2">
        <div className={panel}><div className={`flex items-center gap-1 text-xs ${muted}`}><TrendingUp className="h-3.5 w-3.5" /> Workforce trends</div><p className="mt-2 text-sm font-bold text-text">Avg hours / worker</p><p className="text-xs text-emerald-600 dark:text-emerald-400">Compared with prior months</p></div>
        <div className={panel}><div className={`flex items-center gap-1 text-xs ${muted}`}><Users className="h-3.5 w-3.5" /> Active workers</div><p className="mt-2 text-2xl font-bold text-accent">—</p><p className="text-xs text-text-muted">View worker directory</p></div>
      </div>
      <div className={panel}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-text">Recent activity</span><span className="text-xs text-accent">View all</span></div><div className="mt-2 space-y-2"><div className="h-2 w-4/5 rounded bg-border"/><div className="h-2 w-3/5 rounded bg-border"/></div></div>
    </div>
  );
  if (page === "workers") return (
    <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Workers</span><span className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white"><UserPlus className="h-3 w-3"/> Add worker</span></div><div className={`${panel} flex items-center gap-2 text-xs text-text-muted`}><Search className="h-4 w-4"/> Search name or worker code</div><div className="overflow-hidden rounded-xl border border-border"><div className="grid grid-cols-3 gap-2 border-b border-border bg-accent-soft/40 px-3 py-2 text-[11px] font-semibold text-text-muted"><span>Worker</span><span>Company</span><span>Status</span></div>{[1,2,3].map(i => <div key={i} className="grid grid-cols-3 gap-2 border-b border-border px-3 py-3 text-xs last:border-0"><span className="font-medium text-text">Worker {String(i).padStart(3,"0")}</span><span className="text-text-muted">Company {i}</span><span className="text-emerald-600 dark:text-emerald-400">Active</span></div>)}</div></div>
  );
  if (page === "timesheets") return (
    <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Timesheets</span><span className="rounded-lg bg-accent px-3 py-1 text-xs text-white">Upload file</span></div><div className="rounded-xl border border-dashed border-accent/40 bg-accent-soft/20 px-4 py-6 text-center"><FileSpreadsheet className="mx-auto h-7 w-7 text-accent"/><p className="mt-2 text-sm font-medium text-text">Upload monthly attendance</p><p className="mt-1 text-xs text-text-muted">Review records before confirming</p></div><div className="grid grid-cols-4 gap-2 text-center text-xs">{["Worked", "Absent", "Holiday", "Weekly off"].map(x=><div key={x} className={panel}><CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-accent"/>{x}</div>)}</div></div>
  );
  if (page === "companies") return (
    <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Company details</span><Building2 className="h-4 w-4 text-accent"/></div><div className="flex gap-4 border-b border-border text-xs"><span className="border-b-2 border-accent pb-2 font-semibold text-accent">Workers</span><span className="pb-2 text-text-muted">Monthly Stats</span></div><div className="grid grid-cols-2 gap-2"><div className={panel}><p className="text-xs text-text-muted">Total hours</p><p className="mt-2 text-lg font-semibold text-text">—</p></div><div className={panel}><p className="text-xs text-text-muted">Gross pay</p><p className="mt-2 text-lg font-semibold text-text">AED —</p></div></div><div className="flex gap-2"><span className="rounded-lg border border-border px-3 py-2 text-xs text-text"><FileSpreadsheet className="mr-1 inline h-3 w-3 text-emerald-600"/> Excel</span><span className="rounded-lg border border-border px-3 py-2 text-xs text-text"><FileText className="mr-1 inline h-3 w-3 text-rose-600"/> PDF</span></div></div>
  );
  if (page === "payroll") return (
    <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Monthly payroll</span><Wallet className="h-4 w-4 text-accent"/></div><div className="grid grid-cols-2 gap-2">{["Gross pay", "Absence deductions", "Net pay", "Total advances", "Remaining pay"].map((name,i)=><div key={name} className={`${panel} ${i===4 ? "col-span-2 border-accent/30 bg-accent-soft/20" : ""}`}><p className="text-xs text-text-muted">{name}</p><p className="mt-1 text-base font-semibold text-text">AED —</p></div>)}</div></div>
  );
  if (page === "documents") return (
    <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Documents</span><FolderLock className="h-4 w-4 text-accent"/></div>{["Passport", "Visa", "Emirates ID"].map((name,i)=><div key={name} className={`${panel} flex items-center justify-between gap-2`}><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-accent"/><span className="text-sm text-text">{name}</span></div><span className={`text-xs ${i===0?"text-amber-600 dark:text-amber-400": "text-text-muted"}`}>{i===0?"Review expiry":"Document record"}</span></div>)}</div>
  );
  return (
    <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Activity logs</span><History className="h-4 w-4 text-accent"/></div><div className={`${panel} flex items-center gap-2 text-xs text-text-muted`}><Search className="h-4 w-4"/> Search activities and workers</div>{["Work records added", "Hourly rates updated", "Worker profile updated"].map((action,i)=><div key={action} className="flex gap-3 border-b border-border pb-3 last:border-0"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft"><History className="h-4 w-4 text-accent"/></div><div><p className="text-xs font-semibold text-text">{action}</p><p className="mt-1 text-[11px] text-text-muted">Activity {i+1} · UAE time</p></div></div>)}</div>
  );
}

function RetryMessage({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-left">
      <p className="text-sm font-semibold text-text">Couldn't connect to Workforce</p>
      <p className="mt-1 text-xs leading-5 text-text-muted">The server may be starting or temporarily unavailable.</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent hover:bg-accent-soft"><RefreshCw className="h-4 w-4"/> Try again</button>}
    </div>
  );
}

function LoginLoading({ error, onRetry, dark, onToggleTheme }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-paper px-5 py-10 text-text">
      <button type="button" onClick={onToggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-text transition-colors hover:border-accent hover:bg-accent-soft">
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface px-6 py-9 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-white">W</div>
        <h1 className="mt-5 text-xl font-bold">Workforce</h1>
        <p className="mt-1 text-xs text-text-muted">Internal workforce management</p>
        <div className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft"><ShieldCheck className="h-8 w-8 text-accent"/></div>
        <h2 className="mt-5 text-base font-semibold">{error ? "Connection unavailable" : "Setting up Workforce for login…"}</h2>
        <p className="mt-2 text-sm text-text-muted">{error ? "Please try again." : "Connecting securely to the server"}</p>
        {!error && <div className="mt-5 flex justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-accent"/></div>}
        <RetryMessage error={error} onRetry={onRetry}/>
      </div>
    </main>
  );
}

// mode="login" -> compact connection screen before showing login
// mode="tour"  -> an intentional feature tour; stays mounted after the API is ready.
// Parent MUST keep the tour rendered until user explicitly chooses Go to Login.
// Go to Login opens a modal using the existing Login.jsx component.
export default function BackendLoadingScreen({ mode = "tour", error = "", onRetry, ready = false }) {
  const [active, setActive] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    // If your app uses a ThemeProvider or persists a setting, call its setter here instead.
  }

  const containerRef = useRef(null);
  const pageRefs = useRef([]);

  useEffect(() => {
    if (mode !== "tour" || typeof IntersectionObserver === "undefined") return;
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio-a.intersectionRatio)[0];
        if (visible) setActive(Number(visible.target.dataset.index));
      },
      { root, threshold: [0.3,0.5,0.7] }
    );
    pageRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [mode]);

  if (mode === "login") return <LoginLoading error={error} onRetry={onRetry} dark={dark} onToggleTheme={toggleTheme} />;

  return (
    <main ref={containerRef} className="h-screen overflow-y-auto overscroll-y-contain snap-y snap-proximity scroll-smooth bg-paper text-text" aria-label="Workforce feature tour">
      <header className="sticky top-0 z-30 border-b border-border bg-paper/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent font-bold text-white">W</div><div><p className="text-sm font-bold leading-tight text-text">Workforce</p><p className="text-[11px] text-text-muted">Explore your workspace</p></div></div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-text-muted md:inline-flex">
              {error ? <RefreshCw className="h-4 w-4 text-rose-500"/> : ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> : <LoaderCircle className="h-4 w-4 animate-spin text-accent"/>}
              {error ? "Connection unavailable" : ready ? "Ready to sign in" : "Connecting…"}
            </span>
            <button type="button" onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text hover:border-accent hover:bg-accent-soft">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={error ? onRetry : ready ? () => setLoginOpen(true) : undefined}
              disabled={!ready && !error}
              aria-busy={!ready && !error}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
            >
              {error ? (
                <><RefreshCw className="h-4 w-4" /> Retry connection</>
              ) : !ready ? (
                <><LoaderCircle className="h-4 w-4 animate-spin" /> Connecting…</>
              ) : (
                <><LogIn className="h-4 w-4" /> Go to Login</>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="pointer-events-none fixed right-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 xl:flex">
        {TOUR.map((page,i) => (
          <button key={page.id} type="button" aria-label={`Jump to ${page.label}`} aria-current={active===i?"step":undefined} title={page.label}
            className={`pointer-events-auto h-2.5 w-2.5 rounded-full transition-all ${active===i?"scale-125 bg-accent":"bg-border hover:bg-accent/60"}`}
            onClick={() => pageRefs.current[i]?.scrollIntoView({behavior:"smooth",block:"start"})}/>
        ))}
      </div>

      {TOUR.map((page, index) => {
        const Icon = page.Icon;
        return (
          <section key={page.id} data-index={index} ref={el => { pageRefs.current[index]=el; }}
            className="flex min-h-[calc(100vh-64px)] snap-start scroll-mt-16 items-center px-5 py-12 sm:px-10 sm:py-16">
            <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft/40 px-3 py-1.5 text-xs font-semibold text-accent"><Icon className="h-4 w-4"/>{page.eyebrow}</div>
                <h2 className="mt-5 max-w-xl text-3xl font-bold tracking-tight text-text sm:text-4xl lg:text-5xl">{page.title}</h2>
                <p className="mt-5 max-w-lg text-sm leading-7 text-text-muted sm:text-base">{page.description}</p>
                <ul className="mt-6 space-y-3">{page.features.map(feature=><li key={feature} className="flex items-start gap-2 text-sm text-text"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent"/>{feature}</li>)}</ul>
                <div className="mt-8 flex items-center gap-4 text-xs text-text-muted"><span>{String(index+1).padStart(2,"0")} / {String(TOUR.length).padStart(2,"0")}</span><div className="h-1 w-28 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-accent transition-all" style={{width:`${((index+1)/TOUR.length)*100}%`}}/></div>{index < TOUR.length-1 && <button type="button" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline" onClick={()=>pageRefs.current[index+1]?.scrollIntoView({behavior:"smooth",block:"start"})}>Next <ArrowRight className="h-3.5 w-3.5"/></button>}</div>
              </div>
              <div className="rounded-[28px] border border-border bg-surface p-3 shadow-xl shadow-black/5 sm:p-5">
                <div className="rounded-2xl border border-border bg-paper/60 p-4 sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-accent"/><span className="text-xs font-semibold text-text">{page.label}</span></div><span className="text-[10px] text-text-muted">Illustrative preview</span></div>
                  <DemoPanel page={page.id}/>
                </div>
              </div>
            </div>
          </section>
        );
      })}
      {loginOpen && <Login modal onClose={() => setLoginOpen(false)} />}
      <footer className="px-5 pb-10 text-center">
        <div className="mx-auto max-w-md">
          {error ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              The server is unavailable. Use Retry connection at the top to try again.
            </p>
          ) : (
            <p className="mt-4 text-xs text-text-muted">
              {ready
                ? "Explore at your own pace. Select Go to Login to open the sign-in form."
                : "Explore the features while Workforce connects to the server."}
            </p>
          )}
        </div>
      </footer>
    </main>
  );
}
