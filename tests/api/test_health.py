"""Unit tests for health endpoints (API-03, API-04).

API-03: GET /health — liveness probe
API-04: GET /health/ready — readiness probe (SQLite + ChromaDB checks)
"""

import pytest
from unittest.mock import patch


@pytest.mark.anyio
async def test_health_liveness(client):
    """API-03: GET /health returns {"status": "ok"} with 200."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_health_ready_ok(client):
    """API-04: GET /health/ready returns 200 when all stores are OK."""
    with patch("jarvis.api.routes.health.Path") as mock_path:
        mock_path.return_value.exists.return_value = True
        # mock_vectors._client.heartbeat() already returns 1 via fixture
        response = await client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["stores"]["sqlite"] == "ok"
    assert data["stores"]["chromadb"] == "ok"


@pytest.mark.anyio
async def test_health_ready_sqlite_missing(client):
    """API-04: GET /health/ready returns 503 when SQLite file does not exist."""
    with patch("jarvis.api.routes.health.Path") as mock_path:
        mock_path.return_value.exists.return_value = False
        response = await client.get("/health/ready")
    assert response.status_code == 503
    data = response.json()
    assert data["detail"]["status"] == "not_ready"
    assert any("sqlite" in err for err in data["detail"]["errors"])


@pytest.mark.anyio
async def test_health_ready_chromadb_down(client, mock_vectors):
    """API-04: GET /health/ready returns 503 when ChromaDB heartbeat fails."""
    mock_vectors._client.heartbeat.side_effect = Exception("connection refused")
    with patch("jarvis.api.routes.health.Path") as mock_path:
        mock_path.return_value.exists.return_value = True
        response = await client.get("/health/ready")
    assert response.status_code == 503
    data = response.json()
    assert data["detail"]["status"] == "not_ready"
    assert any("chromadb" in err for err in data["detail"]["errors"])
