import os
import time
import psutil
from datetime import datetime, timezone
from fastapi import APIRouter

from .middleware import get_request_stats

router = APIRouter()

_proc = psutil.Process()
_proc.cpu_percent()  # bootstrap — first call always returns 0.0, discard it
_start_time = time.time()


@router.get("/metrics")
def metrics() -> dict:
    mem = _proc.memory_info()
    net = psutil.net_io_counters()
    disk = psutil.disk_usage("/")
    return {
        "service": os.getenv("SERVICE_NAME", "unknown"),
        "git_commit": os.getenv("GIT_COMMIT", "unknown"),
        "git_branch": os.getenv("GIT_BRANCH", "unknown"),
        "started_at": datetime.fromtimestamp(_start_time, tz=timezone.utc).isoformat(),
        "uptime_seconds": int(time.time() - _start_time),
        "memory": {
            "rss_mb": round(mem.rss / 1024 / 1024, 1),
            "vms_mb": round(mem.vms / 1024 / 1024, 1),
        },
        "cpu_percent": round(_proc.cpu_percent(interval=None), 1),
        "disk": {
            "used_gb": round(disk.used / 1024**3, 2),
            "total_gb": round(disk.total / 1024**3, 2),
            "percent": round(disk.percent, 1),
        },
        "network": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
        },
        "request_stats": get_request_stats(),
    }
