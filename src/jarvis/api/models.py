"""Pydantic request/response models for the JARVIS API.

These models are shared across all API routes.
Plan 02 will add streaming/session models.
"""

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    message: str
