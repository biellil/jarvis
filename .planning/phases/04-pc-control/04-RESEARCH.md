# Phase 4: PC Control - Research

**Researched:** 2026-04-05
**Domain:** LangChain tool calling, Linux subprocess control, SQLite audit logging
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Escopo de plataforma — Linux only (executor)**
O executor local que roda os payloads implementa apenas Linux. Windows e macOS ficam para depois. As `@tool` functions em si são OS-agnósticas — recebem/retornam dicts, não executam subprocess.

**D-02: Tools retornam payloads, não executam**
As `@tool` functions retornam um dict estruturado. O executor local (`__main__.py` no MVP, cliente UI no futuro) é quem chama subprocess/psutil/pactl.

```python
# Padrão correto:
@tool
def open_app(app_name: str) -> dict:
    """Abre um aplicativo pelo nome."""
    return {"action": "open_app", "args": {"app": app_name}}

# Executor local interpreta e executa:
# {"action": "open_app", "args": {"app": "firefox"}} → subprocess.run(["firefox"])
```

O `__main__.py` precisa de um `ActionExecutor` que mapeia payloads para chamadas de sistema Linux.

**D-03: Confirmação de ações destrutivas — via mensagem natural**
JARVIS pergunta ao usuário em linguagem natural ("Vou deletar X. Pode prosseguir?") e aguarda resposta afirmativa antes de executar. Ações destrutivas que requerem confirmação:
- Deletar arquivo (`os.remove`, `shutil.rmtree`)
- Matar processo (`psutil.kill()`, `psutil.terminate()`)

Mover arquivos e fechar apps **não** requerem confirmação.

**D-04: Log auditável — tabela dedicada `tool_calls`**
Nova tabela SQLite separada da conversa. Schema mínimo:
```sql
CREATE TABLE tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    params_json TEXT,
    outcome TEXT,  -- 'success' | 'error' | 'cancelled'
    error TEXT
);
```
Toda chamada de tool (bem-sucedida, com erro ou cancelada pelo usuário) é registrada.

### Claude's Discretion

- Estrutura do `ActionExecutor` (pode ser dict de handlers, switch, ou classe)
- Implementação Linux de `open_app` (via `subprocess.run`, `xdg-open`, ou `psutil`)
- Implementação Linux de file operations (`pathlib`, `shutil`)
- Implementação Linux de system control — volume via `pactl`, brilho via `brightnessctl`
- Como o `ActionExecutor` aguarda confirmação para ações destrutivas
- Estrutura de módulos: `src/jarvis/tools/` para @tools, `src/jarvis/executor/` para ActionExecutor

### Deferred Ideas (OUT OF SCOPE)

- Windows backend (pywin32) — pós-MVP
- macOS backend (pyobjc) — pós-MVP
- Cliente UI/UX real (substitui o executor local do `__main__.py`) — milestone futuro
- Windows/macOS no ActionExecutor — pós-MVP
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOOL-01 | Usuário pode pedir ao JARVIS para abrir, mover, buscar e listar arquivos por linguagem natural | @tool functions: `list_files`, `search_files`, `move_file`, `delete_file`; executor uses pathlib + shutil + glob |
| TOOL-02 | Usuário pode pedir ao JARVIS para abrir e fechar aplicativos por nome | @tool functions: `open_app`, `close_app`; executor uses xdg-open (open) + psutil (close) |
| TOOL-03 | Usuário pode pedir ao JARVIS para ajustar volume, brilho e ver processos ativos | @tool functions: `set_volume`, `set_brightness`, `list_processes`; executor uses pactl, brightnessctl, psutil |
| TOOL-04 | Ferramentas destrutivas (deletar arquivo, fechar processo) exigem confirmação explícita antes de executar | Confirmed pattern: tool returns payload with `requires_confirmation: True`; ActionExecutor prompts user via `input()` offloaded to `asyncio.to_thread` |
| TOOL-05 | Toda chamada de ferramenta é registrada em log auditável no SQLite | `tool_calls` table in existing MemoryStore SQLite file; `ToolLogger` class following MemoryStore error-handling patterns |
</phase_requirements>

---

## Summary

Phase 4 adds PC control capabilities to JARVIS by implementing `@tool`-decorated functions that return structured dict payloads (not execute directly), plus a Linux `ActionExecutor` that interprets those payloads and calls the appropriate system APIs. This split keeps the LangChain tools OS-agnostic while the executor is Linux-specific, fulfilling D-01 and D-02.

