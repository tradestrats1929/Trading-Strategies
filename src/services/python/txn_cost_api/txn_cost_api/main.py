from decimal import Decimal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from txn_cost import (
    Direction,
    Exchange,
    InstrumentType,
    OptionType,
    TradeInput,
    TradeType,
    calculate_charges,
    round_trip_cost,
)

app = FastAPI(title="Transaction Cost API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class TradeRequest(BaseModel):
    instrument: InstrumentType
    exchange: Exchange
    direction: Direction
    price: float
    quantity: int
    trade_type: TradeType
    option_type: OptionType | None = None
    strike: float | None = None
    spot: float | None = None


class RoundTripRequest(BaseModel):
    entry: TradeRequest
    exit: TradeRequest


def _to_trade_input(req: TradeRequest) -> TradeInput:
    return TradeInput(
        instrument=req.instrument,
        exchange=req.exchange,
        direction=req.direction,
        price=Decimal(str(req.price)),
        quantity=req.quantity,
        trade_type=req.trade_type,
        option_type=req.option_type,
        strike=Decimal(str(req.strike)) if req.strike is not None else None,
        spot=Decimal(str(req.spot)) if req.spot is not None else None,
    )


@app.get("/")
def index() -> dict:
    return {
        "service": "txn_cost_api",
        "endpoints": [
            {"method": "GET",  "path": "/",            "description": "List available endpoints"},
            {"method": "GET",  "path": "/health",       "description": "Health check"},
            {"method": "POST", "path": "/calculate",    "description": "Calculate transaction costs for a single trade leg"},
            {"method": "POST", "path": "/round-trip",   "description": "Calculate combined entry + exit costs"},
        ],
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/calculate")
def calculate(req: TradeRequest) -> dict:
    try:
        trade = _to_trade_input(req)
        result = calculate_charges(trade)
        return result.as_dict()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/round-trip")
def round_trip(req: RoundTripRequest) -> dict:
    try:
        entry = _to_trade_input(req.entry)
        exit_trade = _to_trade_input(req.exit)
        result = round_trip_cost(entry, exit_trade)
        return result.as_dict()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
