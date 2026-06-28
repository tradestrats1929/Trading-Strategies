import time
from collections import defaultdict, deque
from starlette.middleware.base import BaseHTTPMiddleware

# module-level store: path → {count, latencies_ms}
_stats: dict[str, dict] = defaultdict(lambda: {"count": 0, "latencies_ms": deque(maxlen=200)})


def get_request_stats() -> dict[str, dict]:
    result = {}
    for path, d in _stats.items():
        lats = sorted(d["latencies_ms"])
        n = len(lats)
        result[path] = {
            "count": d["count"],
            "avg_ms": round(sum(lats) / n, 2) if n else 0.0,
            "p95_ms": round(lats[int(n * 0.95)], 2) if n >= 2 else (round(lats[0], 2) if n else 0.0),
            "p99_ms": round(lats[int(n * 0.99)], 2) if n >= 2 else (round(lats[0], 2) if n else 0.0),
        }
    return result


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        _stats[request.url.path]["count"] += 1
        _stats[request.url.path]["latencies_ms"].append(round(elapsed_ms, 2))
        return response
