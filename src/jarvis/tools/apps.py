"""Application management @tool payload functions for JARVIS.

Per D-02: These functions return structured dict payloads — they do NOT execute
system commands. The local ActionExecutor interprets and performs the actual
process management operations.

Per D-03: Closing apps does NOT require confirmation (only delete_file and
kill_process do). Abrir e fechar apps são operações reversíveis.
"""

from langchain_core.tools import tool


@tool
def open_app(app_name: str) -> dict:
    """Abre um aplicativo pelo nome / Open an application by name.

    Use esta tool quando o usuário pedir para abrir, iniciar ou lançar
    um aplicativo ou programa (ex: 'abre o Firefox', 'inicia o terminal').

    Args:
        app_name: Nome do aplicativo a abrir (ex: 'firefox', 'gnome-terminal').

    Returns:
        Payload dict com action='open_app' para o executor local.
    """
    return {"action": "open_app", "args": {"app": app_name}}


@tool
def close_app(app_name: str) -> dict:
    """Fecha um aplicativo pelo nome / Close an application by name.

    Use esta tool quando o usuário pedir para fechar, encerrar ou parar
    um aplicativo que está em execução.

    Args:
        app_name: Nome do aplicativo a fechar (ex: 'firefox', 'vlc').

    Returns:
        Payload dict com action='close_app' para o executor local.
    """
    return {"action": "close_app", "args": {"app": app_name}}