The LangChain 1.x `@tool` decorator (verified: `langchain-core 1.2.24`) generates a Pydantic schema from function signature and docstring automatically. Tools are bound to the LLM via `llm.bind_tools([tool1, tool2, ...])`. During streaming, `AIMessageChunk` accumulates `tool_call_chunks` across multiple chunks. When tool calls are detected, the session must invoke the tool, run the ActionExecutor, and add a `ToolMessage` back to the conversation history before continuing.

The existing codebase provides a strong foundation: `MemoryStore` patterns for SQLite operations (error-handling, schema migration via `executescript`), `AbstractPlatform` ABC ready for new methods, and `ChatSession.send()` which needs to grow tool-calling awareness. `psutil 5.9.8` is installed. `xdg-open` is available at `/usr/bin/xdg-open`. `pactl` and `brightnessctl` are NOT installed in this environment but will be available on real Linux desktops — the executor must handle `FileNotFoundError` gracefully.

**Primary recommendation:** Implement tools in `src/jarvis/tools/` as pure payload-returning `@tool` functions; implement `ActionExecutor` in `src/jarvis/executor/` as a class with a dispatch dict; extend `ChatSession.send()` to handle tool calls in the streaming loop using the established `ToolMessage` pattern; add `ToolLogger` as a thin wrapper over the `tool_calls` SQLite table following `MemoryStore` error-handling conventions.

---

## Standard Stack

### Core (already in pyproject.toml)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| langchain-core | 1.2.24 | `@tool` decorator, `BaseTool`, `ToolMessage` | Verified installed; `tool()` function generates Pydantic schema from annotations |
| langchain | 1.2.14 | LangChain integration layer | Already in project |
| pydantic | 2.12.5 | Tool input schema validation (auto-generated by `@tool`) | Required by langchain-core 1.x |
| psutil | 5.9.8 | Process listing, process termination | Installed; cross-platform process API |
| pathlib (stdlib) | 3.10+ | File listing, search, move, delete | No install needed; `Path.glob()`, `Path.rename()`, `Path.unlink()` |
| shutil (stdlib) | 3.10+ | Recursive directory operations | `shutil.rmtree()`, `shutil.move()` |
| subprocess (stdlib) | 3.10+ | Launching applications | `subprocess.run(["xdg-open", app])` or `subprocess.Popen([app])` |
| sqlite3 (stdlib) | 3.10+ | `tool_calls` audit log | Same DB file as MemoryStore; no new dependency |

### Supporting (need to add to pyproject.toml)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| psutil | 6.x (current: 5.9.8 installed) | Process listing and termination | Add to `pyproject.toml` — currently installed but not declared as dependency |

### System Tools (Linux, not Python packages)

| Tool | Install | Purpose | Fallback |
|------|---------|---------|---------|
| `xdg-open` | Pre-installed on most desktops | Open app/file with default handler | `subprocess.Popen([app_name])` directly |
| `pactl` | `apt install pulseaudio-utils` | Volume control via PulseAudio/PipeWire | `amixer` or `wpctl` (PipeWire) |
| `brightnessctl` | `apt install brightnessctl` | Brightness via sysfs | Write directly to `/sys/class/backlight/*/brightness` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `xdg-open` for app launch | `subprocess.Popen([app_name])` directly | Direct Popen works for CLI apps but not GUI apps with XDG mime-type associations; use `xdg-open` for files, `Popen` for known executables |
| `pactl` for volume | `wpctl` (PipeWire), `amixer` | `pactl` works with both PulseAudio and PipeWire (via compatibility layer); most common on Ubuntu/Debian |
| Class-based `ActionExecutor` | Dict of handler functions | Class allows `__init__` to inject dependencies (db logger, console); easier to test with mock injection |

**Installation (psutil declaration):**
```bash
# Add to pyproject.toml dependencies, no new pip install needed (already installed)
"psutil>=5.9"
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/jarvis/
├── tools/               # @tool-decorated functions (OS-agnostic, return payloads)
│   ├── __init__.py      # exports ALL_TOOLS list
│   ├── files.py         # list_files, search_files, move_file, delete_file
│   ├── apps.py          # open_app, close_app
│   └── system.py        # set_volume, set_brightness, list_processes
├── executor/            # Linux ActionExecutor (interprets payloads, runs subprocess/psutil)
│   ├── __init__.py      # exports ActionExecutor
│   ├── base.py          # ActionExecutor class with dispatch table
│   └── linux.py         # Linux-specific handler implementations
├── memory/
│   └── store.py         # ADD: tool_calls table to CREATE_SQL + ToolLogger class
└── core/
    └── session.py       # EXTEND: tool-calling loop in send()
```

