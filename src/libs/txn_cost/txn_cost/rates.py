"""
Rate constants as of April 2026 (post-Budget 2026 STT revision).

STT changes effective 1 April 2026:
  - Futures: 0.02% → 0.05%
  - Options premium (sell): 0.10% → 0.15%
  - Options exercise (buy ITM): 0.125% → 0.15%
"""

from decimal import Decimal

# ---------------------------------------------------------------------------
# Brokerage — Zerodha / Kite (per executed order, not per lot)
# ---------------------------------------------------------------------------
BROKERAGE_EQUITY_DELIVERY = Decimal("0")
BROKERAGE_INTRADAY_FLAT = Decimal("20")
BROKERAGE_INTRADAY_PCT = Decimal("0.0003")   # 0.03% of turnover
BROKERAGE_FNO_FLAT = Decimal("20")

# ---------------------------------------------------------------------------
# STT — Securities Transaction Tax
# ---------------------------------------------------------------------------
STT_EQUITY_DELIVERY = Decimal("0.001")       # 0.10% — applied to both buy and sell turnover
STT_EQUITY_INTRADAY = Decimal("0.00025")     # 0.025% — sell side only
STT_FUTURES = Decimal("0.0005")              # 0.05%  — sell side only on contract value
STT_OPTIONS_REGULAR = Decimal("0.0015")      # 0.15% — sell side only on premium turnover
STT_OPTIONS_EXERCISE = Decimal("0.0015")     # 0.15% — buy side, on intrinsic value (not premium)

# ---------------------------------------------------------------------------
# Stamp Duty — unified national rate since July 2020, buy side only
# ---------------------------------------------------------------------------
STAMP_EQUITY_DELIVERY = Decimal("0.00015")   # 0.015%
STAMP_EQUITY_INTRADAY = Decimal("0.00003")   # 0.003%
STAMP_FUTURES = Decimal("0.00002")           # 0.002% on contract value
STAMP_OPTIONS = Decimal("0.00003")           # 0.003% on premium turnover

# ---------------------------------------------------------------------------
# Exchange Transaction Charges — NSE
# ---------------------------------------------------------------------------
NSE_ETC_EQUITY_CASH = Decimal("0.0000297")   # 0.00297%
NSE_ETC_FUTURES = Decimal("0.0000173")       # 0.00173%
NSE_ETC_OPTIONS = Decimal("0.0003503")       # 0.03503% on premium turnover

# ---------------------------------------------------------------------------
# Exchange Transaction Charges — BSE
# BSE equity is slab-based by scrip group; 0.00375% is a reasonable flat
# approximation for Group A/B. BSE options are also slab-based on monthly
# cumulative premium turnover — NSE rate is used as approximation.
# ---------------------------------------------------------------------------
BSE_ETC_EQUITY_CASH = Decimal("0.0000375")   # ~0.00375% (Group A/B approximation)
BSE_ETC_FUTURES = Decimal("0.0000173")       # 0.00173%

# ---------------------------------------------------------------------------
# SEBI Turnover Fees — ₹10 per crore on all buy+sell turnover
# 10 / 10_000_000 = 0.000001
# ---------------------------------------------------------------------------
SEBI_FEE_RATE = Decimal("0.000001")          # 0.0001%

# ---------------------------------------------------------------------------
# GST — on brokerage + exchange TC + SEBI fee (NOT on STT or stamp duty)
# ---------------------------------------------------------------------------
GST_RATE = Decimal("0.18")

# ---------------------------------------------------------------------------
# IPFT — Investor Protection Fund Trust (NSE only)
# ₹0.01 per crore → 0.01 / 10_000_000 = 1e-9
# ---------------------------------------------------------------------------
IPFT_RATE = Decimal("1E-9")

# ---------------------------------------------------------------------------
# DP Charges — Zerodha (equity delivery sell only)
# ₹3.50 CDSL + ₹9.50 Zerodha + ₹2.34 GST = ₹15.34 per scrip per day
# ---------------------------------------------------------------------------
DP_CHARGE_PER_SCRIP = Decimal("15.34")
