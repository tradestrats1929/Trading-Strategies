from fastapi.testclient import TestClient
from hello_api.main import app

client = TestClient(app)


def test_hello_default():
    r = client.get("/hello")
    assert r.status_code == 200
    assert "message" in r.json()
    assert "env" in r.json()


def test_hello_with_name():
    r = client.get("/hello?name=CI")
    assert r.json()["message"] == "Hello, CI! — from hello_lib"
