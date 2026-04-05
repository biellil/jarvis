"""JARVIS FastAPI application.

Entry point: `jarvis.api:app`
Start with: `python -m jarvis.api`

Plan 01: Health endpoints (API-03, API-04) + lifespan with global ChatSession.
Plan 02: Chat endpoint will be added here.
"""

from fastapi import FastAPI

from jarvis.api.lifespan import lifespan
from jarvis.api.routes.health import router as health_router

app = FastAPI(title="JARVIS API", lifespan=lifespan)

app.include_router(health_router)
