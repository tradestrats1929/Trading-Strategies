from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Column, Float, Integer, MetaData, String, Table, text

from db_helpers import get_engine

metadata = MetaData()

items_table = Table(
    "items",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("name", String, nullable=False),
    Column("value", Float, nullable=False),
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    engine = get_engine()
    metadata.create_all(engine)
    app.state.engine = engine
    yield
    engine.dispose()


app = FastAPI(title="DB API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ItemIn(BaseModel):
    name: str
    value: float


class ItemOut(BaseModel):
    id: int
    name: str
    value: float


@app.get("/")
def index() -> dict:
    return {
        "service": "db_api",
        "endpoints": [
            {"method": "GET",  "path": "/",       "description": "List available endpoints"},
            {"method": "GET",  "path": "/health",  "description": "Health check"},
            {"method": "GET",  "path": "/items",   "description": "List all items"},
            {"method": "POST", "path": "/items",   "description": "Create an item — body: {name: str, value: float}"},
        ],
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/items", response_model=list[ItemOut])
def list_items() -> list[dict]:
    with app.state.engine.connect() as conn:
        rows = conn.execute(items_table.select()).mappings().all()
    return [dict(r) for r in rows]


@app.post("/items", response_model=ItemOut, status_code=201)
def create_item(item: ItemIn) -> dict:
    with app.state.engine.connect() as conn:
        result = conn.execute(
            items_table.insert().values(name=item.name, value=item.value).returning(
                items_table.c.id, items_table.c.name, items_table.c.value
            )
        )
        row = result.mappings().one()
        conn.commit()
    return dict(row)
