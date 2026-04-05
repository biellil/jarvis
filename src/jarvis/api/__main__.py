"""Entrypoint for `python -m jarvis.api`.

Starts the uvicorn server with a single worker.
CRITICAL per D-01: workers=1 — in-memory session_store breaks with multiple workers.
"""

import uvicorn

from jarvis.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "jarvis.api:app",
        host=settings.api_host,
        port=settings.api_port,
        workers=1,  # CRITICAL per D-01: single worker — in-memory session
    )
