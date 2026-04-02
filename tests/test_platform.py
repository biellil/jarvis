"""Test stubs for ARCH-01: Cross-platform module abstraction.

These tests verify that the platform factory returns the correct platform
implementation for the current OS, and that all implementations share the
same interface.
"""

import pytest


@pytest.mark.xfail(reason="Not implemented yet — platform module not created (plan 01-04)")
def test_get_platform_returns_correct_class() -> None:
    """get_platform() returns LinuxPlatform when running on Linux."""
    import sys
    from unittest.mock import patch

    # Force sys.platform to 'linux' regardless of actual OS
    with patch.object(sys, "platform", "linux"):
        from jarvis.platform import get_platform
        from jarvis.platform.linux import LinuxPlatform

        platform = get_platform()

        assert isinstance(platform, LinuxPlatform)


@pytest.mark.xfail(reason="Not implemented yet — platform module not created (plan 01-04)")
def test_platform_has_get_os_name() -> None:
    """All platform implementations expose a get_os_name() method."""
    import sys
    from unittest.mock import patch

    with patch.object(sys, "platform", "linux"):
        from jarvis.platform import get_platform

        platform = get_platform()

        assert hasattr(platform, "get_os_name")
        assert callable(platform.get_os_name)

        name = platform.get_os_name()
        assert isinstance(name, str)
        assert len(name) > 0
