import os
from sqlalchemy import create_engine, Engine


def get_engine() -> Engine:
    url = os.environ["DATABASE_URL"]
    # Neon returns postgres:// but SQLAlchemy 2.x requires postgresql://
    url = url.replace("postgres://", "postgresql://", 1)
    return create_engine(url)
