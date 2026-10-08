import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ApiError } from "../api/client.js";

export default function Login() {
  const { status, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        err instanceof ApiError ? err.message : "Couldn't sign in. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-accent text-base font-bold text-white">
            W
          </div>
          <h1 className="text-lg font-semibold text-text">Workforce</h1>
          <p className="text-sm text-text-muted">Internal management console</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-surface p-6 shadow-card"
        >
          <div className="mb-4">
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.ae"
            />
          </div>

          <div className="mb-5">
          <label htmlFor="password" className="label">
            Password
          </label>

          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="input pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-muted hover:text-text"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3l18 18M10.58 10.58a2 2 0 102.83 2.83M9.88 4.24A9.77 9.77 0 0112 4c5 0 8.5 4 9.5 8a10.6 10.6 0 01-2.04 3.77M6.1 6.1C4.35 7.37 3.25 9.3 2.5 12c1 4 4.5 8 9.5 8 1.61 0 3.08-.37 4.37-1.02"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.5 12s3.5-8 9.5-8 9.5 8 9.5 8-3.5 8-9.5 8-9.5-8-9.5-8z"
                  />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              )}
            </button>
          </div>
        </div>

          {error && (
            <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Signing in&hellip;" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-text-muted">
          Access is limited to authorized staff. Contact an admin if you need an account.
        </p>
      </div>
    </div>
  );
}
