"""Chat endpoints for JARVIS API.

API-01: POST /chat — send message, receive complete JSON response.
API-02: GET /chat/stream — receive tokens as Server-Sent Events (SSE).

Per D-01: Single global ChatSession shared across requests. asyncio.Lock
prevents concurrent sessions from interleaving messages into shared history.
Returns 429 if a request arrives while session is already processing.

Per D-02: SSE endpoint uses send_stream() which does NOT print to stdout.
POST /chat uses send() which does print to stdout (acceptable server-side noise).

Per RESEARCH: SSE uses GET with query param (EventSource API is GET-only in browsers).
"""

import asyncio
from collections.abc import AsyncIterable

from fastapi import APIRouter, HTTPException, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from jarvis.api.models import ChatRequest, ChatResponse

router = APIRouter()

# Session lock — per RESEARCH open question 1: prevents concurrent sends from
# interleaving messages into shared ChatSession history.
# D-01: single worker means this asyncio.Lock is process-global.
_session_lock = asyncio.Lock()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    """API-01: Send message and receive complete response as JSON.

    Wraps ChatSession.send(). Returns 429 if another request is in progress.

    Args:
        body: ChatRequest with required `message` field (validated by Pydantic).

    Returns:
        ChatResponse with `message` field containing the full assistant response.

    Raises:
        HTTPException(429): If session is currently processing another request.
    """
    session = request.app.state.session
    if _session_lock.locked():
        raise HTTPException(status_code=429, detail="Session busy — try again later")
    async with _session_lock:
        response_text = await session.send(body.message)
    return ChatResponse(message=response_text)


@router.get("/chat/stream", response_class=EventSourceResponse)
async def chat_stream(
    request: Request, message: str
) -> AsyncIterable[ServerSentEvent]:
    """API-02: Stream tokens via Server-Sent Events.

    GET /chat/stream?message=oi yields tokens incrementally as SSE events.
    Uses send_stream() which yields tokens WITHOUT printing to stdout (D-02).
    Returns 429 if another request is in progress.

    Args:
        message: The user's message as a query parameter.

    Yields:
        ServerSentEvent with data=token for each streamed token.

    Raises:
        HTTPException(429): If session is currently processing another request.
    """
    session = request.app.state.session
    if _session_lock.locked():
        raise HTTPException(status_code=429, detail="Session busy — try again later")
    async with _session_lock:
        async for token in session.send_stream(message):
            yield ServerSentEvent(data=token)
