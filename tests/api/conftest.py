"""Shared test fixtures for JARVIS API tests.

Uses a lightweight test_app without lifespan to avoid needing a real LLM/DB.
State is injected directly via app.state before each test.

This pattern is reusable by Plan 02 chat endpoint tests.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def mock_session():
    """Mock ChatSession with async send/save methods."""
    session = MagicMock()
    session.send = AsyncMock(return_value="Ola! Como posso ajudar?")
    session.save = AsyncMock()
    return session


@pytest.fixture
def mock_db():
    """Mock MemoryStore with close method."""
    db = MagicMock()
    db.close = MagicMock()
    return db


@pytest.fixture
def mock_vectors():
    """Mock MemoryVectors with heartbeat-capable _client."""
    vectors = MagicMock()
    vectors._client = MagicMock()
    vectors._client.heartbeat = MagicMock(return_value=1)
    return vectors


@pytest.fixture
async def client(mock_session, mock_db, mock_vectors):
    """AsyncClient with mocked app state — no real LLM/DB needed.

    Creates a lightweight FastAPI test_app including only the health router,
    bypassing the lifespan so no real initialization occurs.
    """
    from fastapi import FastAPI
    from jarvis.api.routes.health import router as health_router

    test_app = FastAPI()
    test_app.include_router(health_router)
    test_app.state.session = mock_session
    test_app.state.db = mock_db
    test_app.state.vectors = mock_vectors

    async with AsyncClient(
        transport=ASGITransport(app=test_app),
        base_url="http://test",
    ) as ac:
        yield ac
