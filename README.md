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
APP_ENV=production uvicorn hello_api.main:app --port $PORT # set automatically by Procfile on Railway
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

### Railway — Python services

1. New Project → Deploy from GitHub → select this repo
2. Root Directory: `.` (repo root)
3. Railway reads `Procfile` (sets `APP_ENV=production`) and `pyproject.toml` automatically
4. Add env vars in Railway dashboard:
   - `HELLO_API_URL` = this service's own Railway URL (used for inter-service calls)
   - any other API keys the service needs
5. Every push to `main` auto-deploys

### Vercel — TypeScript services

1. New Project → Import from GitHub → select this repo
2. Root Directory: `src/services/typescript/hello_ui`
3. Vercel auto-detects Vite; build command `npm run build`, output `dist`
4. Update `src/services/typescript/hello_ui/.env.production` with the Railway URL, then push
5. Every push to `main` auto-deploys

### CI

GitHub Actions runs on every push and PR:
- **Python job**: `uv sync` → `pytest`
- **TypeScript job**: `npm ci` → `tsc` typecheck → `vite build`
