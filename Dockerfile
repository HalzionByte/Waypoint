# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the frontend
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Same-origin API: the container serves both, so no VITE_API_URL is needed.
RUN npm run build


# ---------------------------------------------------------------------------
# Stage 2 — the app
# ---------------------------------------------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app/ ./app/
COPY backend/seed.py ./

# The built site, served by FastAPI so there is a single origin and URL.
COPY --from=frontend /build/dist/ ./static/

# SQLite and landmark photos live here. Mount a volume at /data so both
# survive restarts and redeploys.
ENV DATABASE_URL="sqlite:////data/waypoint.db" \
    UPLOAD_DIR="/data/uploads" \
    STATIC_DIR="/app/static"

RUN mkdir -p /data/uploads \
    && useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app /data
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
