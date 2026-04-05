"""Tests for POST /chat (API-01) and GET /chat/stream (API-02) endpoints.

These tests use the shared `client` fixture from conftest.py which provides
a lightweight test_app with mocked ChatSession (no real LLM/DB).

API-01: POST /chat
  - Returns JSON with response text
  - Returns 422 for missing/empty body (Pydantic validation)
  - Returns 422 for body missing required `message` field
  - Returns 429 if session is busy

API-02: GET /chat/stream
  - Returns text/event-stream content-type
  - Yields tokens in SSE format (data: token\n\n)
  - Returns 422 if `message` query param is missing
"""

import asyncio
import pytest
from unittest.mock import AsyncMock


@pytest.mark.anyio
async def test_chat_post(client, mock_session):
    """API-01: POST /chat returns 200 JSON with response text."""
    mock_session.send = AsyncMock(return_value="Ola! Como posso ajudar?")

    response = await client.post("/chat", json={"message": "oi"})

    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Ola! Como posso ajudar?"
    mock_session.send.assert_called_once_with("oi")


@pytest.mark.anyio
async def test_chat_post_empty_body(client):
    """API-01: POST /chat with no body returns 422 (Pydantic validation)."""
    response = await client.post("/chat")

    assert response.status_code == 422


@pytest.mark.anyio
async def test_chat_post_missing_message(client):
    """API-01: POST /chat with JSON missing `message` field returns 422."""
    response = await client.post("/chat", json={"text": "oi"})

    assert response.status_code == 422


@pytest.mark.anyio
async def test_chat_post_empty_string_message(client, mock_session):
    """API-01: POST /chat with empty string message is allowed (Pydantic allows empty str).

    ChatSession.send() is responsible for validating message content — not the API layer.
    """
    mock_session.send = AsyncMock(return_value="Desculpe, nao entendi.")

    response = await client.post("/chat", json={"message": ""})

    # Pydantic does NOT reject empty strings — that's send()'s concern
    assert response.status_code == 200


@pytest.mark.anyio
async def test_chat_stream_content_type(client, mock_session):
    """API-02: GET /chat/stream returns text/event-stream content-type."""
    async def fake_send_stream(msg):
        yield "token1"
        yield "token2"

    mock_session.send_stream = fake_send_stream

    response = await client.get("/chat/stream", params={"message": "oi"})

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]


@pytest.mark.anyio
async def test_chat_stream_tokens(client, mock_session):
    """API-02: GET /chat/stream yields tokens as SSE data events."""
    async def fake_send_stream(msg):
        for token in ["Ola", " mundo", "!"]:
            yield token

    mock_session.send_stream = fake_send_stream

    response = await client.get("/chat/stream", params={"message": "oi"})

    assert response.status_code == 200
    # SSE format: "data: token\n\n" per event — check tokens appear in body
    body = response.text
    assert "Ola" in body
    assert " mundo" in body
    assert "!" in body


@pytest.mark.anyio
async def test_chat_stream_missing_message(client):
    """API-02: GET /chat/stream without `message` query param returns 422."""
    response = await client.get("/chat/stream")

    assert response.status_code == 422


@pytest.mark.anyio
async def test_chat_stream_message_passed_to_send_stream(client, mock_session):
    """API-02: The query param message is passed verbatim to send_stream()."""
    received_messages = []

    async def capturing_send_stream(msg):
        received_messages.append(msg)
        yield "response"

    mock_session.send_stream = capturing_send_stream

    await client.get("/chat/stream", params={"message": "hello world"})

    assert received_messages == ["hello world"]
