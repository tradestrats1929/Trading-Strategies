"""
Numerical tests for txn_cost.

Each test works out expected values by hand, then asserts the calculator matches.
Turnover figures and rates are taken directly from rates.py comments.
"""

from decimal import Decimal

import pytest

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


# ---------------------------------------------------------------------------
# Equity Delivery
# ---------------------------------------------------------------------------

def test_equity_delivery_buy():
    """
    Reliance buy 100 shares @ ₹2500 (NSE delivery)
    Turnover = 2500 × 100 = 250,000

    Brokerage:    ₹0 (delivery is free)
    STT:          0.1% × 250,000 = ₹250.00
    Stamp duty:   0.015% × 250,000 = ₹37.50
    Exchange TC:  0.00297% × 250,000 = ₹7.425 → ₹7.43
    SEBI fee:     0.0001% × 250,000 = ₹0.25
    GST:          18% × (0 + 7.43 + 0.25) = 18% × 7.68 = ₹1.38
    IPFT:         ~₹0.00
    DP charges:   ₹0 (buy side)
    """
    trade = TradeInput(
        instrument=InstrumentType.EQUITY,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("2500"),
        quantity=100,
        trade_type=TradeType.DELIVERY,
    )
    result = calculate_charges(trade)

    assert result.brokerage == Decimal("0.00")
    assert result.stt == Decimal("250.00")
    assert result.stamp_duty == Decimal("37.50")
    assert result.dp_charges == Decimal("0.00")
    assert result.total > Decimal("250.00")


def test_equity_delivery_sell_has_dp_charges():
    """Equity delivery sell should include ₹15.34 DP charge."""
    trade = TradeInput(
        instrument=InstrumentType.EQUITY,
        exchange=Exchange.NSE,
        direction=Direction.SELL,
        price=Decimal("2500"),
        quantity=100,
        trade_type=TradeType.DELIVERY,
    )
    result = calculate_charges(trade)

    assert result.dp_charges == Decimal("15.34")
    assert result.stt == Decimal("250.00")
    assert result.stamp_duty == Decimal("0.00")  # sell side — no stamp duty


def test_equity_delivery_sell_no_stamp_duty():
    """Stamp duty is buy side only."""
    trade = TradeInput(
        instrument=InstrumentType.EQUITY,
        exchange=Exchange.NSE,
        direction=Direction.SELL,
        price=Decimal("1000"),
        quantity=50,
        trade_type=TradeType.DELIVERY,
    )
    result = calculate_charges(trade)
    assert result.stamp_duty == Decimal("0.00")


# ---------------------------------------------------------------------------
# Equity Intraday
# ---------------------------------------------------------------------------

def test_equity_intraday_sell_stt():
    """
    Intraday sell 200 shares @ ₹500 (NSE)
    Turnover = 100,000
    STT: 0.025% × 100,000 = ₹25.00
    Brokerage: min(20, 0.03% × 100,000) = min(20, 30) = ₹20
    Stamp duty: ₹0 (sell side)
    """
    trade = TradeInput(
        instrument=InstrumentType.EQUITY,
        exchange=Exchange.NSE,
        direction=Direction.SELL,
        price=Decimal("500"),
        quantity=200,
        trade_type=TradeType.INTRADAY,
    )
    result = calculate_charges(trade)

    assert result.stt == Decimal("25.00")
    assert result.brokerage == Decimal("20.00")
    assert result.stamp_duty == Decimal("0.00")
    assert result.dp_charges == Decimal("0.00")


def test_equity_intraday_buy_no_stt():
    """Intraday buy has no STT."""
    trade = TradeInput(
        instrument=InstrumentType.EQUITY,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("500"),
        quantity=200,
        trade_type=TradeType.INTRADAY,
    )
    result = calculate_charges(trade)
    assert result.stt == Decimal("0.00")


def test_intraday_brokerage_capped_at_20():
    """For small orders, 0.03% may be less than ₹20."""
    trade = TradeInput(
        instrument=InstrumentType.EQUITY,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("100"),
        quantity=10,        # turnover = 1000, 0.03% = 0.30 < 20
        trade_type=TradeType.INTRADAY,
    )
    result = calculate_charges(trade)
    assert result.brokerage == Decimal("0.30")


# ---------------------------------------------------------------------------
# Futures
# ---------------------------------------------------------------------------

def test_index_futures_sell_stt():
    """
    Nifty futures sell 1 lot = 50 contracts @ ₹22,000
    Turnover = 22,000 × 50 = 1,100,000
    STT (sell only): 0.05% × 1,100,000 = ₹550.00
    Brokerage: ₹20 flat
    Stamp duty: ₹0 (sell side)
    """
    trade = TradeInput(
        instrument=InstrumentType.INDEX_FUTURES,
        exchange=Exchange.NSE,
        direction=Direction.SELL,
        price=Decimal("22000"),
        quantity=50,
        trade_type=TradeType.REGULAR,
    )
    result = calculate_charges(trade)

    assert result.stt == Decimal("550.00")
    assert result.brokerage == Decimal("20.00")
    assert result.stamp_duty == Decimal("0.00")


def test_futures_buy_stamp_duty():
    """Futures buy: stamp duty at 0.002% on contract value."""
    trade = TradeInput(
        instrument=InstrumentType.INDEX_FUTURES,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("22000"),
        quantity=50,
        trade_type=TradeType.REGULAR,
    )
    result = calculate_charges(trade)
    # 0.002% × 1,100,000 = 22
    assert result.stamp_duty == Decimal("22.00")
    assert result.stt == Decimal("0.00")  # no STT on buy


