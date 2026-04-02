"""Tests for ARCH-03 and ARCH-04: Startup validation.

These tests verify that JARVIS validates dependency versions at startup and
fails with a clear error message when required versions are missing or when
LM Studio is unreachable.
"""

import importlib.metadata
import pytest


def test_version_pins() -> None:
    """validate_versions() passes when correct package versions are installed.

    ARCH-03: langchain-core>=1.2.22 and langgraph-checkpoint-sqlite>=3.0.1
    must be installed and pass the version check.
    """
    from jarvis.core.startup import validate_versions

    # Should not raise or exit — packages are installed with correct versions
    validate_versions()


def test_lm_studio_unreachable() -> None:
    """validate_lm_studio_reachable() calls sys.exit(1) when URL is unreachable."""
    from jarvis.core.startup import validate_lm_studio_reachable

    # Port 99999 is unreachable — should trigger sys.exit(1)
    with pytest.raises(SystemExit) as exc_info:
        validate_lm_studio_reachable(url="http://localhost:99999/v1")

    assert exc_info.value.code == 1


def test_missing_package(monkeypatch: pytest.MonkeyPatch) -> None:
    """validate_versions() calls sys.exit(1) when a required package is missing."""
    from importlib.metadata import PackageNotFoundError
    from jarvis.core.startup import validate_versions

    def raise_not_found(name: str) -> str:
        raise PackageNotFoundError(name)

    monkeypatch.setattr(importlib.metadata, "version", raise_not_found)

    with pytest.raises(SystemExit) as exc_info:
        validate_versions()

    assert exc_info.value.code == 1
