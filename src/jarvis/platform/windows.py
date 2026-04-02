"""Windows-specific platform implementation."""

from jarvis.platform.base import AbstractPlatform


class WindowsPlatform(AbstractPlatform):
    """Platform backend for Windows systems."""

    def get_os_name(self) -> str:
        return "windows"
