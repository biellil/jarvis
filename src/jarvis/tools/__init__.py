"""JARVIS tools package — PC control @tool payload functions.

Exports ALL_TOOLS list for binding to the LangChain LLM agent.

Per D-02: All tools return structured dict payloads, never execute system commands.
The local ActionExecutor is responsible for interpreting and running the payloads.
"""

from jarvis.tools.apps import close_app, open_app
from jarvis.tools.files import delete_file, list_files, move_file, search_files
from jarvis.tools.system import list_processes, set_brightness, set_volume

ALL_TOOLS = [
    list_files,
    search_files,
    move_file,
    delete_file,
    open_app,
    close_app,
    set_volume,
    set_brightness,
    list_processes,
]
