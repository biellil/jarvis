"""Tests for LLM-02: Model capability detection.

These tests verify that detect_capabilities() correctly infers vision support,
tool calling support, and context window size from model names using heuristics.
Per D-16: detection uses name heuristics only — no LLM call is made at startup.
"""

import pytest
from jarvis.llm.capabilities import detect_capabilities, ModelCapabilities


def test_vision_detection_vision_keyword() -> None:
    """Model name containing 'vision' sets vision capability to True."""
    caps = detect_capabilities("http://localhost:1234/v1", "llava-vision-7b")
    assert caps.vision is True


def test_vision_detection_vl_keyword() -> None:
    """Model name containing 'vl' sets vision capability to True."""
    caps = detect_capabilities("http://localhost:1234/v1", "qwen2-vl-7b-instruct")
    assert caps.vision is True


def test_vision_detection_llava_keyword() -> None:
    """Model name containing 'llava' sets vision capability to True."""
    caps = detect_capabilities("http://localhost:1234/v1", "llava-1.6-mistral-7b")
    assert caps.vision is True


def test_vision_detection_pixtral_keyword() -> None:
    """Model name containing 'pixtral' sets vision capability to True."""
    caps = detect_capabilities("http://localhost:1234/v1", "pixtral-12b")
    assert caps.vision is True


def test_tool_detection_instruct_keyword() -> None:
    """Model name containing 'instruct' sets tool_calling capability to True."""
    caps = detect_capabilities("http://localhost:1234/v1", "mistral-7b-instruct-v0.3")
    assert caps.tool_calling is True


def test_tool_detection_llama3_keyword() -> None:
    """Model name containing 'llama-3' sets tool_calling capability to True."""
    caps = detect_capabilities("http://localhost:1234/v1", "llama-3-8b-instruct")
    assert caps.tool_calling is True


def test_vision_and_tool_combined() -> None:
    """Model name with both vision and tool markers sets both capabilities."""
    caps = detect_capabilities("http://localhost:1234/v1", "llama-3-vision-8b")
    assert caps.vision is True
    assert caps.tool_calling is True


def test_context_window_128k() -> None:
    """Model name containing '128k' sets context_window to 131072."""
    caps = detect_capabilities("http://localhost:1234/v1", "codellama-13b-128k")
    assert caps.context_window == 131072


def test_context_window_32k() -> None:
    """Model name containing '32k' sets context_window to 32768."""
    caps = detect_capabilities("http://localhost:1234/v1", "gemma-7b-32k")
    assert caps.context_window == 32768


def test_no_capabilities() -> None:
    """Plain model name with no known markers returns all False/None capabilities."""
    caps = detect_capabilities("http://localhost:1234/v1", "my-custom-model")
    assert caps.vision is False
    assert caps.tool_calling is False
    assert caps.context_window is None


def test_model_id_preserved() -> None:
    """detect_capabilities preserves the model_id field in the returned dataclass."""
    model_name = "some-model-2b"
    caps = detect_capabilities("http://localhost:1234/v1", model_name)
    assert caps.model_id == model_name


def test_return_type_is_model_capabilities() -> None:
    """detect_capabilities returns a ModelCapabilities instance."""
    caps = detect_capabilities("http://localhost:1234/v1", "test-model")
    assert isinstance(caps, ModelCapabilities)
