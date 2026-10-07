# YTS Backend — Phase 2

Node.js + Express + Prisma + PostgreSQL API. Implements authentication and
the core CRUD APIs (companies, workers, clients, roles, worker assignments).
Timesheets/Excel import (Phase 3), object storage for documents (Phase 5),
and work-record-dependent features (calendar, monthly stats) land in later
phases — the schema for all of them is already final here so nothing in this
phase will need a breaking migration later.

## Setup

```bash
cd backend
cp .env.example .env        # then edit DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npm install

# Create the database schema
npx prisma migrate dev --name init

# Recommended: also apply the manual SQL for constraints Prisma can't express
# (overlap prevention on worker_assignments, one-ACTIVE-upload-per-month).
# Run this against your database after the migration above:
psql "$DATABASE_URL" -f prisma/manual_migrations/001_exclusion_and_partial_unique.sql

npm run seed                # 4 users, 3 companies, 5 roles, 4 clients, 15 workers, assignments
npm run dev                 # http://localhost:4000
```

Seeded login: `admin@yts.local` / `ChangeMe123!` (see `prisma/seed.js` for
the other 3 users — change all passwords before using this anywhere beyond
your own machine).

The frontend's Vite dev server proxies `/api` to `http://localhost:4000` per
its `vite.config.js`, so no frontend changes are needed for these endpoints
to work once both are running.

## What's implemented in Phase 2

**Auth** — stateless JWT held in an httpOnly, `secure` (in production),
`sameSite=lax` cookie. No session table / Redis: the token itself is the
session, verified on every request in `requireAuth`, which also re-fetches
the user from the DB so a deleted account is rejected immediately rather
than staying valid until the token expires.

- `POST /api/auth/login` — public, rate-limited (10 attempts / 15 min)
- `POST /api/auth/logout` — clears the cookie
- `GET /api/me` — current user

**Companies**
- `GET /api/companies` — list with worker counts
- `GET /api/companies/:id`
- `POST /api/companies`

**Clients**
- `GET /api/clients?search=&active=` 
- `GET /api/clients/:id`
- `POST /api/clients`
- `PUT /api/clients/:id`

**Roles** (read-only; the 5 codes are fixed lookup data seeded once — see
`roles.controller.js` for why there's no create endpoint yet)
- `GET /api/roles`

**Workers**
- `GET /api/workers?search=&companyId=&clientId=&page=&pageSize=` — list view
  intentionally omits passport/visa/Emirates ID numbers; only the full
  `GET /api/workers/:id` returns them
- `GET /api/workers/:id` — full profile as far as the DB has data (company,
  assignment history); documents and work calendar arrive in later phases
- `POST /api/workers`
- `PUT /api/workers/:id` — cannot change `companyId` or `workerCode`, per
  spec ("a worker permanently belongs to exactly one company")
- `GET /api/workers/:id/assignments`
- `POST /api/workers/:id/assignments` — rejects a new assignment that
  overlaps an existing one for that worker, inside a transaction

All of the above except `POST /api/auth/login` require the session cookie.

## Security notes / trade-offs

- **Email case-insensitivity**: enforced in application code (`normalizeEmail`
  lowercases before every read/write) rather than a Postgres `citext` column.
  Simpler for 4 known users; the trade-off is that a raw SQL query bypassing
  `password.js` could violate the invariant — there's no such query anywhere
  in this codebase, but keep that constraint in mind if you add one.
- **Assignment overlap**: checked inside a Prisma transaction at the app
  layer. `prisma/manual_migrations/001_exclusion_and_partial_unique.sql` adds
  a real Postgres `EXCLUDE USING gist` constraint as a second line of
  defense — apply it after your first migration.
- **One ACTIVE timesheet per company/month**: same manual migration adds a
  partial unique index for this once Phase 3 starts writing upload rows.
- Passwords are hashed with **argon2id**. Login returns an identical error
  for "no such user" and "wrong password" to avoid leaking which emails have
  accounts.
- `helmet()` sets standard security headers; CORS is locked to `CORS_ORIGIN`
  with `credentials: true` so only your frontend origin can use the cookie.
- Nothing logs passwords, password hashes, or (once Phase 5 adds them)
  document storage keys — the error handler only ever logs `err.message`.
- List endpoints (`/api/workers`, `/api/clients`) return only what a table
  row needs to display — no passport/visa numbers in list responses.
