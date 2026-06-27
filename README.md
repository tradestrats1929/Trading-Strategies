# Trading Strategies

Monorepo for trading fund infrastructure. Python microservices on Oracle Cloud (OCI), single React UI served by Nginx.

## Live URLs

| Resource | URL |
|---|---|
| Master UI | https://trading-strategies.duckdns.org |
| hello_api | https://trading-strategies.duckdns.org/api/hello/ |
| hello_api docs | https://trading-strategies.duckdns.org/api/hello/docs |
| db_api | https://trading-strategies.duckdns.org/api/db/ |
| db_api docs | https://trading-strategies.duckdns.org/api/db/docs |
| txn_cost_api | https://trading-strategies.duckdns.org/api/txn-cost/ |
| txn_cost_api docs | https://trading-strategies.duckdns.org/api/txn-cost/docs |
| Neon dashboard | https://console.neon.tech/app/projects/jolly-term-01734691 |

---

## Services

### Python APIs

| Service | Path | Port (local) | Dockerfile |
|---|---|---|---|
| hello_api | `src/services/python/hello_api/` | 8000 | `Dockerfile.hello_api` |
| db_api | `src/services/python/db_api/` | 8001 | `Dockerfile.db_api` |
| txn_cost_api | `src/services/python/txn_cost_api/` | 8002 | `Dockerfile.txn_cost_api` |

### Shared libs

| Lib | Path | Used by |
|---|---|---|
| hello_lib | `src/libs/hello_lib/` | hello_api |
| db_helpers | `src/libs/db_helpers/` | db_api |
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
uv run uvicorn db_api.main:app --port 8001 &
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
| Database | Neon PostgreSQL (free tier) |

### OCI server layout

```
/opt/trading-strategies/
├── docker-compose.yml   ← managed by CI deploy
└── .env                 ← DATABASE_URL (set once manually, never committed)

/var/www/trading-strategies-ui/  ← UI static dist, managed by CI deploy

/etc/nginx/sites-available/trading-strategies.conf  ← managed by CI deploy
```

---

## CI/CD

### `ci.yml` — runs on every push and PR

- **Python**: `uv sync --all-groups` → `pytest` for all libs and services
- **TypeScript**: `npm ci` → `tsc --noEmit` → `vite build` for the master UI

### `deploy.yml` — runs on push to `main` only

| Phase | What happens |
|---|---|
| Detect | `dorny/paths-filter` checks which services/libs/infra changed |
| Build | Only changed services are rebuilt and pushed to GHCR |
| Deploy | SSH into OCI → pull new images → restart only changed containers |
| UI | If UI changed: SCP `dist/` to `/var/www/trading-strategies-ui/` |
| Nginx | If `deploy/nginx.conf` or `docker-compose.yml` changed: reload Nginx |

Push to main → only the touched service restarts. Unrelated services keep running untouched.

### Required GitHub Secret

| Secret | Value |
|---|---|
| `OCI_SSH_PRIVATE_KEY` | Full contents of the OCI private key file |

---

## Adding a new Python service

1. Create `src/services/python/<name>/` with a FastAPI app
   - Must include `GET /` (returns endpoint list) and `GET /health`
2. Create `src/libs/<name>/` if a shared lib is needed; add to `pyproject.toml` workspace
3. Create `Dockerfile.<name>` at repo root — copy pattern from `Dockerfile.hello_api`
4. Add service block to `docker-compose.yml`:
   ```yaml
   <name>:
     image: ghcr.io/tradestrats1929/trading-strategies/<name>:latest
     restart: unless-stopped
     ports: ["127.0.0.1:<port>:<port>"]
     command: python -m uvicorn <name>.main:app --host 0.0.0.0 --port <port> --root-path /api/<name>
   ```
5. Add path filter entry (5 lines) in `.github/workflows/deploy.yml` under the `changes` job
6. Add build job (copy `build-hello-api` pattern) in `deploy.yml`
7. Add `location /api/<name>/` proxy block in `deploy/nginx.conf`
8. Add a card in `src/services/typescript/trading-strategies-ui/src/pages/Landing.tsx`
9. Push to `main` → CI builds image, pushes to GHCR, SSHs into OCI, starts only that container
