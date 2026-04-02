"""Tests for ARCH-01: Cross-platform module abstraction.

These tests verify that the platform factory returns the correct platform
implementation for the current OS, and that all implementations share the
same interface.
"""

import sys

import pytest


def test_get_platform_returns_correct_class() -> None:
    """get_platform() returns LinuxPlatform when running on Linux."""
    from jarvis.platform import get_platform
    from jarvis.platform.base import AbstractPlatform
    from jarvis.platform.linux import LinuxPlatform

    result = get_platform()

    assert isinstance(result, AbstractPlatform)
    # On Linux CI/dev machine, also assert concrete class
    if sys.platform.startswith("linux"):
        assert isinstance(result, LinuxPlatform)


def test_platform_has_get_os_name() -> None:
    """All platform implementations expose a get_os_name() method."""
    from jarvis.platform import get_platform

    platform = get_platform()

    assert hasattr(platform, "get_os_name")
    assert callable(platform.get_os_name)

    name = platform.get_os_name()
    assert isinstance(name, str)
    assert len(name) > 0


def test_platform_is_abstract_platform() -> None:
    """get_platform() returns an instance of AbstractPlatform."""
    from jarvis.platform import get_platform
    from jarvis.platform.base import AbstractPlatform

    result = get_platform()

    assert isinstance(result, AbstractPlatform)


def test_linux_os_name() -> None:
    """LinuxPlatform().get_os_name() returns 'linux'."""
    from jarvis.platform.linux import LinuxPlatform

    platform = LinuxPlatform()

    assert platform.get_os_name() == "linux"


def test_windows_os_name() -> None:
    """WindowsPlatform().get_os_name() returns 'windows'."""
    from jarvis.platform.windows import WindowsPlatform

    platform = WindowsPlatform()

    assert platform.get_os_name() == "windows"


def test_macos_os_name() -> None:
    """MacOSPlatform().get_os_name() returns 'macos'."""
    from jarvis.platform.macos import MacOSPlatform

    platform = MacOSPlatform()

    assert platform.get_os_name() == "macos"


def test_unsupported_platform_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """get_platform() raises RuntimeError for unsupported platforms."""
    import importlib

    import jarvis.platform as platform_module

    monkeypatch.setattr(sys, "platform", "freebsd")

    # Reload to bypass cached imports
    importlib.reload(platform_module)

    with pytest.raises(RuntimeError):
        platform_module.get_platform()
