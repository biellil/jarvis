"""jarvis.platform — OS-specific backends (Linux, Windows, macOS).

sys.platform checks are ONLY allowed in this module (D-13 / ARCH-01).
All other modules must call get_platform() instead.
"""

import sys

from jarvis.platform.base import AbstractPlatform


def get_platform() -> AbstractPlatform:
    """Return the correct platform implementation for the current OS.

    Raises:
        RuntimeError: If the current OS is not supported.
    """
    if sys.platform.startswith("linux"):
        from jarvis.platform.linux import LinuxPlatform

        return LinuxPlatform()
    elif sys.platform == "win32":
        from jarvis.platform.windows import WindowsPlatform

        return WindowsPlatform()
    elif sys.platform == "darwin":
        from jarvis.platform.macos import MacOSPlatform

        return MacOSPlatform()
    else:
        raise RuntimeError(f"Unsupported platform: {sys.platform}")
