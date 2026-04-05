"""Vision @tool payload function for JARVIS.

Per D-02: Returns structured dict payload — does NOT perform analysis directly.
Per ARCH-02: pyautogui.screenshot() is synchronous (~200-500ms). Callers
(e.g., ChatSession) MUST invoke via asyncio.to_thread() to avoid blocking
the async event loop.

Usage by session.py (Plan 02):
    result = await asyncio.to_thread(analyze_screen.invoke, {})
"""

import base64
from io import BytesIO

from langchain_core.tools import tool


@tool
def analyze_screen() -> dict:
    """Captures the current screen and returns it for visual analysis.

    Use when the user asks about what is on their screen, wants to analyze
    an error message or dialog, needs visual context about the current state
    of their desktop, or asks JARVIS to look at something visible on screen.

    Note: This tool performs a blocking screenshot capture (~200ms).
    The caller (ChatSession) must invoke via asyncio.to_thread() to maintain
    async compliance (ARCH-02).

    Returns:
        dict with keys:
            - "action": "analyze_screen"
            - "image_base64": base64-encoded PNG string of the current screen
    """
    # Import inside function to avoid module-level DISPLAY requirement on Linux
    import pyautogui

    screenshot = pyautogui.screenshot()

    buf = BytesIO()
    screenshot.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {"action": "analyze_screen", "image_base64": b64}
