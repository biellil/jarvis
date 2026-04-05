"""System control @tool payload functions for JARVIS.

Per D-02: These functions return structured dict payloads — they do NOT execute
system commands. The local ActionExecutor interprets and performs the actual
system operations (e.g., pactl for volume, brightnessctl for brightness).
"""

from langchain_core.tools import tool


@tool
def set_volume(level: int) -> dict:
    """Define o volume do sistema / Set system volume level.

    Use esta tool quando o usuário pedir para ajustar, aumentar, diminuir
    ou definir o volume do sistema.

    Args:
        level: Nível de volume de 0 a 100.

    Returns:
        Payload dict com action='set_volume' para o executor local.
    """
    return {"action": "set_volume", "args": {"level": level}}


@tool
def set_brightness(level: int) -> dict:
    """Define o brilho da tela / Set screen brightness level.

    Use esta tool quando o usuário pedir para ajustar, aumentar, diminuir
    ou definir o brilho da tela ou monitor.

    Args:
        level: Nível de brilho de 0 a 100.

    Returns:
        Payload dict com action='set_brightness' para o executor local.
    """
    return {"action": "set_brightness", "args": {"level": level}}


@tool
def list_processes() -> dict:
    """Lista os processos em execução / List running processes.

    Use esta tool quando o usuário pedir para ver, listar ou verificar
    quais programas ou processos estão rodando no sistema.

    Returns:
        Payload dict com action='list_processes' para o executor local.
    """
    return {"action": "list_processes", "args": {}}
