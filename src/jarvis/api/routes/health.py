"""Health check endpoints for API-03 and API-04.

API-03: GET /health — liveness probe (always 200 if process is alive)
API-04: GET /health/ready — readiness probe (200 if all stores are accessible, 503 otherwise)

Per Pitfall 4 (research): Never create new PersistentClient per request.
Instead, use the existing vectors._client from app.state (initialized once in lifespan).
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from jarvis.config import settings

router = APIRouter()


@router.get("/health")
async def health():
    """API-03: Liveness probe — returns 200 if the process is alive."""
    return {"status": "ok"}


@router.get("/health/ready")
async def health_ready(request: Request):
    """API-04: Readiness probe — checks SQLite and ChromaDB availability.

    Returns:
        200: {"status": "ok", "stores": {"sqlite": "ok", "chromadb": "ok"}}
        503: {"status": "not_ready", "errors": [...]} if any store is unavailable
    """
    errors = []

    # Check SQLite file exists
    if not Path(settings.sqlite_path).exists():
        errors.append("sqlite: file not found")

    # Check ChromaDB via existing client — never create new PersistentClient per request
    try:
        vectors = request.app.state.vectors
        vectors._client.heartbeat()
    except Exception as e:
        errors.append(f"chromadb: {e}")

    if errors:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "errors": errors},
        )

    return {"status": "ok", "stores": {"sqlite": "ok", "chromadb": "ok"}}
