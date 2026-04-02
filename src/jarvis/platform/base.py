"""Abstract base class for all OS-specific platform operations.

Future phases will add methods to this interface:
- open_app, list_files, adjust_volume, set_brightness (Phase 4)
"""

from abc import ABC, abstractmethod


class AbstractPlatform(ABC):
    """Common interface for all OS-specific operations.

    Future phases will add methods: open_app, list_files, adjust_volume, etc.
    """

    @abstractmethod
    def get_os_name(self) -> str:
        """Return lowercase OS identifier: 'linux', 'windows', or 'macos'."""
        ...
