"""Chat endpoints for JARVIS API.

API-01: POST /chat — send message, receive complete JSON response.
API-02: GET /chat/stream — receive tokens as Server-Sent Events (SSE).
AUDIO-01: POST /chat/audio — accept audio upload, transcribe, return response.

Per D-01: Single global ChatSession shared across requests. asyncio.Lock
prevents concurrent sessions from interleaving messages into shared history.
Returns 429 if a request arrives while session is already processing.

Per D-02: SSE endpoint uses send_stream() which does NOT print to stdout.
POST /chat uses send() which does print to stdout (acceptable server-side noise).

Per RESEARCH: SSE uses GET with query param (EventSource API is GET-only in browsers).
"""

import asyncio
import os
from collections.abc import AsyncIterable
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
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


@router.post("/chat/audio", response_model=ChatResponse)
async def chat_audio(
    request: Request, audio: UploadFile = File(...)
) -> ChatResponse:
    """AUDIO-01: Accept audio file upload, transcribe, and return response.

    Accepts WAV audio file via multipart/form-data, saves to temp file,
    transcribes using WhisperTranscriber, sends transcript to ChatSession,
    and returns the assistant's response.

    Per D-10 and research: Uses NamedTemporaryFile with .wav suffix, ensures
    cleanup in finally block (Pitfall 5). Returns 429 if session is busy.
    Returns 400 if audio is silent (empty transcript).

    Args:
        audio: Uploaded audio file (form field name must match client).

    Returns:
        ChatResponse with assistant's message based on transcribed audio.

    Raises:
        HTTPException(400): If transcript is empty (silent audio).
        HTTPException(429): If session is currently processing another request.
        HTTPException(500): If transcription or processing fails.
    """
    session = request.app.state.session
    transcriber = request.app.state.transcriber

    if _session_lock.locked():
        raise HTTPException(status_code=429, detail="Session busy — try again later")

    tmp_path = None
    try:
        # Save uploaded audio to temporary file with .wav suffix
        # Per Pitfall 5: delete=False to control cleanup manually
        with NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            tmp_path = tmp_file.name
            content = await audio.read()
            tmp_file.write(content)

        # Transcribe audio using WhisperTranscriber
        transcript = await transcriber.transcribe(tmp_path)

        # Check for empty transcript (silent audio)
        if not transcript or transcript.strip() == "":
            raise HTTPException(
                status_code=400, detail="No speech detected in audio file"
            )

        # Send transcript to ChatSession and get response
        async with _session_lock:
            response_text = await session.send(transcript)

        return ChatResponse(message=response_text)

    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=f"File error: {str(e)}")
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Audio processing failed: {str(e)}"
        )
    finally:
        # Cleanup temp file (Pitfall 5)
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass  # Best effort cleanup
