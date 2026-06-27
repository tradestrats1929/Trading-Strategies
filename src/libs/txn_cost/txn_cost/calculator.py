from decimal import ROUND_HALF_UP, Decimal

from .models import (
    CostBreakdown,
    Direction,
    Exchange,
    InstrumentType,
    OptionType,
    RoundTripCost,
    TradeInput,
    TradeType,
)
from .rates import (
    BROKERAGE_EQUITY_DELIVERY,
    BROKERAGE_FNO_FLAT,
    BROKERAGE_INTRADAY_FLAT,
    BROKERAGE_INTRADAY_PCT,
    BSE_ETC_EQUITY_CASH,
    BSE_ETC_FUTURES,
    DP_CHARGE_PER_SCRIP,
    GST_RATE,
    IPFT_RATE,
    NSE_ETC_EQUITY_CASH,
    NSE_ETC_FUTURES,
    NSE_ETC_OPTIONS,
    SEBI_FEE_RATE,
    STAMP_EQUITY_DELIVERY,
    STAMP_EQUITY_INTRADAY,
    STAMP_FUTURES,
    STAMP_OPTIONS,
    STT_EQUITY_DELIVERY,
    STT_EQUITY_INTRADAY,
    STT_FUTURES,
    STT_OPTIONS_EXERCISE,
    STT_OPTIONS_REGULAR,
)

_PAISA = Decimal("0.01")


def _round(v: Decimal) -> Decimal:
    return v.quantize(_PAISA, rounding=ROUND_HALF_UP)


