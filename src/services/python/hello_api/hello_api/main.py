from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from hello_lib import greet, get_env

app = FastAPI(title="Hello API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def index() -> dict:
    return {
        "service": "hello_api",
        "endpoints": [
            {"method": "GET", "path": "/health", "description": "Health check"},
            {"method": "GET", "path": "/hello",  "description": "Greet by name (?name=...)"},
        ],
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": get_env()}


@app.get("/hello")
def hello(name: str = "World") -> dict[str, str]:
    return {"message": greet(name), "env": get_env()}
