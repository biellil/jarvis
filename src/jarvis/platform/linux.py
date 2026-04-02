"""Linux-specific platform implementation."""

from jarvis.platform.base import AbstractPlatform


class LinuxPlatform(AbstractPlatform):
    """Platform backend for Linux systems."""

    def get_os_name(self) -> str:
        return "linux"
