import asyncio
import json
import os
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from service_metrics import MetricsMiddleware, metrics_router

# Each entry is polled every tick. Add new services here and in docker-compose.
_SERVICES = [
    {
        "name": "hello_api",
        "display_name": "Hello API",
        "internal_url": os.getenv("HELLO_API_URL", "http://hello_api:8000"),
    },
    {
        "name": "txn_cost_api",
        "display_name": "Transaction Cost API",
        "internal_url": os.getenv("TXN_COST_API_URL", "http://txn_cost_api:8002"),
    },
    {
        "name": "system_monitor",
        "display_name": "System Monitor",
        # Self-reference via loopback — service name on the Docker network also works
        "internal_url": os.getenv("SELF_URL", "http://localhost:8004"),
    },
]

_POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "3"))


async def _poll(client: httpx.AsyncClient, svc: dict) -> dict:
    url = svc["internal_url"]
    out: dict = {
        "name": svc["name"],
        "display_name": svc["display_name"],
        "health": "unknown",
        "last_heartbeat": None,
        "metrics": None,
        "error": None,
    }
    try:
        r = await client.get(f"{url}/health", timeout=2.0)
        if r.status_code == 200:
            out["health"] = "healthy"
            out["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
        else:
            out["health"] = "degraded"
    except Exception as exc:
        out["health"] = "unreachable"
        out["error"] = str(exc)

    try:
        r = await client.get(f"{url}/metrics", timeout=3.0)
        if r.status_code == 200:
            out["metrics"] = r.json()
    except Exception:
        pass

    return out


async def _stream():
    async with httpx.AsyncClient() as client:
        while True:
            results = await asyncio.gather(
                *[_poll(client, s) for s in _SERVICES],
                return_exceptions=True,
            )
            services = []
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    services.append({
                        "name": _SERVICES[i]["name"],
                        "display_name": _SERVICES[i]["display_name"],
                        "health": "unreachable",
                        "error": str(r),
                        "metrics": None,
                        "last_heartbeat": None,
                    })
                else:
                    services.append(r)

            payload = json.dumps({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "services": services,
            })
            yield f"data: {payload}\n\n"
            await asyncio.sleep(_POLL_INTERVAL)


app = FastAPI(title="System Monitor")

app.add_middleware(MetricsMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(metrics_router)


@app.get("/")
def index() -> dict:
    return {
        "service": "system_monitor",
        "endpoints": [
            {"method": "GET", "path": "/health", "description": "Health check"},
            {"method": "GET", "path": "/metrics", "description": "This service's own metrics"},
            {"method": "GET", "path": "/stream", "description": "SSE — live metrics for all services (ticks every 3 s)"},
        ],
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/stream")
async def stream():
    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx proxy buffering for SSE
            "Connection": "keep-alive",
        },
    )
