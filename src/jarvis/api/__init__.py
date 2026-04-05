"""JARVIS FastAPI application.

Entry point: `jarvis.api:app`
Start with: `python -m jarvis.api`

Plan 01: Health endpoints (API-03, API-04) + lifespan with global ChatSession.
Plan 02: Chat endpoints (API-01, API-02) — POST /chat and GET /chat/stream.
"""

from fastapi import FastAPI

from jarvis.api.lifespan import lifespan
from jarvis.api.routes.chat import router as chat_router
from jarvis.api.routes.health import router as health_router

app = FastAPI(title="JARVIS API", lifespan=lifespan)

app.include_router(health_router)
app.include_router(chat_router)