### Pattern 1: @tool Decorator — Payload Return

**What:** `@tool`-decorated function with typed parameters returns a dict payload. The LLM sees the function name, docstring (as description), and Pydantic schema (from type annotations) — never executes the function itself.

**When to use:** All PC control tools in `src/jarvis/tools/`.

**Example:**
```python
# Source: verified with langchain-core 1.2.24 (local test 2026-04-05)
from langchain_core.tools import tool

@tool
def open_app(app_name: str) -> dict:
    """Abre um aplicativo no sistema pelo nome.
    
    Use este tool quando o usuário pedir para abrir um programa ou aplicativo.
    Exemplos: 'abra o firefox', 'inicie o terminal', 'abra o gedit'.
    """
    return {"action": "open_app", "args": {"app": app_name}}

@tool
def delete_file(file_path: str) -> dict:
    """Deleta um arquivo do sistema de arquivos.
    
    ATENÇÃO: Esta ação é destrutiva e irreversível.
    Use apenas quando o usuário confirmar explicitamente.
    """
    return {
        "action": "delete_file",
        "args": {"path": file_path},
        "requires_confirmation": True,
    }
```

### Pattern 2: Tools List Export

**What:** `src/jarvis/tools/__init__.py` exports `ALL_TOOLS` — a flat list of all `@tool` instances consumed by `session.py` and bound to the LLM.

**Example:**
```python
# src/jarvis/tools/__init__.py
from jarvis.tools.files import list_files, search_files, move_file, delete_file
from jarvis.tools.apps import open_app, close_app
from jarvis.tools.system import set_volume, set_brightness, list_processes

ALL_TOOLS = [
    list_files, search_files, move_file, delete_file,
    open_app, close_app,
    set_volume, set_brightness, list_processes,
]
```

### Pattern 3: LLM bind_tools in ChatSession

**What:** `ChatSession.__init__` receives the tools list and binds them to the LLM. The `llm_with_tools` is used in `send()` instead of `self.llm` when tools are available.

**When to use:** When `tools` parameter is provided to `ChatSession`.

**Example:**
```python
# Source: verified langchain-core 1.2.24
# In ChatSession.__init__:
def __init__(self, llm, db=None, vectors=None, context_window=None, tools=None):
    self.llm = llm
    self._tools = tools or []
    self._tool_map = {t.name: t for t in self._tools}
    # Bind tools to LLM for structured tool calling
    self._llm_with_tools = llm.bind_tools(self._tools) if self._tools else llm
    # ... rest of init
```

### Pattern 4: Streaming Tool Call Loop in send()

**What:** During `llm_with_tools.astream(messages)`, accumulated `AIMessageChunk` may contain `tool_calls`. When detected, the loop must: (1) invoke the tool to get the payload, (2) pass to `ActionExecutor`, (3) add `ToolMessage` to history, (4) continue streaming for the final response.

**Critical:** `AIMessageChunk` accumulates `tool_call_chunks` across streamed tokens. Do NOT process tool calls mid-stream — accumulate the full AI chunk first, then check `accumulated_chunk.tool_calls`.

**Example:**
```python
# Source: verified with langchain-core 1.2.24 (local test 2026-04-05)
from langchain_core.messages import ToolMessage
import json

# Inside ChatSession.send() — streaming section:
accumulated = None
async for chunk in self._llm_with_tools.astream(messages_to_send):
    if accumulated is None:
        accumulated = chunk
    else:
        accumulated = accumulated + chunk
    # Only print text content tokens (not tool call chunks)
    if chunk.content:
        print(chunk.content, end="", flush=True)

# After streaming: check for tool calls
if accumulated and accumulated.tool_calls:
    self.history.append(accumulated)  # AIMessage with tool_calls
    for tool_call in accumulated.tool_calls:
        tool = self._tool_map.get(tool_call["name"])
        if tool is None:
            continue
        # Invoke tool to get payload
        payload = tool.invoke(tool_call["args"])
        # Execute via ActionExecutor (handles confirmation, logging)
        result = await self._executor.execute(tool_call["name"], payload, tool_call["args"])
        # Add ToolMessage to history
        self.history.append(ToolMessage(
            content=json.dumps(result),
            tool_call_id=tool_call["id"],
            name=tool_call["name"],
        ))
    # Continue: send updated history for final response
    # (recursive or second astream call)
```

