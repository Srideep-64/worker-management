# Workforce &mdash; Frontend

React + Vite + JavaScript + Tailwind CSS frontend for the internal labor-supply
management app. This is the app shell only: layout, routing, auth wiring, and
stub pages for every section. It talks to an Express API (Phase 2 of this
project) that doesn't exist yet, so every page currently shows an empty state
where real data will go.

## Stack

- **React 18** with **Vite** (JavaScript, not TypeScript)
- **React Router v6** for routing, including a protected-route wrapper
- **Tailwind CSS** for styling, with a small design-token layer in
  `tailwind.config.js` (colors, radii, shadow)
- **lucide-react** for icons

## Getting started

```bash
cd frontend
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`. It proxies any request to
`/api/*` through to `http://localhost:4000` (see `vite.config.js`), which is
where the Express backend from Phase 2 will run. No CORS configuration is
needed in development because of this proxy.

Copy `.env.example` to `.env` if you want to override `VITE_APP_NAME`. There
are no secrets in the frontend `.env` &mdash; storage credentials and other
secrets live only in the backend, never in code that ships to the browser.

## How auth is wired

- `src/context/AuthContext.jsx` holds the current session. On load it calls
  `GET /api/me`; if that succeeds you're "authenticated", if it 401s you're
  "anonymous".
- `src/routes/ProtectedRoute.jsx` redirects to `/login` when anonymous, and
  back to the originally requested page after a successful login.
- `src/api/client.js` is a thin `fetch` wrapper that always sends
  `credentials: "include"`, because auth is a secure, httpOnly cookie set by
  the backend on `POST /api/auth/login` &mdash; the frontend never sees or
  stores a token itself.

Until Phase 2 exists, `/api/me` will fail (no backend to answer it), so the
app will always land you on `/login`, and submitting the login form will show
a "couldn't sign in" error. That's expected: the wiring is correct, there's
just nothing behind it yet.

## Project structure

```
src/
  api/client.js            fetch wrapper (auth cookie, JSON, error handling)
  context/AuthContext.jsx  session state, login/logout
  routes/ProtectedRoute.jsx auth guard for the app shell
  components/
    layout/                Sidebar, Topbar, AppLayout (the app shell)
    ui/                    Card, Badge, StatCard, EmptyState (shared primitives)
  pages/                   One file per nav section, plus detail pages
  App.jsx                  Route table
  main.jsx                 Entry point (BrowserRouter + AuthProvider)
```

## Design notes

- **Palette**: warm neutral background (`paper`), near-black `ink` for the
  sidebar, and an amber `accent` (nods to hi-vis workwear, common across UAE
  construction/labor sites) for primary actions. Status colors (worked /
  absent / holiday / weekly-off, and timesheet upload statuses) are centralized
  in `Badge.jsx` so a status always reads the same way everywhere.
- **Type**: Inter throughout, with `tabular-nums` on numeric table cells
  (hours, counts) so columns of numbers align cleanly &mdash; this is a
  data-dense internal tool, not a marketing site.
- **Layout**: fixed left sidebar, desktop-first, left-aligned content, plain
  tables and cards. No unnecessary animation, per the brief.

## What's stubbed vs. real

Real and working right now:
- Routing, the protected-route guard, the app shell (sidebar/topbar), and all
  page scaffolding.
- The `api/client.js` contract and `AuthContext` are written against the real
  API shape from the project spec (`POST /api/auth/login`, `POST
  /api/auth/logout`, `GET /api/me`) so Phase 2 should need no changes here.

Stubbed, waiting on the backend:
- Every list/detail page shows a static empty state instead of live data.
- Search/filter inputs and some buttons are rendered but disabled.
- Dashboard stats and tables use hardcoded placeholder data, clearly isolated
  at the top of `pages/Dashboard.jsx` for easy removal.

## Next steps (later phases)

1. Build the Express + Prisma + PostgreSQL backend (Phase 2).
2. Replace placeholder data in `pages/*.jsx` with real `api.get(...)` calls,
   typically in a `useEffect` + `useState` pair per page (or a small data
   hook per resource if that gets repetitive).
3. Build out the Excel import flow on the Timesheets page (Phase 3).
4. Build out the worker calendar and document viewer (Phase 5).
