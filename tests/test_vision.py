"""Unit tests for vision tool (analyze_screen) and ScreenAnalyzer fallback chain.

Per TDD approach: tests written first (RED), then implementations created (GREEN).
Per D-02: analyze_screen returns structured dict payload.
Per ARCH-02: pyautogui.screenshot is synchronous but callers must use asyncio.to_thread.

Note: pyautogui requires a DISPLAY env on Linux. We mock the entire module
to allow headless testing.
"""

import base64
import sys
import pytest
from unittest.mock import patch, MagicMock
from PIL import Image
from io import BytesIO


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_fake_image(width: int = 100, height: int = 100, color: str = "red") -> Image.Image:
    """Create a small PIL Image for mocking pyautogui.screenshot()."""
    return Image.new("RGB", (width, height), color)


def _make_fake_image_b64(width: int = 10, height: int = 10, color: str = "blue") -> str:
    """Create a base64-encoded PNG string for ScreenAnalyzer tests."""
    img = Image.new("RGB", (width, height), color)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ---------------------------------------------------------------------------
# Fixture: mock pyautogui at module level to avoid DISPLAY requirement
# ---------------------------------------------------------------------------


def _make_pyautogui_mock(screenshot_return_value=None):
    """Build a MagicMock that replaces the pyautogui module."""
    mock_pyautogui = MagicMock()
    if screenshot_return_value is None:
        screenshot_return_value = _make_fake_image()
    mock_pyautogui.screenshot.return_value = screenshot_return_value
    return mock_pyautogui


# ---------------------------------------------------------------------------
# Task 1: analyze_screen @tool tests
# ---------------------------------------------------------------------------


def test_analyze_screen_returns_dict():
    """analyze_screen() must return a dict."""
    mock_pyautogui = _make_pyautogui_mock()
    with patch.dict(sys.modules, {"pyautogui": mock_pyautogui}):
        # Force reimport with mocked module
        if "jarvis.tools.vision" in sys.modules:
            del sys.modules["jarvis.tools.vision"]
        from jarvis.tools.vision import analyze_screen

        result = analyze_screen.invoke({})
    assert isinstance(result, dict)


def test_analyze_screen_action_key():
    """analyze_screen()['action'] must equal 'analyze_screen'."""
    mock_pyautogui = _make_pyautogui_mock()
    with patch.dict(sys.modules, {"pyautogui": mock_pyautogui}):
        if "jarvis.tools.vision" in sys.modules:
            del sys.modules["jarvis.tools.vision"]
        from jarvis.tools.vision import analyze_screen

        result = analyze_screen.invoke({})
    assert result["action"] == "analyze_screen"


def test_analyze_screen_image_base64_key():
    """analyze_screen() must return 'image_base64' key."""
    mock_pyautogui = _make_pyautogui_mock()
    with patch.dict(sys.modules, {"pyautogui": mock_pyautogui}):
        if "jarvis.tools.vision" in sys.modules:
            del sys.modules["jarvis.tools.vision"]
        from jarvis.tools.vision import analyze_screen

        result = analyze_screen.invoke({})
    assert "image_base64" in result


def test_analyze_screen_base64_decodable():
    """analyze_screen()['image_base64'] must be a valid base64 string."""
    mock_pyautogui = _make_pyautogui_mock()
    with patch.dict(sys.modules, {"pyautogui": mock_pyautogui}):
        if "jarvis.tools.vision" in sys.modules:
            del sys.modules["jarvis.tools.vision"]
        from jarvis.tools.vision import analyze_screen

        result = analyze_screen.invoke({})
    # Should not raise
    decoded = base64.b64decode(result["image_base64"])
    assert len(decoded) > 0


def test_analyze_screen_calls_screenshot_once():
    """pyautogui.screenshot must be called exactly once per analyze_screen() call."""
    mock_pyautogui = _make_pyautogui_mock()
    with patch.dict(sys.modules, {"pyautogui": mock_pyautogui}):
        if "jarvis.tools.vision" in sys.modules:
            del sys.modules["jarvis.tools.vision"]
        from jarvis.tools.vision import analyze_screen

        analyze_screen.invoke({})
    mock_pyautogui.screenshot.assert_called_once()


def test_analyze_screen_no_module_level_import():
    """pyautogui must NOT be imported at module level in vision.py."""
    import importlib
    import importlib.util

    # Load module source via spec to avoid executing it
    spec = importlib.util.find_spec("jarvis.tools.vision")
    if spec is None:
        # Module not yet created — check by file path
        import os
        vision_path = os.path.join("src", "jarvis", "tools", "vision.py")
        if not os.path.exists(vision_path):
            pytest.skip("vision.py not yet created")
        source_file = vision_path
    else:
        source_file = spec.origin

    with open(source_file) as f:
        source = f.read()

    lines = source.splitlines()
    top_level_imports = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("import pyautogui") or stripped.startswith("from pyautogui"):
            # Check it's not inside a function (not indented)
            if not line.startswith(" ") and not line.startswith("\t"):
                top_level_imports.append(line)

    assert len(top_level_imports) == 0, (
        f"pyautogui must not be imported at module level, found: {top_level_imports}"
    )