### Pattern 5: ActionExecutor — Dispatch Table

**What:** `ActionExecutor` maps action strings to handler methods. Constructor receives dependencies (console for confirmation prompt, `ToolLogger` for audit, db path for logging).

**Example:**
```python
# src/jarvis/executor/base.py
from typing import Any
from loguru import logger
import asyncio

class ActionExecutor:
    """Interprets tool payloads and executes Linux system actions."""

    def __init__(self, tool_logger, console=None):
        self._logger = tool_logger
        self._console = console
        self._handlers = {
            "open_app": self._open_app,
            "close_app": self._close_app,
            "list_files": self._list_files,
            "search_files": self._search_files,
            "move_file": self._move_file,
            "delete_file": self._delete_file,
            "set_volume": self._set_volume,
            "set_brightness": self._set_brightness,
            "list_processes": self._list_processes,
        }

    async def execute(self, tool_name: str, payload: dict, params: dict) -> dict:
        """Execute a tool payload. Returns result dict."""
        # D-03: Check for confirmation requirement
        if payload.get("requires_confirmation"):
            confirmed = await self._ask_confirmation(tool_name, params)
            if not confirmed:
                self._logger.log(tool_name, params, "cancelled")
                return {"status": "cancelled", "message": "Ação cancelada pelo usuário."}

        handler = self._handlers.get(payload["action"])
        if handler is None:
            self._logger.log(tool_name, params, "error", f"Unknown action: {payload['action']}")
            return {"status": "error", "message": f"Ação desconhecida: {payload['action']}"}

        try:
            result = await handler(payload["args"])
            self._logger.log(tool_name, params, "success")
            return result
        except Exception as e:
            logger.warning(f"ActionExecutor error ({tool_name}): {e}")
            self._logger.log(tool_name, params, "error", str(e))
            return {"status": "error", "message": str(e)}

    async def _ask_confirmation(self, tool_name: str, params: dict) -> bool:
        """Ask user for confirmation via console. Returns True if confirmed."""
        action_desc = self._describe_action(tool_name, params)
        if self._console:
            self._console.print(f"\n[bold yellow][confirmacao]: {action_desc} Confirma? (s/n)[/bold yellow]")
        # Offload blocking input() per ARCH-02
        response = await asyncio.to_thread(input, "")
        return response.strip().lower() in ("s", "sim", "y", "yes")
```

### Pattern 6: ToolLogger — SQLite Audit

**What:** Thin class following `MemoryStore` error-handling convention (catch SQLite errors, log with loguru, never crash the session). Lives in `src/jarvis/memory/store.py` as a method addition, OR as separate `ToolLogger` class sharing the same DB connection.

**Recommendation:** Add `ToolLogger` as a separate class in `src/jarvis/memory/store.py` (same file, shares module-level `_now()` helper). The `tool_calls` table is created in the same DB file via `MemoryStore.__init__` by extending `CREATE_SQL`.

**Example:**
```python
# Add to src/jarvis/memory/store.py

TOOL_CALLS_SQL = """
CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    params_json TEXT,
    outcome TEXT CHECK(outcome IN ('success', 'error', 'cancelled')),
    error TEXT
);
"""

class ToolLogger:
    """Audit log for tool calls. Uses same SQLite DB as MemoryStore."""

    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.executescript(TOOL_CALLS_SQL)

    def log(self, tool_name: str, params: dict, outcome: str, error: str = None) -> None:
        """Log a tool call. Never raises — logs errors with loguru."""
        try:
            self._conn.execute(
                "INSERT INTO tool_calls (timestamp, tool_name, params_json, outcome, error) VALUES (?, ?, ?, ?, ?)",
                (_now(), tool_name, json.dumps(params), outcome, error),
            )
            self._conn.commit()
        except sqlite3.Error as exc:
            logger.warning(f"ToolLogger.log failed ({tool_name}): {exc}")

    def close(self) -> None:
        try:
            self._conn.close()
        except sqlite3.Error as exc:
            logger.warning(f"ToolLogger.close failed: {exc}")
```

### Anti-Patterns to Avoid

