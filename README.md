# YTS

Internal workforce management app for the labor-supply companies (companies
A, B, C). Not a public site &mdash; used by the owner and 3 assistants.

## Layout

```
YTS/
  frontend/   React + Vite + JavaScript + Tailwind CSS (done, stub data)
  backend/    Node.js + Express + Prisma + PostgreSQL (not built yet)
```

Each folder is self-contained with its own `package.json`, `.env.example`,
and README. There's no shared root `package.json` &mdash; run each side from
inside its own folder.

## Running it locally (once the backend exists)

```bash
# Terminal 1
cd backend
npm install
npm run dev        # http://localhost:4000

# Terminal 2
cd frontend
npm install
npm run dev         # http://localhost:5173, proxies /api to :4000
```

For now, only `frontend/` exists, so `GET /api/me` will fail and you'll land
on the login screen with a "couldn't sign in" error &mdash; expected until
the backend is built.

See `frontend/README.md` and `backend/README.md` for details on each side.