# ---------------------------------------------------------------------------
# Task 2: ScreenAnalyzer fallback chain tests
# ---------------------------------------------------------------------------


class MockCaps:
    """Minimal ModelCapabilities-like object for tests."""

    def __init__(self, vision: bool):
        self.vision = vision


class MockSettings:
    """Minimal Settings-like object for tests."""

    def __init__(self, anthropic_api_key: str = "", openai_api_key: str = ""):
        self.anthropic_api_key = anthropic_api_key
        self.openai_api_key = openai_api_key


def test_screen_analyzer_vision_path():
    """ScreenAnalyzer.resolve() returns ('image', image_b64, None) when model has vision."""
    from jarvis.core.screen import ScreenAnalyzer

    analyzer = ScreenAnalyzer()
    image_b64 = _make_fake_image_b64()
    caps = MockCaps(vision=True)

    result = analyzer.resolve(image_b64, caps)
    assert result == ("image", image_b64, None)


def test_screen_analyzer_ocr_path():
    """ScreenAnalyzer.resolve() returns ('ocr', None, text) when pytesseract available and returns text."""
    from jarvis.core.screen import ScreenAnalyzer

    analyzer = ScreenAnalyzer()
    image_b64 = _make_fake_image_b64()
    caps = MockCaps(vision=False)
    settings = MockSettings()

    mock_pytesseract = MagicMock()
    mock_pytesseract.image_to_string.return_value = "Hello World"

    with patch.dict(sys.modules, {"pytesseract": mock_pytesseract}):
        result = analyzer.resolve(image_b64, caps, settings=settings)

    assert result[0] == "ocr"
    assert result[1] is None
    assert result[2] == "Hello World"


def test_screen_analyzer_ocr_empty_returns_error_or_cloud():
    """ScreenAnalyzer.resolve() falls through when pytesseract returns empty string."""
    from jarvis.core.screen import ScreenAnalyzer

    analyzer = ScreenAnalyzer()
    image_b64 = _make_fake_image_b64()
    caps = MockCaps(vision=False)
    settings = MockSettings()  # No API keys

    mock_pytesseract = MagicMock()
    mock_pytesseract.image_to_string.return_value = "   \n  \t  "

    with patch.dict(sys.modules, {"pytesseract": mock_pytesseract}):
        result = analyzer.resolve(image_b64, caps, settings=settings)

    # Empty OCR result with no cloud keys => error
    assert result[0] == "error"


def test_screen_analyzer_cloud_fallback_anthropic():
    """ScreenAnalyzer.resolve() returns ('cloud', image_b64, 'anthropic') when OCR unavailable and anthropic_api_key set."""
    from jarvis.core.screen import ScreenAnalyzer

    analyzer = ScreenAnalyzer()
    image_b64 = _make_fake_image_b64()
    caps = MockCaps(vision=False)
    settings = MockSettings(anthropic_api_key="sk-ant-test123")

    # Simulate pytesseract not installed by setting it to None in sys.modules
    with patch.dict(sys.modules, {"pytesseract": None}):
        result = analyzer.resolve(image_b64, caps, settings=settings)

    assert result == ("cloud", image_b64, "anthropic")


def test_screen_analyzer_cloud_fallback_openai():
    """ScreenAnalyzer.resolve() returns ('cloud', image_b64, 'openai') when OCR unavailable and openai_api_key set."""
    from jarvis.core.screen import ScreenAnalyzer

    analyzer = ScreenAnalyzer()
    image_b64 = _make_fake_image_b64()
    caps = MockCaps(vision=False)
    settings = MockSettings(openai_api_key="sk-openai-test123")

    with patch.dict(sys.modules, {"pytesseract": None}):
        result = analyzer.resolve(image_b64, caps, settings=settings)

    assert result == ("cloud", image_b64, "openai")


def test_screen_analyzer_error_path():
    """ScreenAnalyzer.resolve() returns ('error', None, error_message) when no vision path available."""
    from jarvis.core.screen import ScreenAnalyzer

    analyzer = ScreenAnalyzer()
    image_b64 = _make_fake_image_b64()
    caps = MockCaps(vision=False)
    settings = MockSettings()  # No API keys

    with patch.dict(sys.modules, {"pytesseract": None}):
        result = analyzer.resolve(image_b64, caps, settings=settings)

    assert result[0] == "error"
    assert result[1] is None
    assert isinstance(result[2], str)
    assert len(result[2]) > 0