- **Executing subprocess inside `@tool` function:** D-02 forbids this. Tools must return payloads only. The `@tool` function may be called on the server side without access to the local OS.
- **Mutating `self.history` mid-stream:** Current session.py pattern is to accumulate the full AIMessageChunk before appending to history. Adding a partial AIMessage before all tool_calls are resolved breaks the conversation graph.
- **Using `input()` directly in async code for confirmation:** Must use `asyncio.to_thread(input, "")` per ARCH-02 (no blocking in async loop).
- **Opening a new sqlite3 connection per tool call:** `ToolLogger` should hold one persistent connection, same pattern as `MemoryStore`.
- **Hardcoding `pactl` or `brightnessctl` paths:** Use `subprocess.run([cmd, ...], check=False)` with `FileNotFoundError` catch and informative error message.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM tool schema generation | Custom JSON schema builder | `@tool` decorator with type hints | `@tool` auto-generates Pydantic schema from type annotations and docstring — verified working with `langchain-core 1.2.24` |
| Process listing | Loop over `/proc/` | `psutil.process_iter(['pid', 'name', 'status'])` | psutil handles edge cases (zombie processes, permission errors), cross-platform |
| Tool input validation | `if not isinstance(x, str)` checks | Pydantic schema from `@tool` | LangChain validates tool inputs against the generated schema before invoking |
| File glob patterns | Custom recursive walk | `pathlib.Path.glob()` and `Path.rglob()` | stdlib; handles symlinks, permissions correctly |
| SQLite error handling for audit | Per-call try/except | Follow `MemoryStore` pattern | Already proven: catch `sqlite3.Error`, log with `logger.warning()`, never re-raise |

**Key insight:** The `@tool` decorator does 80% of the work — schema generation, input validation, integration with LangChain's tool-calling protocol. The only custom logic needed is the payload dict construction inside the function body.

---

## Runtime State Inventory

> Not applicable — this is a greenfield feature addition phase, not a rename/refactor/migration phase. No runtime state to migrate.

---

## Common Pitfalls

### Pitfall 1: Tool Call Chunks Not Fully Accumulated Before Processing
**What goes wrong:** Processing `tool_calls` on the first chunk that contains a tool call chunk, before all chunks are received — results in empty `args` dict.
**Why it happens:** `tool_call_chunks` are streamed across multiple `AIMessageChunk` objects. The `args` JSON is sent piecemeal.
**How to avoid:** Accumulate ALL chunks with `accumulated = chunk1 + chunk2 + ...` (AIMessageChunk supports `+` operator). Only process `accumulated.tool_calls` after the stream loop ends.
**Warning signs:** Tool invocations receiving empty or incomplete `args` dicts.

### Pitfall 2: Missing ToolMessage After Tool Execution
**What goes wrong:** After invoking a tool, the LLM doesn't know the result. The conversation fails or the LLM hallucinates the outcome.
**Why it happens:** LangChain requires a `ToolMessage` in the conversation history for every `tool_call` in the `AIMessage`. Missing `ToolMessage` causes the model to produce an error or loop.
**How to avoid:** For every entry in `accumulated.tool_calls`, add a corresponding `ToolMessage(content=..., tool_call_id=tc["id"], name=tc["name"])` to `self.history` before the second LLM call.
**Warning signs:** LLM response after tool call contains "I don't know the result" or ignores tool output.

### Pitfall 3: `pactl`/`brightnessctl` Not Installed
**What goes wrong:** `subprocess.run(["pactl", ...])` raises `FileNotFoundError` on machines without PulseAudio utils.
**Why it happens:** `pactl` and `brightnessctl` are NOT present in this environment (verified 2026-04-05). They are desktop tools not installed by default in minimal environments.
**How to avoid:** Wrap every subprocess call in `try/except FileNotFoundError` in the ActionExecutor. Return `{"status": "error", "message": "pactl não encontrado. Instale com: apt install pulseaudio-utils"}`. Log with `logger.warning()`.
**Warning signs:** Tests failing with `FileNotFoundError` if tests try to call system tools directly.

### Pitfall 4: Blocking `input()` in Async Confirmation
**What goes wrong:** `input("Confirma? (s/n): ")` inside an `async` method blocks the entire event loop.
**Why it happens:** `input()` is a blocking call. Inside `asyncio`, it prevents other coroutines from running.
**How to avoid:** Use `await asyncio.to_thread(input, "Confirma? (s/n): ")` — established pattern already used in `__main__.py` for PTT.
**Warning signs:** Application hangs when a destructive tool is requested.

