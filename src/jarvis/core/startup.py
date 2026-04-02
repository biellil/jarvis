"""Startup validation — version pinning and LM Studio reachability checks.

Per ARCH-04: JARVIS validates dependency versions at startup and exits with a
clear error message if wrong versions are installed or if LM Studio is
unreachable when configured.

Error messages are in Portuguese with corrective actions (per D-15).
No stack traces are shown — only actionable messages + sys.exit(1).
"""

import sys
import importlib.metadata
import httpx
from packaging.version import Version


VERSION_PINS: dict[str, str] = {
    "langchain-core": "1.2.22",
    "langgraph-checkpoint-sqlite": "3.0.1",
}


def validate_versions() -> None:
    """Check that all pinned packages are installed at the required minimum version.

    Prints a Portuguese error message and calls sys.exit(1) if any package
    is missing or below the minimum version.
    """
    for package, minimum in VERSION_PINS.items():
        try:
            installed = importlib.metadata.version(package)
            if Version(installed) < Version(minimum):
                print(
                    f"ERRO: {package} {installed} instalado, mas >={minimum} e necessario. "
                    f"Execute: pip install '{package}>={minimum}'"
                )
                sys.exit(1)
        except importlib.metadata.PackageNotFoundError:
            print(
                f"ERRO: Pacote '{package}' nao encontrado. "
                f"Execute: pip install '{package}>={minimum}'"
            )
            sys.exit(1)


def validate_lm_studio_reachable(url: str) -> None:
    """Check that LM Studio server is reachable at the given URL.

    Makes a GET request to {url}/models with a short timeout.
    Prints a Portuguese error message and calls sys.exit(1) if unreachable.

    Args:
        url: LM Studio base URL (e.g. "http://localhost:1234/v1").
    """
    try:
        with httpx.Client(timeout=3.0) as client:
            client.get(f"{url}/models")
    except (httpx.ConnectError, httpx.TimeoutException):
        print(
            f"ERRO: LM Studio nao acessivel em {url}. "
            "Verifique se esta rodando e se LM_STUDIO_URL esta correto."
        )
        sys.exit(1)
