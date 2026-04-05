"""ActionExecutor — interprets tool payloads and dispatches to Linux handlers.

Per D-02: @tool functions return payloads; ActionExecutor executes them.
Per D-03: Destructive actions require user confirmation via asyncio.to_thread(input).
Per TOOL-05: Every execution is logged via ToolLogger.
"""

import asyncio
from typing import Callable, Optional

from loguru import logger

from jarvis.executor.linux import (
    handle_close_app,
    handle_delete_file,
    handle_list_files,
    handle_list_processes,
    handle_move_file,
    handle_open_app,
    handle_search_files,
    handle_set_brightness,
    handle_set_volume,
)
from jarvis.memory.store import ToolLogger


class ActionExecutor:
    """Dispatches tool payloads to Linux-specific handler functions.

    Usage:
        executor = ActionExecutor(tool_logger)
        result = await executor.execute("delete_file", payload, params)
    """

    def __init__(
        self,
        tool_logger: ToolLogger,
        confirm_callback: Optional[Callable] = None,
    ) -> None:
        """Initialize ActionExecutor.

        Args:
            tool_logger: ToolLogger instance for audit logging.
            confirm_callback: Optional async callable(tool_name, params) -> bool.
                              If None, uses _default_confirm() which prompts via stdin.
        """
        self._logger = tool_logger
        self._confirm = confirm_callback
        self._handlers = {
            "list_files": handle_list_files,
            "search_files": handle_search_files,
            "move_file": handle_move_file,
            "delete_file": handle_delete_file,
            "open_app": handle_open_app,
            "close_app": handle_close_app,
            "set_volume": handle_set_volume,
            "set_brightness": handle_set_brightness,
            "list_processes": handle_list_processes,
        }

    async def execute(self, tool_name: str, payload: dict, params: dict) -> dict:
        """Execute a tool payload.

        Args:
            tool_name: Logical name of the tool being executed (for logging).
            payload: Dict with 'action', 'args', and optionally 'requires_confirmation'.
            params: Original parameters passed to the tool (for logging).

        Returns:
            Result dict with at minimum a 'status' key ('success', 'error', or 'cancelled').
        """
        # D-03: prompt user before destructive actions
        if payload.get("requires_confirmation"):
            confirm_fn = self._confirm if self._confirm is not None else self._default_confirm
            confirmed = await confirm_fn(tool_name, params)
            if not confirmed:
                self._logger.log(tool_name, params, "cancelled")
                return {"status": "cancelled", "message": "Acao cancelada pelo usuario."}

        action = payload.get("action")
        handler = self._handlers.get(action)
        if handler is None:
            err = f"Acao desconhecida: {action}"
            self._logger.log(tool_name, params, "error", err)
            return {"status": "error", "message": err}

        try:
            result = handler(payload.get("args", {}))
            outcome = result.get("status", "success")
            self._logger.log(tool_name, params, outcome if outcome in ("success", "error") else "success")
            return result
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"ActionExecutor error ({tool_name}): {err_msg}")
            self._logger.log(tool_name, params, "error", err_msg)
            return {"status": "error", "message": err_msg}

    async def _default_confirm(self, tool_name: str, params: dict) -> bool:
        """Default confirmation prompt via stdin (ARCH-02 compliant via asyncio.to_thread)."""
        desc = f"{tool_name}: {params}"
        print(f"\n[confirmacao]: Vou executar {desc}. Confirma? (s/n)")
        response = await asyncio.to_thread(input, "")
        return response.strip().lower() in ("s", "sim", "y", "yes")
