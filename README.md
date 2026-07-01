# Trading Strategies

Monorepo for trading fund infrastructure. Python microservices on Oracle Cloud (OCI), single React UI served by Nginx.

## Live URLs

### Prod (deployed on merge to `main`)

| Resource | URL |
|---|---|
| Master UI | https://trading-strategies.duckdns.org/prod/ |
| hello_api | https://trading-strategies.duckdns.org/prod/api/hello/ |
| hello_api docs | https://trading-strategies.duckdns.org/prod/api/hello/docs |
| txn_cost_api | https://trading-strategies.duckdns.org/prod/api/txn-cost/ |
| txn_cost_api docs | https://trading-strategies.duckdns.org/prod/api/txn-cost/docs |
| angel_api | https://trading-strategies.duckdns.org/prod/api/angel/ |
| angel_api docs | https://trading-strategies.duckdns.org/prod/api/angel/docs |

### Dev (deployed on every PR)

| Resource | URL |
|---|---|
| Master UI | https://trading-strategies.duckdns.org/dev/ |
| hello_api | https://trading-strategies.duckdns.org/dev/api/hello/ |
| hello_api docs | https://trading-strategies.duckdns.org/dev/api/hello/docs |
| txn_cost_api | https://trading-strategies.duckdns.org/dev/api/txn-cost/ |
| txn_cost_api docs | https://trading-strategies.duckdns.org/dev/api/txn-cost/docs |
| angel_api | https://trading-strategies.duckdns.org/dev/api/angel/ |
| angel_api docs | https://trading-strategies.duckdns.org/dev/api/angel/docs |

---

## Services

### Python APIs

| Service | Path | Local port | Dockerfile |
|---|---|---|---|
| hello_api | `src/services/python/hello_api/` | 8000 | `Dockerfile.hello_api` |
| txn_cost_api | `src/services/python/txn_cost_api/` | 8002 | `Dockerfile.txn_cost_api` |
| system_monitor | `src/services/python/system_monitor/` | 8004 | `Dockerfile.system_monitor` |
| angel_api | `src/services/python/angel_api/` | 8006 | `Dockerfile.angel_api` |

### Shared libs

| Lib | Path | Used by |
|---|---|---|
| hello_lib | `src/libs/hello_lib/` | hello_api |
| txn_cost | `src/libs/txn_cost/` | txn_cost_api |

### UI

| Service | Path | Local port |
|---|---|---|
| trading-strategies-ui | `src/services/typescript/trading-strategies-ui/` | 5173 |

---

## Local development

```bash
# Install Python deps
uv sync --all-groups

# Start all Python services
uv run uvicorn hello_api.main:app --port 8000 &
uv run uvicorn txn_cost_api.main:app --port 8002 &

# Start master UI (reads localhost URLs from .env.development)
cd src/services/typescript/trading-strategies-ui
npm install && npm run dev
# → http://localhost:5173
```

---

## Infrastructure

| Component | Technology |
|---|---|
| Server | Oracle Cloud Always Free — 4 OCPU, 24 GB RAM, Ubuntu 22.04 (ap-mumbai-1) |
| Domain | DuckDNS — `trading-strategies.duckdns.org` |
| SSL | Let's Encrypt (auto-renews every 90 days) |
| Container runtime | Docker Compose |
| Image registry | GitHub Container Registry (GHCR) |
| Reverse proxy | Nginx |

### OCI server layout

```
/opt/trading-strategies/
├── docker-compose.prod.yml   ← prod services (ports 8000, 8002), image tag :latest
└── docker-compose.dev.yml    ← dev services  (ports 8010, 8012), image tag :dev

/var/www/trading-strategies-ui/
├── prod/   ← prod UI dist, base path /prod/
└── dev/    ← dev UI dist,  base path /dev/

/etc/nginx/sites-available/trading-strategies.conf  ← managed by CI deploy
```

---

## CI/CD

### `ci.yml` — runs on every push and PR

- **Python**: `uv sync --all-groups` → `pytest` for all libs and services
- **TypeScript**: `npm ci` → `tsc --noEmit` → `vite build` for the master UI

### `deploy.yml` — runs on push to `main` → deploys prod

| Phase | What happens |
|---|---|
| Detect | `dorny/paths-filter` checks which services/libs/infra changed |
| Build | Rebuild changed services → push `:latest` images to GHCR |
| Deploy | SSH into OCI → pull new images → restart only changed prod containers |
| UI | If UI changed: SCP `dist/` to `/var/www/trading-strategies-ui/prod/` |
| Nginx | If `deploy/nginx.conf` or `docker-compose.prod.yml` changed: reload Nginx |

### `deploy-dev.yml` — runs on every PR → deploys dev

| Phase | What happens |
|---|---|
| Detect | `dorny/paths-filter` checks which services/libs/infra changed |
| Build | Rebuild changed services → push `:dev` images to GHCR |
| Deploy | SSH into OCI → pull new images → restart only changed dev containers |
| UI | If UI changed: SCP `dist/` to `/var/www/trading-strategies-ui/dev/` |
| Nginx | If `deploy/nginx.conf` or `docker-compose.dev.yml` changed: reload Nginx |

Dev and prod run as **separate Docker containers on separate ports** — they share the OCI VM but are fully isolated processes. A restart of a dev container never touches prod.

