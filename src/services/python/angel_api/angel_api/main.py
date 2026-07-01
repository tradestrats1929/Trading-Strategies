import asyncio
import json
import os
import threading
import time
from datetime import datetime, timedelta, date
from typing import Optional

import httpx
import pyotp
import pytz
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from SmartApi import SmartConnect
from SmartApi.SmartWebSocketV2 import SmartWebSocketV2
from service_metrics import MetricsMiddleware, metrics_router

# ── Config ─────────────────────────────────────────────────────────────────────

APP_ENV            = os.getenv("APP_ENV", "DEV").upper()
ANGEL_API_KEY      = os.getenv(f"ANGEL_API_KEY_{APP_ENV}", os.getenv("ANGEL_API_KEY", ""))
ANGEL_CLIENT_ID    = os.getenv("ANGEL_CLIENT_ID", "")
ANGEL_MPIN         = os.getenv("ANGEL_MPIN", "")
ANGEL_TOTP_SECRET  = os.getenv("ANGEL_TOTP_SECRET", "")
ANGEL_INTERNAL_SECRET = os.getenv("ANGEL_INTERNAL_SECRET", "")
IST = pytz.timezone("Asia/Kolkata")
INSTRUMENT_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"

# ── Shared state ───────────────────────────────────────────────────────────────

_state: dict = {
    "logged_in": False,
    "auth_token": "",
    "feed_token": "",
    "refresh_token": "",
    "login_time": None,
    "next_relogin": None,
    "ws_connected": False,
    "ws_last_error": None,
}

_latest: dict[str, dict] = {}           # token → latest tick (includes received_at)
_subscribed: set[str] = set()           # currently subscribed tokens
_subscribers: list[asyncio.Queue] = []  # SSE client queues
_instruments: list[dict] = []           # Nifty options instrument master
_sws: Optional[SmartWebSocketV2] = None
_loop: Optional[asyncio.AbstractEventLoop] = None

# ── Authentication ─────────────────────────────────────────────────────────────

def _login_sync() -> bool:
    global _sws
    if not all([ANGEL_API_KEY, ANGEL_CLIENT_ID, ANGEL_MPIN, ANGEL_TOTP_SECRET]):
        return False
    try:
        totp = pyotp.TOTP(ANGEL_TOTP_SECRET).now()
        api = SmartConnect(api_key=ANGEL_API_KEY)
        session = api.generateSession(ANGEL_CLIENT_ID, ANGEL_MPIN, totp)
        if session.get("status") is False:
            return False
        data = session["data"]
        _state.update({
            "logged_in": True,
            "auth_token": data["jwtToken"],
            "feed_token": api.getfeedToken(),
            "refresh_token": data["refreshToken"],
            "login_time": datetime.now(tz=pytz.utc).isoformat(),
        })
        return True
    except Exception as exc:
        _state["ws_last_error"] = str(exc)
        return False


async def _login():
    ok = await asyncio.get_running_loop().run_in_executor(None, _login_sync)
    if ok:
        await _download_instruments()
        _restart_websocket()
    return ok


def _next_relogin_ist() -> datetime:
    now_ist = datetime.now(IST)
    target = now_ist.replace(hour=8, minute=45, second=0, microsecond=0)
    if now_ist >= target:
        target += timedelta(days=1)
    return target


async def _relogin_loop():
    while True:
        target = _next_relogin_ist()
        _state["next_relogin"] = target.isoformat()
        delay = (target - datetime.now(IST)).total_seconds()
        await asyncio.sleep(max(delay, 0))
        await _login()

# ── Instrument master ──────────────────────────────────────────────────────────

