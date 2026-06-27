from fastapi.testclient import TestClient

from txn_cost_api.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_calculate_equity_delivery_buy():
    r = client.post("/calculate", json={
        "instrument": "equity",
        "exchange": "NSE",
        "direction": "buy",
        "price": 2500,
        "quantity": 100,
        "trade_type": "delivery",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["brokerage"] == 0.0
    assert data["stt"] == 250.0
    assert data["dp_charges"] == 0.0
    assert "total" in data
    assert "notes" in data


def test_calculate_options_exercise_itm():
    r = client.post("/calculate", json={
        "instrument": "index_options",
        "exchange": "NSE",
        "direction": "buy",
        "price": 500,
        "quantity": 50,
        "trade_type": "exercise",
        "option_type": "call",
        "strike": 22000,
        "spot": 22500,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["stt"] == 37.5
    assert any("Exercise STT trap" in n for n in data["notes"])


def test_calculate_exercise_missing_fields_returns_422():
    r = client.post("/calculate", json={
        "instrument": "index_options",
        "exchange": "NSE",
        "direction": "buy",
        "price": 100,
        "quantity": 50,
        "trade_type": "exercise",
        # option_type, strike, spot missing
    })
    assert r.status_code == 422


def test_round_trip():
    r = client.post("/round-trip", json={
        "entry": {
            "instrument": "index_futures",
            "exchange": "NSE",
            "direction": "buy",
            "price": 22000,
            "quantity": 50,
            "trade_type": "regular",
        },
        "exit": {
            "instrument": "index_futures",
            "exchange": "NSE",
            "direction": "sell",
            "price": 22200,
            "quantity": 50,
            "trade_type": "regular",
        },
    })
    assert r.status_code == 200
    data = r.json()
    assert "entry" in data
    assert "exit" in data
    assert data["total_round_trip"] == round(
        data["entry"]["total"] + data["exit"]["total"], 2
    )
