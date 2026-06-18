import os
from dataclasses import dataclass


def get_env() -> str:
    """Returns current environment: 'local' (default) or 'production'.
    Controlled by the APP_ENV environment variable."""
    return os.getenv("APP_ENV", "local")


@dataclass(frozen=True)
class ServiceUrls:
    hello_api: str


def get_service_urls() -> ServiceUrls:
    """Returns URLs for all Python services based on the current environment.
    In production each URL is read from a required environment variable."""
    if get_env() == "production":
        return ServiceUrls(
            hello_api=os.environ["HELLO_API_URL"],
        )
    return ServiceUrls(
        hello_api="http://localhost:8000",
    )
