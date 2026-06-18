# Trading Strategies

Monorepo for trading strategy services. Python and TypeScript services share a common library layer and deploy independently via Railway and Vercel.

---

## Structure

```
src/
├── libs/
│   └── hello_lib/             # Shared Python library
└── services/
    ├── python/
    │   └── hello_api/         # FastAPI REST service
    └── typescript/
        └── hello_ui/          # React + Vite frontend
```

**libs** — reusable Python packages, consumed natively by Python services via uv workspace.  
**services/python** — each subdirectory is a FastAPI service with its own `pyproject.toml`.  
**services/typescript** — each subdirectory is a Vite app with its own `package.json`.

---

## How the POC services interact

```
hello_ui  (TypeScript)
    │  fetch /hello?name=…          via VITE_API_URL (localhost or Railway)
    ▼
hello_api  (Python / FastAPI)
    │  from hello_lib import greet  native uv workspace import
    ▼
hello_lib  (Python lib)
    │  greet(name) → "Hello, {name}! — from hello_lib"
    └─ get_env() → "local" | "production"
```

- **hello_lib** holds shared logic (greeting, env config, inter-service URLs). No HTTP involved.
- **hello_api** imports hello_lib directly and exposes results over REST (`GET /hello`).
- **hello_ui** calls hello_api over HTTP and renders the response.

This pattern scales: add more libs to `src/libs/`, more Python services to `src/services/python/` (each importing any lib), and point TypeScript services at whichever Python service they need via `VITE_API_URL`.

---

## Stack

| Layer | Tech | Hosting |
|-------|------|---------|
| Python services | FastAPI · uvicorn · uv workspace | Railway |
| TypeScript services | React · Vite · TypeScript | Vercel |
| CI | GitHub Actions | — |

---

## Environments

Two environments: `local` and `production`.

### Python services

Set `APP_ENV` as a prefix to any command:

```bash
APP_ENV=local uv run uvicorn hello_api.main:app --reload   # default; omit APP_ENV for same effect
APP_ENV=production .venv/bin/uvicorn hello_api.main:app --port $PORT # set automatically by railway.toml
```

`hello_lib.config.get_service_urls()` returns localhost URLs in `local` and reads required env vars (`HELLO_API_URL`, etc.) in `production`.

### TypeScript services

Vite loads the matching `.env` file automatically based on the command:

| Command | Env file loaded | Points to |
|---------|----------------|-----------|
| `npm run dev` | `.env.development` | `http://localhost:8000` |
| `npm run build` | `.env.production` | Railway URL |

Update `src/services/typescript/hello_ui/.env.production` with your Railway URL after first deploy.

---

## Run locally

```bash
# Python API (terminal 1)
uv sync
APP_ENV=local uv run uvicorn hello_api.main:app --reload
# → http://localhost:8000/hello?name=you

# UI (terminal 2)
cd src/services/typescript/hello_ui
npm install
npm run dev
# → http://localhost:5173
```

---

## Deploy

**Dashboards:** [Railway](https://railway.com/project/1edb5667-6f5c-44c5-a143-22dcea5daed6) · [Vercel](https://vercel.com/tradingstrategies1929/trading-strategies)

### Opening a PR

1. Push your branch and open a PR against `main` on GitHub — PR must be opened by the **tradestrats1929** GitHub account for Railway to create the PR environment
2. GitHub Actions runs CI (Python tests + TypeScript typecheck/build) — must pass
3. **Railway** automatically spins up an isolated PR environment for the Python API
4. In Railway → Project Settings → Integrations → Vercel, set **Preview environment** to the newly created PR environment (e.g. `Trading-Strategies-pr-N`) — this wires the correct Railway URL into the Vercel preview build
5. **Vercel** automatically builds a preview deployment for the UI with the correct `VITE_API_URL` injected
6. Both preview URLs appear in the PR checks on GitHub — use them to test your changes end-to-end before merging

### Merging to main

1. Merge the PR — Railway and Vercel both deploy to production automatically
2. Confirm in the Railway dashboard that the production deployment went green
3. Confirm on the Vercel dashboard that the production build succeeded
4. Hit the [production UI](https://trading-strategies-eight.vercel.app) to verify

### CI

GitHub Actions runs on every push and PR:
- **Python job**: `uv sync` → `pytest`
- **TypeScript job**: `npm ci` → `tsc` typecheck → `vite build`
