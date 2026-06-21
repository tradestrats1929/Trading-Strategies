FROM python:3.12-slim

WORKDIR /app
COPY . .

RUN pip install --no-cache-dir -e src/libs/hello_lib -e src/services/python/hello_api

ENV APP_ENV=production
