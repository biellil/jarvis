"""File operation @tool payload functions for JARVIS.

Per D-02: These functions return structured dict payloads — they do NOT execute
system commands. The local ActionExecutor interprets and performs the actual
file system operations.

Per D-03: Destructive operations (delete_file) include 'requires_confirmation: True'
in the returned payload. Mover arquivo NÃO requer confirmação.
"""

from langchain_core.tools import tool


@tool
def list_files(directory: str) -> dict:
    """Lista os arquivos de um diretório / List files in a directory.

    Use esta tool quando o usuário pedir para ver, listar ou explorar
    o conteúdo de uma pasta ou diretório.

    Args:
        directory: Caminho absoluto ou relativo do diretório a listar.

    Returns:
        Payload dict com action='list_files' para o executor local.
    """
    return {"action": "list_files", "args": {"directory": directory}}


@tool
def search_files(pattern: str, directory: str = ".") -> dict:
    """Busca arquivos por padrão glob em um diretório / Search files by glob pattern.

    Use esta tool quando o usuário pedir para encontrar, buscar ou localizar
    arquivos por nome, extensão, ou padrão (ex: '*.py', 'relatorio*').

    Args:
        pattern: Padrão glob para busca (ex: '*.py', 'relatorio*.txt').
        directory: Diretório raiz da busca. Padrão: diretório atual.

    Returns:
        Payload dict com action='search_files' para o executor local.
    """
    return {"action": "search_files", "args": {"pattern": pattern, "directory": directory}}


@tool
def move_file(source: str, destination: str) -> dict:
    """Move ou renomeia um arquivo / Move or rename a file.

    Use esta tool quando o usuário pedir para mover, renomear ou copiar
    um arquivo de um caminho para outro.

    Args:
        source: Caminho atual do arquivo (origem).
        destination: Caminho de destino do arquivo.

    Returns:
        Payload dict com action='move_file' para o executor local.
    """
    return {"action": "move_file", "args": {"source": source, "destination": destination}}


@tool
def delete_file(file_path: str) -> dict:
    """Deleta um arquivo permanentemente / Permanently delete a file.

    ATENÇÃO: Operação destrutiva — requer confirmação do usuário antes de executar.
    Use esta tool apenas quando o usuário confirmar explicitamente a exclusão.

    Args:
        file_path: Caminho absoluto ou relativo do arquivo a deletar.

    Returns:
        Payload dict com action='delete_file' e requires_confirmation=True.
    """
    return {
        "action": "delete_file",
        "args": {"path": file_path},
        "requires_confirmation": True,
    }
