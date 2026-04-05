# Phase 5: Advanced Features - Research

**Researched:** 2026-04-05
**Domain:** Vision pipeline (screenshot capture + LLM multimodal), LLM routing, hot-reload config
**Confidence:** HIGH (core patterns verified against codebase + official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Vision pipeline architecture**
The tool `analyze_screen` is a `@tool` LangChain that captures screenshot (via pyautogui in MVP CLI), converts to base64, and returns the data. `ChatSession.send()` detects the ToolMessage result and includes the image in the second call to the LLM (HumanMessage with content of type `image_url`).

**D-02: Screenshot capture in MVP CLI**
In the MVP CLI (without a separate UI client), `__main__.py` captures screenshots via `pyautogui.screenshot()`. When the UI/UX client arrives it replaces this capture — the API already accepts `image=` as an optional parameter in `ChatSession.send()`.

**D-03: Screen analysis invocation — dual**
Two paths, both supported:
1. **Natural language**: LLM detects intent ("what's on my screen?", "what error is that?") and calls `analyze_screen` as a @tool. `ChatSession.send()` already has the tool-calling loop (Phase 4) — works automatically.
2. **Explicit command `/screenshot`**: `__main__.py` intercepts input, captures screenshot with pyautogui, and injects image directly into `ChatSession.send(image=base64_str)` alongside user text. LLM receives image and responds without needing to call a @tool.

**D-04: Vision fallback chain (Claude's Discretion)**
1. Try OCR via pytesseract (extracts text from screenshot, passes as text to LLM)
2. If OCR not installed or fails, try cloud with vision (Anthropic or OpenAI per config)
3. If none available, inform user with clear message

Uses `detect_capabilities()` (already in `llm/capabilities.py`) to check `caps.vision` before trying to send image.

**D-05: Hot-reload model (Claude's Discretion)**
Swap model without restarting. `ChatSession` reads `settings.llm_model` dynamically at each `send()` instead of locking model at construction. `Settings` reloads from `.env` on demand. Implementation detail at planner's discretion.

### Claude's Discretion
- Structure of vision module (`src/jarvis/tools/vision.py` or similar)
- Exact format of ToolMessage with image (base64 data URL vs bytes)
- Polling interval for hot-reload if using watchdog
- Keyword detection logic for `/screenshot` vs natural language in __main__.py

### Deferred Ideas (OUT OF SCOPE)
- HTTP endpoint to receive images from external client (comes when the UI/UX client is built)
- Analysis of multiple sequential screenshots
- History of analyzed screenshots
- Windows/macOS screenshot capture (pyautogui supports but not tested in this project)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VISION-01 | User can ask JARVIS to capture and analyze what is on screen | `analyze_screen` @tool + `ChatSession.send(image=)` extension; pyautogui for capture; LangChain multimodal HumanMessage |
| VISION-02 | JARVIS uses OCR (pytesseract) to extract text from images when model lacks vision | pytesseract `image_to_string(PIL_image)` — requires `tesseract` binary install + `pytesseract` pip package |
| VISION-03 | JARVIS auto-fallback to cloud vision model when local model lacks vision support | `detect_capabilities()` already exists; fallback uses `create_llm()` with anthropic/openai provider per config |
| LLM-03 | JARVIS routes vision tasks to vision-capable models, simple tasks to faster local models without user intervention | `caps.vision` from `detect_capabilities()` drives routing; vision path vs text path in `ChatSession.send()` |
| LLM-04 | Model swap does not require JARVIS restart; config is hot-reloadable | `Settings()` re-instantiation per send(); `create_llm()` called dynamically; no LLM singleton in ChatSession |
</phase_requirements>

---

## Summary

Phase 5 adds two orthogonal capabilities to JARVIS: a vision pipeline (screenshot capture + multimodal LLM analysis with OCR fallback) and hot-reload model configuration. Both capabilities build directly on Phase 4 infrastructure — the tool-calling loop in `ChatSession.send()` already handles the first LLM call / ToolMessage / second LLM call cycle.

The vision pipeline requires extending `ChatSession.send()` to accept an optional `image` parameter (base64 string). When present, the HumanMessage is constructed with a multimodal `content` list instead of a plain string. The `analyze_screen` @tool captures the screenshot and returns the base64 data; the session loop intercepts the ToolMessage result and feeds it to the second LLM call as a multimodal message.

Hot-reload is simpler than it looks: `Settings` (pydantic-settings) does not support in-place reload, but re-instantiating `Settings()` on each `send()` call reads the current `.env` from disk. Combined with re-creating the LLM object via `create_llm()` when the model changes, this gives reload-on-next-message semantics without restarts or watchdog threads.

**Primary recommendation:** Extend `ChatSession.send(user_input, image=None)` for image injection; add `analyze_screen` @tool in `src/jarvis/tools/vision.py`; implement fallback chain in `ScreenAnalyzer` helper; hot-reload via per-send `Settings()` re-instantiation.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pyautogui | 0.9.54 | Screenshot capture (`pyautogui.screenshot()` returns PIL Image) | Already in CLAUDE.md approved stack; cross-platform |
| pillow | 10.x | PIL Image → base64 conversion | Already in CLAUDE.md approved stack; used by pyautogui |
| pytesseract | 0.3.13 | OCR fallback — `image_to_string(PIL_image)` | CLAUDE.md approved for VISION-02; wraps `tesseract` binary |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| base64 (stdlib) | — | Encode PIL Image bytes to base64 string | Always — no extra install needed |
| io (stdlib) | — | `BytesIO` buffer for PIL → bytes conversion | Always — part of image pipeline |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pytesseract | easyocr | easyocr has better accuracy on complex layouts but requires PyTorch (~1.5 GB); pytesseract is lightweight and already in CLAUDE.md |
| pyautogui.screenshot() | mss | mss is faster for repeated capture but not in CLAUDE.md; pyautogui is already the approved tool |

**Installation (new packages only — pyautogui and pillow already in pyproject.toml per CLAUDE.md):**
```bash
pip install pytesseract
# System dependency:
apt install tesseract-ocr          # Linux
brew install tesseract             # macOS
# Windows: install from https://github.com/UB-Mannheim/tesseract/wiki
```

**Version verification:**
```bash
pip show pytesseract   # 0.3.13 as of April 2026
tesseract --version    # 5.x recommended
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/jarvis/
├── tools/
│   ├── __init__.py         # Add analyze_screen to ALL_TOOLS
│   ├── vision.py           # NEW: analyze_screen @tool (capture + base64)
│   └── ...existing tools...
├── core/
│   ├── session.py          # EXTEND: send(user_input, image=None)
│   └── screen.py           # NEW: ScreenAnalyzer (fallback logic)
└── __main__.py             # EXTEND: /screenshot command + hot-reload
```

### Pattern 1: analyze_screen @tool — Payload Returns Image Data
**What:** The tool captures a screenshot and returns the image as base64. Unlike other PC control tools that return action payloads for the executor, this tool returns raw data because the image needs to flow to the LLM, not to the ActionExecutor.

**When to use:** Natural language path — "what's on my screen?", "what error is that?"

**Example:**
```python
# src/jarvis/tools/vision.py
import base64
from io import BytesIO
from langchain_core.tools import tool

@tool
def analyze_screen() -> dict:
    """Captures the current screen and returns it for visual analysis.

    Use this tool when the user asks about what is on their screen,
    wants to analyze an error message, or needs visual context.

    Returns:
        Dict with 'image_base64' key containing PNG screenshot as base64 string,
        plus 'action': 'analyze_screen' for routing.
    """
    import pyautogui
    screenshot = pyautogui.screenshot()  # PIL Image
    buf = BytesIO()
    screenshot.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return {"action": "analyze_screen", "image_base64": b64}
```

### Pattern 2: ChatSession.send() — Image Parameter Extension
**What:** Extend the existing `send()` signature with optional `image` parameter. When image is present, build multimodal HumanMessage. This covers the `/screenshot` explicit command path (D-03).

**When to use:** Explicit `/screenshot` command path — image is injected directly by `__main__.py`.

**Example:**
```python
# src/jarvis/core/session.py — signature change
async def send(self, user_input: str, image: str | None = None) -> str:
    ...
    # Step 3: Build HumanMessage — multimodal if image provided
    if image:
        human_msg = HumanMessage(content=[
            {"type": "text", "text": user_input},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image}"}},
        ])
    else:
        human_msg = HumanMessage(content=user_input)
```

**Note on LangChain image format (HIGH confidence — official docs):** LangChain 1.x supports both the newer `{"type": "image", "base64": ..., "mime_type": ...}` format and the OpenAI-compatible `{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}` format. The `image_url` format is more widely supported across `langchain-openai` and `langchain-anthropic` backends. Use `image_url` for maximum compatibility.

### Pattern 3: ToolMessage Vision Routing in ChatSession
**What:** After `analyze_screen` tool call, `ChatSession` detects the `action: analyze_screen` key in the payload and routes the image into the second LLM call as multimodal content instead of sending it to the ActionExecutor.

**When to use:** Natural language path — tool-calling loop already in session.py from Phase 4.

```python
# Inside the tool-call loop in ChatSession.send()
for tool_call in accumulated.tool_calls:
    tool = self._tool_map.get(tool_call["name"])
    payload = tool.invoke(tool_call["args"])

    if payload.get("action") == "analyze_screen":
        # Vision path: don't dispatch to executor, hold image for second LLM call
        image_b64 = payload.get("image_base64", "")
        result_for_history = {"status": "captured", "message": "Screenshot captured."}
    elif self._executor:
        result_for_history = await self._executor.execute(...)
    else:
        result_for_history = payload

    self.history.append(ToolMessage(
        content=json.dumps(result_for_history, ensure_ascii=False),
        tool_call_id=tool_call["id"],
        name=tool_call["name"],
    ))

# Second LLM call — inject image if we captured one
if image_b64:
    # Append multimodal HumanMessage after the ToolMessage
    self.history.append(HumanMessage(content=[
        {"type": "text", "text": "Analise esta imagem e responda."},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
    ]))
```

### Pattern 4: ScreenAnalyzer — Fallback Chain (D-04)
**What:** Standalone helper that encapsulates the vision fallback logic. Keeps `session.py` clean.

```python
# src/jarvis/core/screen.py
class ScreenAnalyzer:
    """Handles vision routing and OCR fallback."""

    def get_image_context(self, image_b64: str, caps) -> tuple[str | None, str | None]:
        """Return (image_b64_for_llm, ocr_text_fallback).

        If caps.vision: return (image_b64, None) — send to LLM with vision
        Else try pytesseract OCR: return (None, extracted_text)
        Else return (None, None) — signal to route to cloud vision
        """
        if caps.vision:
            return image_b64, None
        try:
            import pytesseract
            from PIL import Image
            from io import BytesIO
            import base64
            img_bytes = base64.b64decode(image_b64)
            img = Image.open(BytesIO(img_bytes))
            text = pytesseract.image_to_string(img, lang="por+eng")
            return None, text if text.strip() else None
        except Exception:
            return None, None
```

### Pattern 5: Hot-Reload via Per-Send Settings Re-instantiation (D-05)
**What:** `Settings()` in pydantic-settings reads `.env` fresh on each instantiation. Current code stores the singleton at module level (`settings = Settings()` in config.py). For hot-reload, `ChatSession.send()` calls `Settings()` at the top to get current config, then checks if `llm_model` changed. If changed, rebuilds the LLM.

**When to use:** LLM-04 requirement — model swap without restart.

```python
# src/jarvis/core/session.py
async def send(self, user_input: str, image: str | None = None) -> str:
    # LLM-04: Hot-reload — check if model has changed since last send
    from jarvis.config import Settings
    current_settings = Settings()  # re-reads .env from disk
    current_model = current_settings.lm_studio_model or current_settings.llm_model
    if current_model != self._current_model_id:
        from jarvis.llm.factory import create_llm
        self.llm = create_llm(current_settings)
        self._llm_with_tools = self.llm.bind_tools(self._tools) if self._tools else self.llm
        self._current_model_id = current_model
    ...
```

**Performance note:** `Settings()` re-instantiation reads a small `.env` file from disk. For a conversational assistant (1 message/few seconds), this overhead is negligible.

### Pattern 6: /screenshot Command in __main__.py
**What:** Intercept `/screenshot` prefix before the regular conversation path. Captures screenshot, converts to base64, calls `session.send(text, image=b64)`.

```python
# src/jarvis/__main__.py — inside the while True loop
if user_input.strip().lower().startswith("/screenshot"):
    query = user_input.strip()[len("/screenshot"):].strip()
    query = query or "O que está na tela?"
    console.print("[dim][visao]: capturando tela...[/dim]")
    import pyautogui, base64
    from io import BytesIO
    shot = pyautogui.screenshot()
    buf = BytesIO()
    shot.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    console.print("[bold cyan]JARVIS:[/bold cyan] ", end="")
    response = await session.send(query, image=b64)
    if tts and response:
        await tts.speak(response)
    continue
```

### Anti-Patterns to Avoid
- **Sending image to ActionExecutor:** The executor handles OS actions, not LLM vision calls. Images must bypass the executor and flow directly to the second LLM call.
- **Storing full base64 in SQLite conversation history:** Base64 PNGs are large (~1–3 MB). Store a reference like `"[screenshot captured]"` in history instead of the raw bytes.
- **Hardcoding vision capability:** Always use `detect_capabilities()` — never assume local model has vision.
- **Blocking screenshot in async loop:** `pyautogui.screenshot()` is synchronous. Wrap in `asyncio.to_thread()` to maintain ARCH-02 compliance.
- **Assuming pytesseract is always installed:** Wrap all pytesseract calls in `try/except ImportError` — it's an optional dependency.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Screenshot capture | Custom X11/D-Bus screen grab | `pyautogui.screenshot()` | Cross-platform, returns PIL Image, already in CLAUDE.md stack |
| Image → bytes → base64 | Manual format conversion | `PIL.Image.save(BytesIO, "PNG")` + `base64.b64encode()` | stdlib + Pillow — no extra deps |
| OCR from image | Custom text extraction | `pytesseract.image_to_string(pil_img)` | Wraps Tesseract 5.x — battle-tested, handles dozens of languages |
| Settings re-read | File watcher / inotify polling | `Settings()` re-instantiation | pydantic-settings reads .env on init — no extra infra needed |
| Model capability detection | LLM startup probe calls | `detect_capabilities(base_url, model_id)` (existing in capabilities.py) | Already implemented in Phase 1; heuristic-only, no LLM call |

**Key insight:** All the building blocks already exist in the codebase. Phase 5 is primarily wiring and extending, not building new infrastructure.

---

## Common Pitfalls

### Pitfall 1: LM Studio OpenAI API Rejects Certain Base64 Image Formats
**What goes wrong:** LM Studio's `/v1/chat/completions` endpoint rejects `data:image/webp;base64,...` with error `'url' field must be a base64 encoded image`. WebP and some other formats trigger validation errors even though the data is valid base64.
**Why it happens:** LM Studio's API handler has stricter validation than the OpenAI API spec for the `image_url` field (confirmed bug in lmstudio-bug-tracker #1027).
**How to avoid:** Always save screenshots as PNG (`screenshot.save(buf, format="PNG")`) and prefix with `data:image/png;base64,`. PNG is reliably accepted by LM Studio, OpenAI, and Anthropic.
**Warning signs:** `400 Bad Request` or `url field must be a base64 encoded image` errors from LM Studio.

### Pitfall 2: Image in Tool Call vs Image in Second LLM Call
**What goes wrong:** Returning image bytes in the `ToolMessage.content` and relying on the LLM to "see" it there. ToolMessages are for tool results (text), not for injecting multimodal content.
**Why it happens:** Misunderstanding the Phase 4 tool-calling flow. The ToolMessage goes into history but the LLM's multimodal perception requires the image in a `HumanMessage` content block.
**How to avoid:** Per D-01 — the `analyze_screen` ToolMessage contains confirmation text only (`{"status": "captured"}`). The actual image is injected as a multimodal `HumanMessage` (or appended to the second LLM call's message list) separately.
**Warning signs:** LLM responds "I cannot see any image" even though capture succeeded.

### Pitfall 3: Blocking Screenshot Capture on Async Loop
**What goes wrong:** `pyautogui.screenshot()` is a synchronous call that blocks the event loop for ~200–500ms during image capture and compression.
**Why it happens:** ARCH-02 requires async pipeline without blocking the main thread.
**How to avoid:** Wrap in `asyncio.to_thread(pyautogui.screenshot)` in `analyze_screen` tool and in the `/screenshot` command handler.
**Warning signs:** Conversation loop hangs briefly on every screenshot request.

### Pitfall 4: pytesseract Import at Module Level
**What goes wrong:** `import pytesseract` at the top of vision.py causes ImportError at startup if pytesseract is not installed, breaking JARVIS entirely even when vision fallback is not needed.
**Why it happens:** pytesseract is an optional dependency (fallback path only).
**How to avoid:** Import pytesseract inside the `try` block within the fallback function: `try: import pytesseract`. JARVIS starts normally; fallback simply reports "OCR unavailable" if the package is missing.
**Warning signs:** `ImportError: No module named 'pytesseract'` at JARVIS startup.

### Pitfall 5: Large Base64 Strings in SQLite History
**What goes wrong:** Saving full base64 PNG (~1–3 MB per screenshot) into the SQLite messages table, then embedding it in ChromaDB. Slows every query; ChromaDB embedding of image data is meaningless.
**Why it happens:** `session.save()` embeds all messages including the multimodal HumanMessage.
**How to avoid:** When constructing the multimodal HumanMessage with image, also keep a text-only version for history persistence. Store `"[screenshot capturado e analisado]"` in SQLite; only the text content gets embedded in ChromaDB.
**Warning signs:** Rapid SQLite file growth; ChromaDB query latency spikes after vision usage.

### Pitfall 6: Hot-Reload Creates LLM on Every Send
**What goes wrong:** Naively creating `Settings()` and `create_llm()` on every `send()` call without checking if the model actually changed. This loads model config (and potentially makes HTTP calls) on every user message.
**Why it happens:** Simple implementation without model change detection.
**How to avoid:** Compare `current_model_id` to the last known model. Only rebuild LLM when the model identifier actually changes. Store `self._current_model_id` in ChatSession.
**Warning signs:** Increased latency on every send(); verbose logs showing repeated LLM factory calls.

---

## Code Examples

Verified patterns from official sources and codebase:

### Screenshot to Base64 (PIL pipeline)
```python
# Source: Pillow docs + CLAUDE.md approved stack
import pyautogui
import base64
from io import BytesIO

async def capture_screenshot_b64() -> str:
    """Capture screen and return as base64 PNG string."""
    screenshot = await asyncio.to_thread(pyautogui.screenshot)
    buf = BytesIO()
    screenshot.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")
```

### LangChain Multimodal HumanMessage (OpenAI-compatible)
```python
# Source: LangChain official docs (docs.langchain.com/oss/python/langchain/messages)
# Compatible with langchain-openai and langchain-anthropic
from langchain_core.messages import HumanMessage

image_message = HumanMessage(content=[
    {"type": "text", "text": "O que está nessa tela?"},
    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_string}"}},
])
```

### pytesseract OCR Fallback
```python
# Source: pytesseract PyPI docs (pypi.org/project/pytesseract)
# Always import inside try block (optional dependency)
def extract_text_from_image_b64(image_b64: str) -> str | None:
    try:
        import pytesseract
        from PIL import Image
        import base64
        from io import BytesIO
        img_bytes = base64.b64decode(image_b64)
        img = Image.open(BytesIO(img_bytes))
        text = pytesseract.image_to_string(img, lang="por+eng")
        return text.strip() or None
    except ImportError:
        return None  # pytesseract not installed — use cloud fallback
    except Exception:
        return None  # tesseract binary not found or OCR failed
```

### Settings Hot-Reload Pattern
```python
# Source: pydantic-settings docs — re-instantiation reads .env fresh
# (pydantic/pydantic-settings#315, pydantic/pydantic-settings#266)
from jarvis.config import Settings

def get_fresh_settings() -> Settings:
    """Re-read .env from disk. Settings() parses env file on each init."""
    return Settings()  # pydantic-settings reads env_file on every __init__
```

### Model Change Detection in ChatSession
```python
# Pattern: track last model ID to avoid rebuilding LLM on every send()
class ChatSession:
    def __init__(self, llm, ...):
        self.llm = llm
        self._current_model_id = settings.lm_studio_model or settings.llm_model
        ...

    async def send(self, user_input: str, image: str | None = None) -> str:
        # LLM-04: Hot-reload check
        fresh = Settings()
        new_model = fresh.lm_studio_model or fresh.llm_model
        if new_model and new_model != self._current_model_id:
            from jarvis.llm.factory import create_llm
            self.llm = create_llm(fresh)
            self._llm_with_tools = self.llm.bind_tools(self._tools) if self._tools else self.llm
            self._current_model_id = new_model
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| pyautogui | VISION-01, D-02 | NOT in venv | — | Must install: `pip install pyautogui` |
| pillow | VISION-01, D-04 | NOT in venv | — | Must install: `pip install pillow` |
| pytesseract | VISION-02 (OCR fallback) | NOT in venv | — | Optional — skip OCR fallback, go to cloud |
| tesseract binary | VISION-02 | NOT FOUND | — | Must install system package for OCR to work |
| langchain-core | All LLM paths | AVAILABLE | 1.2.24 | — |
| Python | Runtime | AVAILABLE | 3.x | — |

**Missing dependencies with no fallback:**
- `pyautogui` + `pillow` — required for VISION-01 (screenshot capture). Wave 0 task must `pip install pyautogui pillow` and add to `pyproject.toml`.

**Missing dependencies with fallback:**
- `pytesseract` / `tesseract` binary — VISION-02 is the OCR fallback path itself. If pytesseract is not installed, D-04 specifies falling through to cloud vision (step 2). The plan should install pytesseract but gracefully handle `ImportError` at runtime.

**pyproject.toml updates required (Wave 0):**
```toml
# Add to [project] dependencies:
"pyautogui>=0.9.54",
"pillow>=10.0",
"pytesseract>=0.3.13",
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `PYTHONPATH=src python -m pytest tests/test_vision.py tests/test_session_vision.py -x -q` |
| Full suite command | `PYTHONPATH=src python -m pytest tests/ -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VISION-01 | `analyze_screen` tool returns `image_base64` key | unit | `pytest tests/test_vision.py::test_analyze_screen_returns_b64 -x` | Wave 0 |
| VISION-01 | `ChatSession.send(image=b64)` builds multimodal HumanMessage | unit | `pytest tests/test_session_vision.py::test_send_with_image_builds_multimodal_message -x` | Wave 0 |
| VISION-02 | OCR fallback extracts text when `caps.vision=False` | unit | `pytest tests/test_vision.py::test_ocr_fallback_extracts_text -x` | Wave 0 |
| VISION-02 | OCR fallback returns None on ImportError gracefully | unit | `pytest tests/test_vision.py::test_ocr_fallback_import_error -x` | Wave 0 |
| VISION-03 | Cloud fallback triggered when local has no vision + no OCR | unit | `pytest tests/test_vision.py::test_cloud_fallback_triggered -x` | Wave 0 |
| LLM-03 | Vision task routed to vision LLM; non-vision to standard LLM | unit | `pytest tests/test_session_vision.py::test_vision_routing -x` | Wave 0 |
| LLM-04 | `ChatSession.send()` rebuilds LLM when model changes in settings | unit | `pytest tests/test_session_vision.py::test_hot_reload_model_change -x` | Wave 0 |
| LLM-04 | No LLM rebuild when model unchanged | unit | `pytest tests/test_session_vision.py::test_no_rebuild_when_model_unchanged -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `PYTHONPATH=src python -m pytest tests/test_vision.py tests/test_session_vision.py -x -q`
- **Per wave merge:** `PYTHONPATH=src python -m pytest tests/ -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_vision.py` — covers VISION-01 (analyze_screen), VISION-02 (OCR), VISION-03 (cloud fallback)
- [ ] `tests/test_session_vision.py` — covers LLM-03 (routing), LLM-04 (hot-reload), multimodal message construction

*(Existing `tests/conftest.py` and `tests/test_session_tools.py` patterns serve as templates — no new fixtures needed beyond what already exists)*

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `openai/whisper` for everything | `faster-whisper` | 2023 | Not relevant to Phase 5 |
| LangChain `image_url` with only URL strings | LangChain also supports `{"type": "image", "base64": ..., "mime_type": ...}` | LangChain 1.x | Both formats work; `image_url` with data URI has wider OpenAI-compatible backend support |
| Pydantic v1 settings | Pydantic v2 + pydantic-settings | 2023 | `BaseSettings` in separate `pydantic-settings` package; no built-in reload method |

**Deprecated/outdated:**
- `langchain.agents.AgentExecutor`: Removed in LangChain 1.0 — not used in this project (correct).
- LangChain `image_url` with `detail` parameter for GPT-4V: Still supported but detail parameter only matters for OpenAI's billing; irrelevant for local models.

---

## Open Questions

1. **Does LangChain 1.2.x `langchain-anthropic` accept the `image_url` data URI format?**
   - What we know: LangChain docs show both `image_url` and the newer `image` + `base64` + `mime_type` format. The older `image_url` with data URI is confirmed for `langchain-openai`.
   - What's unclear: Whether `langchain-anthropic 1.4.0` translates `image_url` with data URI correctly or needs the `image`/`base64`/`mime_type` format.
   - Recommendation: Test both formats in the implementation task. If `langchain-anthropic` rejects `image_url`, switch to `{"type": "image", "base64": b64, "mime_type": "image/png"}` for the cloud fallback path only.

2. **pyautogui on Linux without display (headless environment)**
   - What we know: `pyautogui.screenshot()` requires a display (X11 or Wayland). The current dev environment is a Linux server that may be headless.
   - What's unclear: Whether the CI/test environment has a virtual display.
   - Recommendation: Mock `pyautogui.screenshot()` in all tests using `unittest.mock.patch`. The test environment does not need a real display. Production use requires a graphical session (user's desktop) — this is expected.

3. **`create_llm()` function signature for hot-reload**
   - What we know: `create_llm()` in `llm/factory.py` reads the module-level `settings` singleton. For hot-reload, it needs to accept an optional `settings` argument.
   - What's unclear: Whether `create_llm(settings_instance)` is a clean extension or requires refactoring.
   - Recommendation: Extend `create_llm(settings=None)` with a default that falls back to the global singleton if not provided. This is backward-compatible and testable.

---

## Sources

### Primary (HIGH confidence)
- `/root/jarvis/src/jarvis/llm/capabilities.py` — `detect_capabilities()`, `ModelCapabilities` — reuse unchanged
- `/root/jarvis/src/jarvis/core/session.py` — Phase 4 tool-calling loop — extend for image param
- `/root/jarvis/src/jarvis/tools/__init__.py` — `ALL_TOOLS` — add `analyze_screen`
- `/root/jarvis/src/jarvis/__main__.py` — command dispatch pattern — add `/screenshot`
- `/root/jarvis/pyproject.toml` — confirmed pyautogui/pillow/pytesseract NOT yet in dependencies
- [LangChain Messages docs](https://docs.langchain.com/oss/python/langchain/messages) — multimodal HumanMessage format
- [pytesseract PyPI](https://pypi.org/project/pytesseract/) — `image_to_string(PIL_Image)` API

### Secondary (MEDIUM confidence)
- [LM Studio bug tracker #1027](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1027) — PNG format requirement for base64 images via LM Studio API
- [LM Studio bug tracker #968](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/968) — REST API vs SDK inconsistency for vision
- [pydantic-settings #266](https://github.com/pydantic/pydantic-settings/issues/266) — no built-in hot-reload; re-instantiation is the pattern
- [pydantic-settings #315](https://github.com/pydantic/pydantic-settings/issues/315) — feature request for reload method (not implemented)

### Tertiary (LOW confidence)
- Web search results on LM Studio OpenAI-compatible vision — reports of format inconsistencies; needs project-specific validation

---

## Project Constraints (from CLAUDE.md)

The following directives from `CLAUDE.md` apply to this phase:

| Directive | Impact on Phase 5 |
|-----------|-------------------|
| Multi-LLM: all LLM calls via abstraction layer | Cloud vision fallback must use `create_llm()` factory, not direct `anthropic.Anthropic()` client |
| No hardcode `base_url` | Hot-reload reads from `Settings.lm_studio_url`, not a literal string |
| Privacy: conversations never go to cloud without explicit user config | Cloud vision fallback only triggers if `anthropic_api_key` or `openai_api_key` are set in config |
| Use pyautogui for screenshots | Confirmed in CLAUDE.md PC Control section |
| Use pytesseract for OCR | Confirmed in CLAUDE.md references |
| Use pillow for image processing | Confirmed in CLAUDE.md Supporting Libraries |
| Avoid `AgentExecutor` / `initialize_agent()` | Not relevant — Phase 4 already uses correct pattern |
| Never hardcode provider | All LLM creation via `create_llm()` |
| ARCH-02: async pipeline, no blocking main thread | `pyautogui.screenshot()` must run via `asyncio.to_thread()` |
| Git commits: Conventional Commits with emojis | Enforced by git commit guidelines in CLAUDE.md |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pyautogui/pillow/pytesseract are CLAUDE.md-approved; stdlib base64/io have no uncertainty
- Architecture: HIGH — patterns derived directly from reading existing codebase (session.py, tools/, capabilities.py)
- LangChain image format: HIGH for `image_url` data URI with `langchain-openai`; MEDIUM for `langchain-anthropic` (open question #1)
- LM Studio image format: MEDIUM — confirmed PNG works, but some format inconsistencies reported in bug tracker
- Pitfalls: HIGH — pitfalls 2, 3, 4, 5 derived from reading existing code patterns and known behaviors
- Hot-reload pattern: HIGH — pydantic-settings re-instantiation is documented standard approach

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (30 days — stable libraries; LM Studio bug tracker items may resolve sooner)
