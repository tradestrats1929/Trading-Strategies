import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def use_sqlite(monkeypatch, tmp_path):
    db_file = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_file}")


@pytest.fixture
def client():
    from db_api.main import app
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_create_and_list_items(client):
    r = client.post("/items", json={"name": "AAPL", "value": 195.5})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "AAPL"
    assert data["value"] == 195.5
    assert "id" in data

    r = client.get("/items")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["name"] == "AAPL"