### Required GitHub Secret

| Secret | Value |
|---|---|
| `OCI_SSH_PRIVATE_KEY` | Full contents of the OCI private key file |

---

## Angel One Setup

The `angel_api` service connects to [Angel One SmartAPI](https://smartapi.angelbroking.com). Authentication is fully automated — no daily manual login required.

### 1. Create two apps on Angel One developer portal

1. Log in to https://smartapi.angelbroking.com
2. Create **two apps** — one for prod, one for dev:
   - Name: e.g. `trading-strategies-prod` / `trading-strategies-dev`
   - Redirect URL: `https://trading-strategies.duckdns.org` (placeholder — not used in the login flow)
3. Copy the **API Key** for each app.

### 2. Enable TOTP on your Angel One account

In the Angel One mobile app: Profile → Security → Enable TOTP. Scan the QR code with an authenticator app and note the **TOTP secret** (the base-32 seed).

### 3. Add credentials to the OCI server

SSH into the OCI server and append to `/opt/trading-strategies/.env`:

```bash
ANGEL_CLIENT_ID=A123456          # your Angel One client ID
ANGEL_MPIN=1234                  # your Angel One MPIN (4-digit PIN)
ANGEL_TOTP_SECRET=BASE32STRING   # TOTP seed from step 2
ANGEL_API_KEY_PROD=aBcD1234      # prod app API key from step 1
ANGEL_API_KEY_DEV=xYzW5678       # dev  app API key from step 1
ANGEL_INTERNAL_SECRET=$(openssl rand -hex 16)   # shared secret for /internal/ endpoints
```

### 4. Restart the container

```bash
cd /opt/trading-strategies
docker compose -f docker-compose.prod.yml up -d --force-recreate angel_api
```

The service logs in automatically on startup, downloads the Nifty options instrument master, and starts the WebSocket. It re-authenticates itself every day at 8:45 AM IST.

---

## Adding a new Python service

### 1. Create the service

```
src/services/python/<name>/
├── pyproject.toml          ← add service-metrics as a dependency
└── <name>/
    ├── __init__.py
    └── main.py
```

`main.py` minimum:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from service_metrics import MetricsMiddleware, metrics_router

app = FastAPI(title="<Name> API")
app.add_middleware(MetricsMiddleware)      # ← required for system_monitor API Inspector
app.include_router(metrics_router)         # ← exposes GET /metrics and is found by system_monitor
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health(): return {"status": "ok"}
```

### 2. Create a shared lib (optional)

If you need a lib: `src/libs/<name>/` with its own `pyproject.toml`, then add to the root `pyproject.toml` workspace members and reference `{ workspace = true }` in the service's sources.

### 3. Scaffold remaining files

**`Dockerfile.<name>`** — copy `Dockerfile.hello_api`, update the `pip install` line:
```dockerfile
RUN pip install --no-cache-dir -e src/libs/service_metrics -e src/services/python/<name>
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ENV SERVICE_NAME=<name>
ENV GIT_COMMIT=$GIT_COMMIT
ENV GIT_BRANCH=$GIT_BRANCH
```

**`docker-compose.prod.yml`** — pick a port in the `800x` range:
```yaml
<name>:
  image: ghcr.io/tradestrats1929/trading-strategies/<name>:latest
  restart: unless-stopped
  ports: ["127.0.0.1:<port>:<port>"]
  command: python -m uvicorn <name>.main:app --host 0.0.0.0 --port <port> --root-path /prod/api/<name>
```

**`docker-compose.dev.yml`** — pick a dev port in the `801x` range:
```yaml
<name>_dev:
  image: ghcr.io/tradestrats1929/trading-strategies/<name>:dev
  restart: unless-stopped
  ports: ["127.0.0.1:<dev-port>:<dev-port>"]
  command: python -m uvicorn <name>.main:app --host 0.0.0.0 --port <dev-port> --root-path /dev/api/<name>
```

**`deploy/nginx.conf`** — add two location blocks (prod + dev):
```nginx
location /prod/api/<name>/ { proxy_pass http://127.0.0.1:<port>/; ... }
location /dev/api/<name>/  { proxy_pass http://127.0.0.1:<dev-port>/; ... }
```

**`.github/workflows/deploy.yml` and `deploy-dev.yml`** — add to `changes` filters and add a `build-<name>` job (copy `build-hello-api` pattern), with `build-args: GIT_COMMIT/GIT_BRANCH`.

**`pyproject.toml`** — add `src/services/python/<name>` to the `[tool.uv.workspace] members` list.

### 4. Wire into system_monitor

In `src/services/python/system_monitor/system_monitor/main.py`, add an entry to `_SERVICES`:
```python
{
    "name": "<name>",
    "display_name": "<Display Name>",
    "internal_url": os.getenv("<NAME>_URL", "http://<name>:<port>"),
},
```

Also add the env var to both compose files:
```yaml
environment:
  - <NAME>_URL=http://<name>:<port>       # prod
  - <NAME>_URL=http://<name>_dev:<dev-port>  # dev
```

### 5. Wire into the UI

Add a card in `src/services/typescript/trading-strategies-ui/src/pages/Landing.tsx` and a route in `App.tsx`.

### 6. Deploy

Push to a PR → dev deploys automatically. Merge to `main` → prod deploys.
