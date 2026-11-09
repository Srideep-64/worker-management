import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { ApiError } from "../api/client.js";

// Without modal=true this still works as your existing standalone /login page.
export default function Login({ modal = false, onClose }) {
  const { status, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, onClose, submitting]);

  if (status === "authenticated") {
    const redirectTo = location.state?.from?.pathname || "/";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't sign in. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const content = (
    <div className="w-full max-w-sm">
      <div className="mb-7 flex flex-col items-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">W</div>
        <h1 id={modal ? "workforce-login-title" : undefined} className="text-xl font-semibold text-text">Sign in to Workforce</h1>
        <p className="mt-1 text-sm text-text-muted">Internal management console</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <div className="mb-4">
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" autoComplete="username" required autoFocus={modal}
            className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@workforce.ae" />
        </div>
        <div className="mb-5">
          <label htmlFor="password" className="label">Password</label>
          <div className="relative">
            <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required
              className="input pr-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
            <button type="button" onClick={() => setShowPassword((current) => !current)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-muted hover:text-text"
              aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {error && <div role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-text-muted">Access is limited to authorized staff. Contact an admin if you need an account.</p>
    </div>
  );

  if (!modal) {
    return <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-8">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm"
      role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose?.(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="workforce-login-title"
        className="relative my-auto w-full max-w-md rounded-2xl border border-border bg-paper p-5 shadow-2xl sm:p-7">
        <button type="button" onClick={onClose} disabled={submitting} aria-label="Close login"
          className="absolute right-3 top-3 rounded-lg p-2 text-text-muted hover:bg-accent-soft hover:text-text disabled:opacity-50">
          <X className="h-5 w-5" />
        </button>
        {content}
      </div>
    </div>
  );
}