def _parse_expiry_date(expiry_str: str) -> Optional[date]:
    """Parse Angel One expiry strings like '29JAN2026' or '29-JAN-2026'."""
    for fmt in ("%d%b%Y", "%d-%b-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(expiry_str.upper(), fmt.upper()).date()
        except ValueError:
            continue
    return None


async def _download_instruments():
    global _instruments
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(INSTRUMENT_MASTER_URL)
            r.raise_for_status()
            raw = r.json()
        nifty_opts = []
        for item in raw:
            if (
                item.get("exch_seg") == "NFO"
                and item.get("name") == "NIFTY"
                and item.get("instrumenttype") == "OPTIDX"
            ):
                sym = item.get("symbol", "")
                expiry_str = item.get("expiry", "")
                expiry_date = _parse_expiry_date(expiry_str)
                nifty_opts.append({
                    "token": item["token"],
                    "symbol": sym,
                    "strike": float(item.get("strike", 0)) / 100,  # stored as paise * 100
                    "expiry": expiry_str,
                    "expiry_date": expiry_date.isoformat() if expiry_date else None,
                    "option_type": "CE" if sym.endswith("CE") else "PE" if sym.endswith("PE") else "",
                    "lot_size": int(item.get("lotsize", 0)),
                    "tick_size": float(item.get("tick_size", 0.05)),
                })
        _instruments = nifty_opts
    except Exception as exc:
        _state["ws_last_error"] = f"instrument download failed: {exc}"

# ── Angel One WebSocket ────────────────────────────────────────────────────────

def _ws_on_open(wsapp):
    _state["ws_connected"] = True
    _state["ws_last_error"] = None
    if _subscribed and _loop:
        tokens = list(_subscribed)
        wsapp.subscribe("angel_api", 3, [{"exchangeType": 2, "tokens": tokens}])


def _ws_on_data(wsapp, message, data_type, continue_flag):
    if not isinstance(message, dict):
        return
    token = str(message.get("token", ""))
    if not token:
        return
    message["received_at"] = datetime.now(tz=pytz.utc).isoformat()
    _latest[token] = message
    if _loop and _subscribers:
        payload = json.dumps({"token": token, **message}, default=str)
        for q in list(_subscribers):
            _loop.call_soon_threadsafe(q.put_nowait, payload)


def _ws_on_error(wsapp, error):
    _state["ws_connected"] = False
    _state["ws_last_error"] = str(error)


def _ws_on_close(wsapp):
    _state["ws_connected"] = False


def _ws_thread_fn():
    global _sws
    while True:
        if not _state.get("logged_in"):
            time.sleep(5)
            continue
        try:
            sws = SmartWebSocketV2(
                _state["auth_token"],
                ANGEL_API_KEY,
                ANGEL_CLIENT_ID,
                _state["feed_token"],
            )
            sws.on_open = _ws_on_open
            sws.on_data = _ws_on_data
            sws.on_error = _ws_on_error
            sws.on_close = _ws_on_close
            _sws = sws
            sws.connect()  # blocks until disconnected
        except Exception as exc:
            _state["ws_connected"] = False
            _state["ws_last_error"] = str(exc)
        _sws = None
        time.sleep(5)  # reconnect delay


_ws_thread = threading.Thread(target=_ws_thread_fn, daemon=True)


def _restart_websocket():
    """Force-close current WebSocket so the thread reconnects with fresh tokens."""
    global _sws
    if _sws:
        try:
            _sws.close_connection()
        except Exception:
            pass

# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(title="Angel One API")
app.add_middleware(MetricsMiddleware)
app.include_router(metrics_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    global _loop
    _loop = asyncio.get_running_loop()
    await _login()
    asyncio.create_task(_relogin_loop())
    _ws_thread.start()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "env": APP_ENV,
        "logged_in": _state["logged_in"],
        "ws_connected": _state["ws_connected"],
        "login_time": _state["login_time"],
        "next_relogin": _state.get("next_relogin"),
        "ws_last_error": _state.get("ws_last_error"),
        "subscribed_count": len(_subscribed),
        "instrument_count": len(_instruments),
    }


@app.get("/instruments")
def list_instruments(
    search: str = Query("", description="Filter by symbol substring"),
    expiry: str = Query("", description="Exact expiry string, e.g. 31JUL2025"),
    option_type: str = Query("", description="CE or PE"),
    strike_min: float = Query(0, description="Minimum strike"),
    strike_max: float = Query(0, description="Maximum strike (0 = no limit)"),
    active_only: bool = Query(True, description="Exclude expired instruments"),
) -> list[dict]:
    today = date.today()
    result = _instruments
    if active_only:
        result = [
            i for i in result
            if i.get("expiry_date") and date.fromisoformat(i["expiry_date"]) >= today
        ]
    if search:
        q = search.upper()
        result = [i for i in result if q in i["symbol"]]
    if expiry:
        result = [i for i in result if i["expiry"] == expiry.upper()]
    if option_type:
        result = [i for i in result if i["option_type"] == option_type.upper()]
    if strike_min:
        result = [i for i in result if i["strike"] >= strike_min]
    if strike_max:
        result = [i for i in result if i["strike"] <= strike_max]
    return result


# ── Subscription management ────────────────────────────────────────────────────

class TokensRequest(BaseModel):
    tokens: list[str]


@app.get("/subscriptions")
def get_subscriptions() -> dict:
    return {"tokens": list(_subscribed)}


@app.post("/subscriptions")
def subscribe(body: TokensRequest) -> dict:
    new = [t for t in body.tokens if t not in _subscribed]
    if new and _sws and _state["ws_connected"]:
        _sws.subscribe("angel_api", 3, [{"exchangeType": 2, "tokens": new}])
    _subscribed.update(body.tokens)
    return {"subscribed": list(_subscribed)}


@app.delete("/subscriptions")
def unsubscribe(body: TokensRequest) -> dict:
    to_remove = [t for t in body.tokens if t in _subscribed]
    if to_remove and _sws and _state["ws_connected"]:
        _sws.unsubscribe("angel_api", 3, [{"exchangeType": 2, "tokens": to_remove}])
    for t in to_remove:
        _subscribed.discard(t)
        _latest.pop(t, None)
    return {"subscribed": list(_subscribed)}


# ── Snapshot (public) ──────────────────────────────────────────────────────────

@app.get("/quotes")
def quotes(tokens: str = Query(..., description="Comma-separated token list")) -> dict:
    """Return latest cached tick for each token. No streaming — point-in-time snapshot."""
    token_list = [t.strip() for t in tokens.split(",") if t.strip()]
    return {t: _latest.get(t) for t in token_list}


# ── SSE stream ─────────────────────────────────────────────────────────────────

@app.get("/stream")
async def stream():
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.append(q)

    async def generate():
        try:
            while True:
                payload = await q.get()
                yield f"data: {payload}\n\n"
        finally:
            if q in _subscribers:
                _subscribers.remove(q)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Internal endpoints ─────────────────────────────────────────────────────────

def _require_internal_secret(x_internal_secret: str = Header(...)) -> str:
    if not ANGEL_INTERNAL_SECRET or x_internal_secret != ANGEL_INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    return x_internal_secret


@app.get("/internal/quotes")
def internal_quotes(
    tokens: str = Query(..., description="Comma-separated token list"),
    _: str = Depends(_require_internal_secret),
) -> dict:
    token_list = [t.strip() for t in tokens.split(",") if t.strip()]
    return {t: _latest.get(t) for t in token_list}


@app.get("/internal/quotes/{token}")
def internal_quote(token: str, _: str = Depends(_require_internal_secret)) -> dict:
    tick = _latest.get(token)
    if tick is None:
        raise HTTPException(status_code=404, detail=f"No data for token {token}")
    return tick
