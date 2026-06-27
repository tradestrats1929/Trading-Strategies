from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum


class InstrumentType(str, Enum):
    EQUITY = "equity"
    EQUITY_FUTURES = "equity_futures"
    INDEX_FUTURES = "index_futures"
    EQUITY_OPTIONS = "equity_options"
    INDEX_OPTIONS = "index_options"


class Exchange(str, Enum):
    NSE = "NSE"
    BSE = "BSE"


class Direction(str, Enum):
    BUY = "buy"
    SELL = "sell"


class TradeType(str, Enum):
    # Equity cash
    DELIVERY = "delivery"
    INTRADAY = "intraday"
    # F&O
    REGULAR = "regular"    # normal open/close
    EXERCISE = "exercise"  # hold options to expiry / assignment


class OptionType(str, Enum):
    CALL = "call"
    PUT = "put"


@dataclass
class TradeInput:
    instrument: InstrumentType
    exchange: Exchange
    direction: Direction
    price: Decimal          # per-share price for equity/futures; premium per unit for options
    quantity: int           # number of shares or number of contracts × lot_size
    trade_type: TradeType

    # Options-specific (required when instrument is *_OPTIONS and trade_type is EXERCISE)
    option_type: OptionType | None = None
    strike: Decimal | None = None   # strike price
    spot: Decimal | None = None     # spot price at expiry (for intrinsic value)

    def __post_init__(self) -> None:
        self.price = Decimal(str(self.price))
        if self.strike is not None:
            self.strike = Decimal(str(self.strike))
        if self.spot is not None:
            self.spot = Decimal(str(self.spot))


@dataclass
class CostBreakdown:
    brokerage: Decimal
    stt: Decimal
    stamp_duty: Decimal
    exchange_tc: Decimal
    sebi_fee: Decimal
    gst: Decimal
    ipft: Decimal
    dp_charges: Decimal
    total: Decimal
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "brokerage": float(self.brokerage),
            "stt": float(self.stt),
            "stamp_duty": float(self.stamp_duty),
            "exchange_tc": float(self.exchange_tc),
            "sebi_fee": float(self.sebi_fee),
            "gst": float(self.gst),
            "ipft": float(self.ipft),
            "dp_charges": float(self.dp_charges),
            "total": float(self.total),
            "notes": self.notes,
        }


@dataclass
class RoundTripCost:
    entry: CostBreakdown
    exit: CostBreakdown
    total: Decimal

    def as_dict(self) -> dict[str, object]:
        return {
            "entry": self.entry.as_dict(),
            "exit": self.exit.as_dict(),
            "total_round_trip": float(self.total),
        }
