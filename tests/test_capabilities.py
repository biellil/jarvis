"""Test stubs for LLM-02: Model capability detection.

These tests verify that the CapabilityDetector correctly infers vision support,
tool calling support, and context window size from model names and the /v1/models
endpoint response.
"""

import pytest


@pytest.mark.xfail(reason="Not implemented yet — CapabilityDetector not created (plan 01-02)")
def test_vision_detection() -> None:
    """Model name containing 'vision' sets vision capability to True."""
    from jarvis.llm.capabilities import CapabilityDetector, ModelCapabilities

    detector = CapabilityDetector()
    caps: ModelCapabilities = detector.detect("llava-vision-7b")

    assert caps.vision is True


@pytest.mark.xfail(reason="Not implemented yet — CapabilityDetector not created (plan 01-02)")
def test_tool_detection() -> None:
    """Model name containing 'instruct' sets tool_calling capability to True."""
    from jarvis.llm.capabilities import CapabilityDetector, ModelCapabilities

    detector = CapabilityDetector()
    caps: ModelCapabilities = detector.detect("mistral-7b-instruct")

    assert caps.tool_calling is True


@pytest.mark.xfail(reason="Not implemented yet — CapabilityDetector not created (plan 01-02)")
def test_context_window_detection() -> None:
    """Model name containing '128k' sets context_window to 131072."""
    from jarvis.llm.capabilities import CapabilityDetector, ModelCapabilities

    detector = CapabilityDetector()
    caps: ModelCapabilities = detector.detect("qwen2.5-14b-128k")

    assert caps.context_window == 131072


@pytest.mark.xfail(reason="Not implemented yet — CapabilityDetector not created (plan 01-02)")
def test_no_capabilities() -> None:
    """Plain model name with no known markers returns all False/None capabilities."""
    from jarvis.llm.capabilities import CapabilityDetector, ModelCapabilities

    detector = CapabilityDetector()
    caps: ModelCapabilities = detector.detect("unknown-base-model-v1")

    assert caps.vision is False
    assert caps.tool_calling is False
    assert caps.context_window is None