# ---------------------------------------------------------------------------
# Options — regular
# ---------------------------------------------------------------------------

def test_index_options_regular_sell_stt_on_premium():
    """
    Nifty options regular sell 1 lot = 50 qty @ premium ₹100
    Premium turnover = 100 × 50 = 5,000
    STT: 0.15% × 5,000 = ₹7.50
    Brokerage: ₹20 flat
    Exchange TC: 0.03503% × 5,000 = ₹1.75
    SEBI fee: 0.0001% × 5,000 = ₹0.005 → ₹0.01
    GST: 18% × (20 + 1.75 + 0.01) = 18% × 21.76 = ₹3.92
    """
    trade = TradeInput(
        instrument=InstrumentType.INDEX_OPTIONS,
        exchange=Exchange.NSE,
        direction=Direction.SELL,
        price=Decimal("100"),
        quantity=50,
        trade_type=TradeType.REGULAR,
    )
    result = calculate_charges(trade)

    assert result.stt == Decimal("7.50")
    assert result.brokerage == Decimal("20.00")
    assert result.stamp_duty == Decimal("0.00")  # sell side


def test_index_options_regular_buy_stamp_duty():
    """Options buy: stamp duty 0.003% on premium turnover, no STT."""
    trade = TradeInput(
        instrument=InstrumentType.INDEX_OPTIONS,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("100"),
        quantity=50,
        trade_type=TradeType.REGULAR,
    )
    result = calculate_charges(trade)
    # 0.003% × 5,000 = 0.15
    assert result.stamp_duty == Decimal("0.15")
    assert result.stt == Decimal("0.00")


# ---------------------------------------------------------------------------
# Options — exercise / expiry
# ---------------------------------------------------------------------------

def test_options_exercise_buy_itm_call_stt_on_intrinsic():
    """
    ITM Call exercise: strike=22000, spot=22500, qty=50
    Intrinsic = 22500 - 22000 = 500
    Exercise STT: 0.15% × 500 × 50 = 0.15% × 25,000 = ₹37.50
    """
    trade = TradeInput(
        instrument=InstrumentType.INDEX_OPTIONS,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("500"),      # premium paid (irrelevant for exercise STT base)
        quantity=50,
        trade_type=TradeType.EXERCISE,
        option_type=OptionType.CALL,
        strike=Decimal("22000"),
        spot=Decimal("22500"),
    )
    result = calculate_charges(trade)

    assert result.stt == Decimal("37.50")
    assert any("Exercise STT trap" in n for n in result.notes)


def test_options_exercise_buy_itm_put_stt_on_intrinsic():
    """
    ITM Put exercise: strike=22000, spot=21500, qty=50
    Intrinsic = 22000 - 21500 = 500
    Exercise STT: 0.15% × 500 × 50 = ₹37.50
    """
    trade = TradeInput(
        instrument=InstrumentType.INDEX_OPTIONS,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("500"),
        quantity=50,
        trade_type=TradeType.EXERCISE,
        option_type=OptionType.PUT,
        strike=Decimal("22000"),
        spot=Decimal("21500"),
    )
    result = calculate_charges(trade)
    assert result.stt == Decimal("37.50")


def test_options_exercise_otm_no_stt():
    """OTM at expiry → expires worthless, no exercise STT."""
    trade = TradeInput(
        instrument=InstrumentType.INDEX_OPTIONS,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("10"),
        quantity=50,
        trade_type=TradeType.EXERCISE,
        option_type=OptionType.CALL,
        strike=Decimal("23000"),
        spot=Decimal("22500"),     # spot < strike → OTM call
    )
    result = calculate_charges(trade)
    assert result.stt == Decimal("0.00")
    assert any("OTM" in n for n in result.notes)


def test_exercise_missing_fields_raises():
    """Omitting strike/spot/option_type for exercise trade should raise."""
    trade = TradeInput(
        instrument=InstrumentType.INDEX_OPTIONS,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("100"),
        quantity=50,
        trade_type=TradeType.EXERCISE,
        # option_type, strike, spot intentionally omitted
    )
    with pytest.raises(ValueError, match="option_type, strike, and spot are required"):
        calculate_charges(trade)


# ---------------------------------------------------------------------------
# GST
# ---------------------------------------------------------------------------

def test_gst_not_on_stt_or_stamp_duty():
    """GST base must be brokerage + exchange_tc + sebi_fee only."""
    trade = TradeInput(
        instrument=InstrumentType.EQUITY,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("1000"),
        quantity=100,
        trade_type=TradeType.DELIVERY,
    )
    result = calculate_charges(trade)
    expected_gst_base = result.brokerage + result.exchange_tc + result.sebi_fee
    assert result.gst == (expected_gst_base * Decimal("0.18")).quantize(Decimal("0.01"))


# ---------------------------------------------------------------------------
# Round-trip
# ---------------------------------------------------------------------------

def test_round_trip_total():
    """Round-trip total should equal sum of entry and exit costs."""
    entry = TradeInput(
        instrument=InstrumentType.INDEX_FUTURES,
        exchange=Exchange.NSE,
        direction=Direction.BUY,
        price=Decimal("22000"),
        quantity=50,
        trade_type=TradeType.REGULAR,
    )
    exit_trade = TradeInput(
        instrument=InstrumentType.INDEX_FUTURES,
        exchange=Exchange.NSE,
        direction=Direction.SELL,
        price=Decimal("22200"),
        quantity=50,
        trade_type=TradeType.REGULAR,
    )
    rt = round_trip_cost(entry, exit_trade)
    assert rt.total == rt.entry.total + rt.exit.total
