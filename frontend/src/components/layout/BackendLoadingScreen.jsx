
import {
  Building2,
  CalendarCheck,
  RefreshCw,
  LoaderCircle,
  ChartNoAxesColumn,
  UserShieldIcon,
  FileDown,
  LucideUpload
} from "lucide-react";

const items = [
  { label: "Upload", Icon: LucideUpload },
  { label: "Companies", Icon: Building2},
  { label: "Work records", Icon: CalendarCheck },
  { label: "Documents", Icon: FileDown },
  { label: "Monthly Stats", Icon: ChartNoAxesColumn},
];

export default function BackendLoadingScreen({
  error = "",
  onRetry,
}) {
  const unavailable = Boolean(error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-10 text-text">
      <div className="w-full max-w-md text-center">
        {/* Workforce branding */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-xl font-bold text-white shadow-sm">
            W
          </div>

          <h1 className="text-xl font-semibold tracking-tight">
            Workforce
          </h1>

          <p className="mt-1 text-sm text-text-muted">
            Internal management console
          </p>
        </div>

        {/* Animated application modules */}
        <div className="relative mx-auto mb-8 flex h-56 w-full max-w-xs items-center justify-center">
          {/* Decorative orbit */}
          <div className="absolute h-44 w-44 rounded-full border border-dashed border-border animate-[spin_24s_linear_infinite]" />

          <div className="absolute h-32 w-32 rounded-full border border-accent/20" />

          {/* Central logo */}
          {/* Central runner */}


<div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-surface shadow-card">
  <span className="absolute inset-0 animate-ping rounded-2xl border-2 border-accent opacity-30" />
  <UserShieldIcon className="h-10 w-10 text-accent" strokeWidth={1.6} style={{ animation: "workforce-float 2.4s ease-in-out infinite" }} />
</div>

          {/* Five application icons */}
          {items.map(({ label, Icon }, index) => {
            const positions = [
              "left-1/2 top-0 -translate-x-1/2",
              "right-0 top-1/4",
              "right-1/4 bottom-0",
              "left-1/4 bottom-0",
              "left-0 top-1/4",
            ];

            return ( 
                <div
                key={label}
                title={label}
                className={`absolute ${positions[index]} z-20`}
                >
                <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface text-accent shadow-card"
                    style={{
                    animation: "workforce-float 2.4s ease-in-out infinite",
                    animationDelay: `${index * 0.18}s`,
                    }}
                >
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                </div>
            );
          })}
        </div>

        {/* Status message */}
        {unavailable ? (
          <>
            <h2 className="text-lg font-semibold">
              Couldn't connect to Workforce
            </h2>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-text-muted">
              The server may still be starting up, or there may be a
              connection problem. Please try again.
            </p>

            <button
              type="button"
              onClick={onRetry}
              className="btn-primary mt-6 inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
              <h2 className="text-base font-semibold">
                Setting up Workforce…
              </h2>
            </div>

            <p className="mt-2 text-sm text-text-muted">
              Connecting securely to your workspace
            </p>

            <div className="mx-auto mt-6 h-1 w-40 overflow-hidden rounded-full bg-border">
              <div className="h-full w-1/2 rounded-full bg-accent animate-[loading-bar_1.6s_ease-in-out_infinite]" />
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes workforce-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }

        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
@keyframes wf-spin     { to { transform: rotate(360deg); } }
@keyframes wf-spin-rev { to { transform: rotate(-360deg); } }
@keyframes wf-bar {
  0%, 100% { transform: scaleY(0.3); }
  50%      { transform: scaleY(1); }
}

@media (prefers-reduced-motion: reduce) {
  [style*="wf-"] { animation: none !important; }
}
      `}</style>
    </main>
  );
}