def calculate_charges(trade: TradeInput) -> CostBreakdown:
    """
    Compute the full transaction cost breakdown for a single trade leg.

    All monetary outputs are in INR, rounded to the nearest paisa.
    """
    notes: list[str] = []

    quantity = Decimal(str(trade.quantity))
    turnover = trade.price * quantity  # premium turnover for options, contract value otherwise

    is_buy = trade.direction == Direction.BUY
    is_sell = trade.direction == Direction.SELL
    is_equity = trade.instrument == InstrumentType.EQUITY
    is_futures = trade.instrument in (InstrumentType.EQUITY_FUTURES, InstrumentType.INDEX_FUTURES)
    is_options = trade.instrument in (InstrumentType.EQUITY_OPTIONS, InstrumentType.INDEX_OPTIONS)
    is_delivery = trade.trade_type == TradeType.DELIVERY
    is_intraday = trade.trade_type == TradeType.INTRADAY
    is_exercise = trade.trade_type == TradeType.EXERCISE
    is_nse = trade.exchange == Exchange.NSE

    # ------------------------------------------------------------------
    # Brokerage
    # ------------------------------------------------------------------
    if is_equity and is_delivery:
        brokerage = BROKERAGE_EQUITY_DELIVERY
    elif is_equity and is_intraday:
        brokerage = min(BROKERAGE_INTRADAY_FLAT, BROKERAGE_INTRADAY_PCT * turnover)
    else:
        brokerage = BROKERAGE_FNO_FLAT

    # ------------------------------------------------------------------
    # STT
    # ------------------------------------------------------------------
    stt = Decimal("0")

    if is_equity:
        if is_delivery:
            stt = STT_EQUITY_DELIVERY * turnover  # both buy and sell
        elif is_intraday and is_sell:
            stt = STT_EQUITY_INTRADAY * turnover

    elif is_futures:
        if is_sell:
            stt = STT_FUTURES * turnover

    elif is_options:
        if is_exercise and is_buy:
            _validate_exercise_fields(trade)
            intrinsic = _intrinsic_value(trade)
            if intrinsic > 0:
                stt = STT_OPTIONS_EXERCISE * intrinsic * quantity
                notes.append(
                    f"⚠️  Exercise STT trap: STT is on intrinsic value "
                    f"(₹{intrinsic:.2f}/unit × {int(quantity)} units) = ₹{_round(stt):.2f}. "
                    f"This can exceed or eliminate P&L — verify ITM status before expiry."
                )
            else:
                notes.append("Option is OTM at expiry — expires worthless, no exercise STT applies.")
        elif not is_exercise and is_sell:
            stt = STT_OPTIONS_REGULAR * turnover  # on premium

    # ------------------------------------------------------------------
    # Stamp Duty (buy side only)
    # ------------------------------------------------------------------
    stamp_duty = Decimal("0")
    if is_buy:
        if is_equity and is_delivery:
            stamp_duty = STAMP_EQUITY_DELIVERY * turnover
        elif is_equity and is_intraday:
            stamp_duty = STAMP_EQUITY_INTRADAY * turnover
        elif is_futures:
            stamp_duty = STAMP_FUTURES * turnover
        elif is_options:
            stamp_duty = STAMP_OPTIONS * turnover  # on premium

    # ------------------------------------------------------------------
    # Exchange Transaction Charges (both sides)
    # ------------------------------------------------------------------
    if is_nse:
        if is_equity:
            etc_rate = NSE_ETC_EQUITY_CASH
        elif is_futures:
            etc_rate = NSE_ETC_FUTURES
        else:
            etc_rate = NSE_ETC_OPTIONS
    else:  # BSE
        if is_equity:
            etc_rate = BSE_ETC_EQUITY_CASH
        elif is_futures:
            etc_rate = BSE_ETC_FUTURES
        else:
            etc_rate = NSE_ETC_OPTIONS  # BSE options are slab-based; NSE used as approximation
            notes.append(
                "BSE options exchange TC is slab-based on monthly premium turnover; "
                "NSE flat rate used as approximation."
            )

    exchange_tc = etc_rate * turnover

    # ------------------------------------------------------------------
    # SEBI Turnover Fee (both sides)
    # ------------------------------------------------------------------
    sebi_fee = SEBI_FEE_RATE * turnover

    # ------------------------------------------------------------------
    # IPFT — NSE only (both sides)
    # ------------------------------------------------------------------
    ipft = IPFT_RATE * turnover if is_nse else Decimal("0")

    # ------------------------------------------------------------------
    # GST — on brokerage + exchange TC + SEBI fee (not on STT / stamp duty)
    # ------------------------------------------------------------------
    gst = GST_RATE * (brokerage + exchange_tc + sebi_fee)

    # ------------------------------------------------------------------
    # DP Charges — equity delivery sell only (per scrip per day, flat)
    # ------------------------------------------------------------------
    dp_charges = DP_CHARGE_PER_SCRIP if (is_equity and is_delivery and is_sell) else Decimal("0")

    total = brokerage + stt + stamp_duty + exchange_tc + sebi_fee + gst + ipft + dp_charges

    return CostBreakdown(
        brokerage=_round(brokerage),
        stt=_round(stt),
        stamp_duty=_round(stamp_duty),
        exchange_tc=_round(exchange_tc),
        sebi_fee=_round(sebi_fee),
        gst=_round(gst),
        ipft=_round(ipft),
        dp_charges=_round(dp_charges),
        total=_round(total),
        notes=notes,
    )


def round_trip_cost(entry: TradeInput, exit_trade: TradeInput) -> RoundTripCost:
    """Compute combined cost for an entry + exit pair."""
    entry_cost = calculate_charges(entry)
    exit_cost = calculate_charges(exit_trade)
    return RoundTripCost(
        entry=entry_cost,
        exit=exit_cost,
        total=entry_cost.total + exit_cost.total,
    )


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------

def _validate_exercise_fields(trade: TradeInput) -> None:
    if trade.option_type is None or trade.strike is None or trade.spot is None:
        raise ValueError(
            "option_type, strike, and spot are required for exercise/expiry STT calculation."
        )


def _intrinsic_value(trade: TradeInput) -> Decimal:
    assert trade.strike is not None and trade.spot is not None and trade.option_type is not None
    if trade.option_type == OptionType.CALL:
        return max(Decimal("0"), trade.spot - trade.strike)
    return max(Decimal("0"), trade.strike - trade.spot)
