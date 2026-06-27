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

### Dev (deployed on every PR)

| Resource | URL |
|---|---|
| Master UI | https://trading-strategies.duckdns.org/dev/ |
| hello_api | https://trading-strategies.duckdns.org/dev/api/hello/ |
| hello_api docs | https://trading-strategies.duckdns.org/dev/api/hello/docs |
| txn_cost_api | https://trading-strategies.duckdns.org/dev/api/txn-cost/ |
| txn_cost_api docs | https://trading-strategies.duckdns.org/dev/api/txn-cost/docs |

---

## Services

### Python APIs

| Service | Path | Local port | Dockerfile |
|---|---|---|---|
| hello_api | `src/services/python/hello_api/` | 8000 | `Dockerfile.hello_api` |
| txn_cost_api | `src/services/python/txn_cost_api/` | 8002 | `Dockerfile.txn_cost_api` |

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

## Adding a new Python service

1. Create `src/services/python/<name>/` with a FastAPI app
   - Must include `GET /` (returns endpoint list) and `GET /health`
2. Create `src/libs/<name>/` if a shared lib is needed; add to `pyproject.toml` workspace
3. Create `Dockerfile.<name>` at repo root — copy pattern from `Dockerfile.hello_api`
4. Add service block to **both** `docker-compose.prod.yml` and `docker-compose.dev.yml`:
   ```yaml
   # prod (docker-compose.prod.yml) — use port in 8000-8009 range, tag :latest
   <name>:
     image: ghcr.io/tradestrats1929/trading-strategies/<name>:latest
     restart: unless-stopped
     ports: ["127.0.0.1:<port>:<port>"]
     command: python -m uvicorn <name>.main:app --host 0.0.0.0 --port <port> --root-path /prod/api/<name>

   # dev (docker-compose.dev.yml) — use port in 8010-8019 range, tag :dev
   <name>_dev:
     image: ghcr.io/tradestrats1929/trading-strategies/<name>:dev
     restart: unless-stopped
     ports: ["127.0.0.1:<dev-port>:<dev-port>"]
     command: python -m uvicorn <name>.main:app --host 0.0.0.0 --port <dev-port> --root-path /dev/api/<name>
   ```
5. Add path filter entry in **both** `.github/workflows/deploy.yml` and `deploy-dev.yml`
6. Add build job (copy `build-hello-api` pattern) in both workflows
7. Add `/prod/api/<name>/` and `/dev/api/<name>/` proxy blocks in `deploy/nginx.conf`
8. Add a card in `src/services/typescript/trading-strategies-ui/src/pages/Landing.tsx`
9. Push to a PR → dev deploys automatically. Merge to `main` → prod deploys.