### Pitfall 5: psutil Not Declared in pyproject.toml
**What goes wrong:** `psutil` is installed in the current venv but not declared as a project dependency. Running in a fresh venv will fail with `ModuleNotFoundError`.
**Why it happens:** `psutil` was installed as a transitive dependency but never added to `pyproject.toml`.
**How to avoid:** Add `"psutil>=5.9"` to `[project.dependencies]` in `pyproject.toml`.

### Pitfall 6: Tool Not in `_tool_map` When LLM Calls It
**What goes wrong:** LLM calls a tool by name that isn't in the session's `_tool_map`, causing a `KeyError` or silent failure.
**Why it happens:** `bind_tools(tools)` tells the LLM the available tools, but the session's `_tool_map` must be kept in sync with the bound tools list.
**How to avoid:** Build `_tool_map = {t.name: t for t in self._tools}` from the same `tools` list passed to `bind_tools`. They are always in sync.

### Pitfall 7: Session `send()` Doesn't Re-stream After Tool Execution
**What goes wrong:** After tools are executed and `ToolMessage` is added, the session returns an empty or intermediate response to the user.
**Why it happens:** The first streaming pass ends with the LLM's tool call decision, not a final text response. A second LLM call is needed to produce the user-facing response.
**How to avoid:** After adding `ToolMessage`(s) to history, make a second `llm_with_tools.astream(self.history)` call. The LLM will then produce the final natural-language response.

---

## Code Examples

Verified patterns from local testing and official LangChain docs.

### Tool with Confirmation Flag
```python
# Source: verified with langchain-core 1.2.24 (2026-04-05)
from langchain_core.tools import tool

@tool
def delete_file(file_path: str) -> dict:
    """Deleta permanentemente um arquivo do disco.
    
    ATENÇÃO: Esta ação é irreversível. Requer confirmação do usuário.
    """
    return {
        "action": "delete_file",
        "args": {"path": file_path},
        "requires_confirmation": True,
    }
```

### Binding Tools to LLM
```python
# Source: langchain-core 1.2.24 — bind_tools() signature confirmed
from jarvis.tools import ALL_TOOLS

# In ChatSession.__init__:
self._llm_with_tools = llm.bind_tools(ALL_TOOLS) if ALL_TOOLS else llm
self._tool_map = {t.name: t for t in ALL_TOOLS}
```

### AIMessageChunk Accumulation Pattern
```python
# Source: verified locally 2026-04-05 — AIMessageChunk supports + operator
accumulated = None
async for chunk in self._llm_with_tools.astream(messages):
    if accumulated is None:
        accumulated = chunk
    else:
        accumulated = accumulated + chunk
    if chunk.content:
        print(chunk.content, end="", flush=True)
# accumulated.tool_calls is fully populated after loop
```

### Linux open_app Handler
```python
# Source: subprocess + xdg-open — standard Linux approach
import subprocess

async def _open_app(self, args: dict) -> dict:
    app = args["app"]
    try:
        # Try xdg-open first for GUI apps and files
        subprocess.Popen(["xdg-open", app], 
                        stdout=subprocess.DEVNULL, 
                        stderr=subprocess.DEVNULL)
        return {"status": "success", "message": f"Abrindo {app}..."}
    except FileNotFoundError:
        # Fall back to direct execution for CLI apps
        try:
            subprocess.Popen([app], 
                           stdout=subprocess.DEVNULL, 
                           stderr=subprocess.DEVNULL)
            return {"status": "success", "message": f"Iniciando {app}..."}
        except FileNotFoundError:
            return {"status": "error", "message": f"Aplicativo não encontrado: {app}"}
```

### Linux list_processes Handler
```python
# Source: psutil 5.9.8 — process_iter API
import psutil

async def _list_processes(self, args: dict) -> dict:
    try:
        procs = [
            {"pid": p.info["pid"], "name": p.info["name"], "status": p.info["status"]}
            for p in psutil.process_iter(["pid", "name", "status"])
            if p.info["name"]  # skip nameless kernel threads
        ]
        return {"status": "success", "processes": procs[:50]}  # cap at 50
    except psutil.Error as e:
        return {"status": "error", "message": str(e)}
```

