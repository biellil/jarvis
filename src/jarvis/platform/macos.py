"""macOS-specific platform implementation."""

from jarvis.platform.base import AbstractPlatform


class MacOSPlatform(AbstractPlatform):
    """Platform backend for macOS systems."""

    def get_os_name(self) -> str:
        return "macos"
