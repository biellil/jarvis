"""Test stubs for ARCH-03 and ARCH-04: Startup validation.

These tests verify that JARVIS validates dependency versions at startup and
fails with a clear error message when required versions are missing or when
LM Studio is unreachable.
"""

import pytest


@pytest.mark.xfail(reason="Not implemented yet — startup validation not created (plan 01-04)")
def test_version_pins() -> None:
    """validate_versions() passes when correct package versions are installed.

    ARCH-03: langchain-core>=1.2.22 and langgraph-checkpoint-sqlite>=3.0.1
    must be installed and pass the version check.
    """
    from jarvis.core.startup import validate_versions

    # Should not raise or exit
    validate_versions()


@pytest.mark.xfail(reason="Not implemented yet — startup validation not created (plan 01-04)")
def test_lm_studio_unreachable() -> None:
    """validate_lm_studio_reachable() calls sys.exit(1) when URL is unreachable."""
    import sys
    from unittest.mock import patch, MagicMock

    from jarvis.core.startup import validate_lm_studio_reachable

    # httpx.get on a non-routable address should raise ConnectError
    with patch("httpx.get", side_effect=Exception("Connection refused")):
        with pytest.raises(SystemExit) as exc_info:
            validate_lm_studio_reachable(url="http://localhost:9999/v1")

    assert exc_info.value.code == 1


@pytest.mark.xfail(reason="Not implemented yet — startup validation not created (plan 01-04)")
def test_missing_package() -> None:
    """validate_versions() calls sys.exit(1) when a required package is missing."""
    from unittest.mock import patch

    from jarvis.core.startup import validate_versions

    with patch("importlib.metadata.version", side_effect=Exception("Package not found")):
        with pytest.raises(SystemExit) as exc_info:
            validate_versions()

    assert exc_info.value.code == 1