### ToolLogger.log() Pattern
```python
# Source: modeled on MemoryStore.save_messages() — same error-handling convention
import json, sqlite3
from loguru import logger

def log(self, tool_name: str, params: dict, outcome: str, error: str = None) -> None:
    try:
        self._conn.execute(
            "INSERT INTO tool_calls (timestamp, tool_name, params_json, outcome, error) VALUES (?, ?, ?, ?, ?)",
            (_now(), tool_name, json.dumps(params), outcome, error),
        )
        self._conn.commit()
    except sqlite3.Error as exc:
        logger.warning(f"ToolLogger.log failed ({tool_name}): {exc}")
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `AgentExecutor` + `initialize_agent()` | `create_react_agent` + LangGraph OR `bind_tools` + manual tool loop | LangChain 1.0 (2024) | `AgentExecutor` removed; JARVIS uses `bind_tools` in ChatSession (simpler for this use case) |
| `langchain.tools.Tool` (string-based) | `@tool` decorator with type annotations | LangChain 0.2+ | Auto-generated Pydantic schema; type-safe args |
| `StructuredTool.from_function()` | `@tool` decorator | LangChain 0.2+ | Decorator is simpler and equivalent |

**Deprecated/outdated:**
- `AgentExecutor`: Removed in LangChain 1.0. Not used in this project.
- `initialize_agent()`: Removed in LangChain 1.0. Not used in this project.
- `langchain.tools.Tool(name=..., func=..., description=...)`: Still works but `@tool` is preferred in LangChain 1.x.

---

## Open Questions

1. **How does `ChatSession.send()` handle the two-pass streaming (tool call → tool result → final response)?**
   - What we know: First `astream()` ends with `AIMessage.tool_calls`; second `astream()` produces final text.
   - What's unclear: Should the second pass print tokens immediately (while user sees the first pass output)? Or should the final response be the only printed output?
   - Recommendation: Print only the final response tokens. The first pass produces no visible text (tool_call chunks have no `.content`). This is transparent to the user.

2. **Should `ToolLogger` share the `MemoryStore` SQLite connection or open its own?**
   - What we know: MemoryStore already holds an open sqlite3 connection. `tool_calls` table needs to live in the same file.
   - What's unclear: Whether sharing a connection across objects is safe in concurrent scenarios.
   - Recommendation: `ToolLogger` opens its own connection to the same DB path (same pattern as MemoryStore). SQLite WAL mode handles multiple connections to the same file safely. Pass `settings.sqlite_path` to both.

3. **Tool calling capability check — what if the active LLM doesn't support tool calling?**
   - What we know: `detect_capabilities()` already checks `tool_calling` in Phase 1 (`llm/capabilities.py`).
   - What's unclear: Whether `session.py` should silently skip tool binding when `caps.tool_calling is False`.
   - Recommendation: Check `caps.tool_calling` before calling `bind_tools`. If False, instantiate `ChatSession` without tools and let JARVIS respond via natural language only. Log a warning.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.10+ | Runtime | ✓ | system Python | — |
| langchain-core | @tool decorator, ToolMessage | ✓ | 1.2.24 | — |
| psutil | list_processes, close_app (kill) | ✓ | 5.9.8 | — |
| pathlib (stdlib) | file operations | ✓ | stdlib | — |
| shutil (stdlib) | move, rmtree | ✓ | stdlib | — |
| subprocess (stdlib) | open_app | ✓ | stdlib | — |
| xdg-open | open_app (GUI/files) | ✓ | /usr/bin/xdg-open | `subprocess.Popen([app_name])` directly |
| sqlite3 (stdlib) | tool_calls audit log | ✓ | stdlib | — |
| pactl | set_volume | ✗ | — | `amixer` fallback; handle FileNotFoundError with user message |
| brightnessctl | set_brightness | ✗ | — | Write to `/sys/class/backlight/*/brightness`; handle FileNotFoundError |

**Missing dependencies with no fallback:**
- None that block core functionality.

**Missing dependencies with fallback:**
- `pactl`: ActionExecutor must catch `FileNotFoundError` and return `{"status": "error", "message": "pactl não encontrado..."}`. Tests should mock subprocess calls.
- `brightnessctl`: Same — catch `FileNotFoundError`, fall back to direct sysfs write if available.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` — `[tool.pytest.ini_options]` with `asyncio_mode = "auto"` |
| Quick run command | `PYTHONPATH=src pytest tests/test_tools.py tests/test_executor.py tests/test_tool_logger.py -x` |
| Full suite command | `PYTHONPATH=src pytest tests/ -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-01 | list_files, search_files, move_file, delete_file return correct payloads | unit | `PYTHONPATH=src pytest tests/test_tools.py::test_file_tools -x` | ❌ Wave 0 |
| TOOL-02 | open_app, close_app return correct payloads | unit | `PYTHONPATH=src pytest tests/test_tools.py::test_app_tools -x` | ❌ Wave 0 |
| TOOL-03 | set_volume, set_brightness, list_processes return correct payloads | unit | `PYTHONPATH=src pytest tests/test_tools.py::test_system_tools -x` | ❌ Wave 0 |
| TOOL-04 | delete_file and kill_process payloads include `requires_confirmation: True`; ActionExecutor cancels on "n" | unit | `PYTHONPATH=src pytest tests/test_executor.py::test_confirmation -x` | ❌ Wave 0 |
| TOOL-04 | ActionExecutor executes on "s"/"sim"/"y" confirmation | unit | `PYTHONPATH=src pytest tests/test_executor.py::test_confirmation_accepted -x` | ❌ Wave 0 |
| TOOL-05 | ToolLogger.log() inserts row into tool_calls table | unit | `PYTHONPATH=src pytest tests/test_tool_logger.py -x` | ❌ Wave 0 |
| TOOL-05 | outcome values are 'success', 'error', 'cancelled' | unit | `PYTHONPATH=src pytest tests/test_tool_logger.py::test_outcomes -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `PYTHONPATH=src pytest tests/test_tools.py tests/test_executor.py tests/test_tool_logger.py -x`
- **Per wave merge:** `PYTHONPATH=src pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_tools.py` — covers TOOL-01, TOOL-02, TOOL-03 (payload return tests, no subprocess execution)
- [ ] `tests/test_executor.py` — covers TOOL-04 (confirmation logic with mocked subprocess/psutil)
- [ ] `tests/test_tool_logger.py` — covers TOOL-05 (SQLite audit log)

*(No framework changes needed — `pytest-asyncio` already configured with `asyncio_mode = "auto"`)*

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 4 |
|-----------|-------------------|
| **Multi-LLM**: All LLM calls via abstraction layer | `bind_tools()` must be called on `BaseChatModel` instance, not provider-specific class |
| **Stack**: Python 3.10+ with LangChain/LangGraph | Use `@tool` from `langchain_core.tools`, not raw OpenAI function calling |
| **Privacidade**: Conversations never go to cloud without explicit config | Tool payloads (file paths, process names) must never be logged to cloud; only SQLite locally |
| **Multiplataforma**: OS-specific code isolated in platform modules | `ActionExecutor` Linux implementation goes in `executor/linux.py`; abstract interface in `executor/base.py` |
| **Sem UI obrigatória**: Works 100% in terminal | Confirmation prompt via terminal `input()` is correct; no GUI dialog |
| **Pydantic v2**: Required by langchain-core 1.x | `@tool` uses Pydantic v2 schema generation — do not use `pydantic.v1` |
| **loguru**: Structured logging | All errors in ActionExecutor and ToolLogger use `logger.warning()` not `print()` |
| **Token streaming**: `print(token, end='', flush=True)` | Second-pass streaming (after tool execution) follows same pattern |
| **CLAUDE.md: GSD Workflow**: No direct edits outside GSD | Research only; implementation via `/gsd:execute-phase` |

---

## Sources

### Primary (HIGH confidence)
- Local `langchain-core 1.2.24` installation — `@tool` decorator, `ToolMessage`, `AIMessageChunk` accumulation behavior (verified by running code)
- Local `psutil 5.9.8` installation — `process_iter()` API verified
- `src/jarvis/memory/store.py` (project codebase) — SQLite error-handling pattern for ToolLogger
- `src/jarvis/core/session.py` (project codebase) — ChatSession.send() streaming pattern to extend
- `src/jarvis/platform/base.py`, `linux.py` (project codebase) — AbstractPlatform extension points
- `pyproject.toml` (project codebase) — dependency versions, pytest configuration
- `tests/test_memory_store.py` (project codebase) — test patterns for ToolLogger tests

### Secondary (MEDIUM confidence)
- `xdg-open --version` system test — confirmed at `/usr/bin/xdg-open` (2026-04-05)
- `pactl` / `brightnessctl` absence — confirmed via `command -v` (2026-04-05); not installed in this env

### Tertiary (LOW confidence)
- None — all critical claims verified via local execution or codebase inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified installed and tested locally
- Architecture: HIGH — @tool patterns verified with working code; ChatSession extension pattern clear from reading source
- Pitfalls: HIGH — discovered by running actual code and reading codebase; not from training data alone

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable stack)
