"""Model capability detection — heuristics from model name.

Per D-16: Detection uses name heuristics only. No test call to the LLM
is made at startup. This keeps startup fast and avoids requiring a running
LM Studio server just to query capabilities.

Usage:
    from jarvis.llm.capabilities import detect_capabilities, ModelCapabilities
    caps = detect_capabilities(settings.lm_studio_url, settings.lm_studio_model)
    if caps.vision:
        # enable screen analysis features
"""

import httpx
from dataclasses import dataclass


VISION_KEYWORDS = ["vision", "vl", "llava", "clip", "pixtral", "qwen2-vl", "minicpm-v"]
TOOL_KEYWORDS = ["instruct", "function", "tool", "chat", "qwen", "llama-3", "mistral", "deepseek"]
CONTEXT_SIZES = {"128k": 131072, "32k": 32768, "16k": 16384, "8k": 8192}


@dataclass
class ModelCapabilities:
    """Detected capabilities for a specific model."""

    tool_calling: bool
    vision: bool
    context_window: int | None
    model_id: str


def detect_capabilities(base_url: str, model_id: str) -> ModelCapabilities:
    """Detect model capabilities from model name using heuristics.

    Per D-16: No LLM call is made — all detection is based on model name
    patterns commonly used by the open-source model community.

    Args:
        base_url: LM Studio or other provider base URL (not used for heuristics
                  but kept for API consistency and future introspection use).
        model_id: The model identifier string to analyze.

    Returns:
        ModelCapabilities dataclass with detected features.
    """
    name_lower = model_id.lower()

    vision = any(kw in name_lower for kw in VISION_KEYWORDS)
    tools = any(kw in name_lower for kw in TOOL_KEYWORDS)

    ctx: int | None = None
    for key, size in CONTEXT_SIZES.items():
        if key in name_lower:
            ctx = size
            break

    return ModelCapabilities(
        tool_calling=tools,
        vision=vision,
        context_window=ctx,
        model_id=model_id,
    )


def get_lm_studio_models(base_url: str) -> list[str]:
    """Return list of model IDs currently loaded in LM Studio.

    Makes a live HTTP request to the /models endpoint.
    Returns empty list on any error (server not running, timeout, etc.).

    Args:
        base_url: LM Studio server base URL (e.g. "http://localhost:1234/v1").

    Returns:
        List of model ID strings, or empty list if unavailable.
    """
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"{base_url}/models")
            resp.raise_for_status()
            data = resp.json()
            return [m["id"] for m in data.get("data", [])]
    except Exception:
        return []
