"""FastAPI lifespan context manager — manages the global ChatSession lifecycle.

Per D-01 (research): Single uvicorn worker — one global session in-memory.
The session is stored on app.state and shared across all request handlers.

Per D-03 (config): Never read os.environ directly — always use settings singleton.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from loguru import logger

from jarvis.config import settings
from jarvis.core.session import ChatSession
from jarvis.core.voice import WhisperTranscriber
from jarvis.executor.base import ActionExecutor
from jarvis.llm.factory import create_llm
from jarvis.memory.store import MemoryStore, ToolLogger
from jarvis.memory.vectors import MemoryVectors
from jarvis.tools import ALL_TOOLS


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize global resources at startup, clean up on shutdown.

    Stores on app.state:
        session: ChatSession — the global conversation session
        db: MemoryStore — SQLite memory store
        vectors: MemoryVectors — ChromaDB semantic memory
        transcriber: WhisperTranscriber — audio transcription for AUDIO-01
    """
    logger.info("JARVIS API starting up...")

    # Ensure data directories exist (per D-03: paths from settings)
    sqlite_dir = os.path.dirname(settings.sqlite_path)
    if sqlite_dir:
        os.makedirs(sqlite_dir, exist_ok=True)
    os.makedirs(settings.chroma_path, exist_ok=True)

    # Initialize backing stores
    db = MemoryStore(settings.sqlite_path)
    vectors = MemoryVectors(settings.chroma_path)

    # ActionExecutor requires ToolLogger for TOOL-05 audit log
    tool_logger = ToolLogger(settings.sqlite_path)
    executor = ActionExecutor(tool_logger=tool_logger)

    # Initialize WhisperTranscriber for audio endpoint
    transcriber = WhisperTranscriber(
        model_size=settings.whisper_model,
        language=settings.whisper_language,
    )

    # Create LLM and session
    llm = create_llm()
    session = ChatSession(
        llm=llm,
        db=db,
        vectors=vectors,
        tools=ALL_TOOLS,
        executor=executor,
    )

    # Attach to app.state for access in route handlers
    app.state.session = session
    app.state.db = db
    app.state.vectors = vectors
    app.state.transcriber = transcriber

    logger.info("JARVIS API ready.")

    yield

    # Shutdown: save session and close connections
    logger.info("JARVIS API shutting down...")
    await session.save()
    db.close()
    tool_logger.close()
    logger.info("JARVIS API shut down.")
