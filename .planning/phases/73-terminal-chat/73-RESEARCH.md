# Phase 73: Terminal Chat - Research

**Researched:** 2026-05-18
**Domain:** Terminal-based chat interface with SSE streaming
**Confidence:** HIGH

## Summary

Phase 73 replaces the placeholder sleep loop in `__main__.py` with a functional chat loop that reads user messages, streams responses from the gateway via Server-Sent Events (SSE), and displays tokens in real-time. The phase builds on Phase 72's infrastructure (config loading, health checking) and depends on the gateway's existing `/api/chat/stream` endpoint which already handles LLM communication, memory management, and agentic routing.

The implementation is deliberately minimal — no rich UI, no multi-turn context injection (gateway handles memory), no retry loops. The Python client acts as a thin HTTP wrapper that streams text from the gateway and prints it to the terminal.

**Primary recommendation:** Use `urllib.request` for SSE streaming (stdlib-only, consistent with `health.py` pattern), print tokens with `print(token, end='', flush=True)` for character-by-character display, and rely on natural terminal scroll history for PYCHAT-03.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Presentation — Use `print()` simple, no rich in this phase (rich enters Phase 77)
**D-02:** Input prompt — Use `input('> ')` standard with arrow, no extra label
**D-03:** Session history — Via natural terminal scroll — no code needed (terminal maintains history)
**D-04:** Multi-turn context — Each message is independent; gateway manages memory backend
**D-05:** API key field — Add `api_key: str = ""` to `JarvisConfig` (extends schema per Phase 72 rules)
**D-06:** Load order — `.env JARVIS_API_KEY` → `config.json api_key`; if non-empty, inject `Authorization: Bearer {api_key}` header
**D-07:** Local gateway sans auth — `api_key` stays empty, no header sent
**D-08:** Mid-stream failure — Print received tokens + `\n[erro: conexão perdida]` then return to prompt
**D-09:** Gateway offline after health check — Show error, return to prompt; loop continues (no crash per Phase 72 D-11)

### Claude's Discretion

- Exact internal module structure (separate `chat.py` or inline in `__main__.py`)
- Exact error message format (clarity required, no crash required)
- SSE request timeout value

### Deferred Ideas (OUT OF SCOPE)

None — all scope captured in locked decisions.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PYCHAT-01 | User can type messages and receive streaming responses token-by-token | SSE `data: {token}\n\n` format confirmed; `urllib.request` supports streaming via chunk-based read() |
| PYCHAT-02 | Client shows clear error if gateway unreachable at startup (no crash) | health.py pattern established; error handling via dict return (never raises) |
| PYCHAT-03 | User can see current session's conversation history in terminal | Terminal's native scrollback handles this; no code needed (satisfies "natural" requirement) |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| urllib.request | stdlib | HTTP client for SSE stream | Zero dependencies; Phase 72 uses for health check; streaming via chunks is stdlib-native |
| print() | stdlib | Terminal output | No external rendering needed per D-01; tokens printed with `end='', flush=True` |
| input() | stdlib | Terminal input | Standard Python REPL prompt per D-02 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| httpx | 0.28.x (via openai) | Alternative async HTTP client | Not required for MVP; Phase 74+ STT/TTS may introduce async needs |
| loguru | 0.7.x (project stack) | Structured logging | Optional for debugging stream errors; not required for success criteria |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| urllib.request | requests | requests adds dependency; urllib.request works identically for blocking stream |
| urllib.request | httpx (async) | Async overhead not justified for simple blocking chat loop; revisit in Phase 75+ |
| print() + input() | rich.live() + Prompt() | Rich/fancy UI deferred to Phase 77 per D-01; print() is sufficient MVP |
| Terminal scroll | In-memory history with up/down arrows | Additional UI complexity; terminal scrollback "just works" and is what users expect |

**Installation:**
No new packages required. Phase 73 uses only stdlib `urllib.request`, `print()`, `input()`, already available.

## Architecture Patterns

### Recommended Project Structure

```
apps/desktop-py/src/jarvis_desktop/
├── __main__.py          # Entry point — health check + chat loop
├── config.py            # JarvisConfig (add api_key field per D-05)
├── health.py            # check_health() reused from Phase 72
├── chat.py              # (Optional per Claude's Discretion) SSE streaming logic
└── (new) models.py      # (Optional) ChatMessage or similar if needed
```

**Recommendation:** Inline chat logic in `__main__.py` for MVP simplicity (Phase 73 is < 50 lines). Extract to `chat.py` only if loop becomes complex or reused.

### Pattern 1: SSE Streaming via urllib.request

**What:** Reading Server-Sent Events as an HTTP response stream, printing tokens as they arrive.

**When to use:** Real-time response display from streaming endpoints without external dependencies.

**Example:**
```python
# Source: Phase 73 implementation pattern
import urllib.request
from urllib.error import URLError

gateway_url = "http://localhost:3000"
message = "hello"
url = f"{gateway_url}/api/chat/stream?message={urllib.parse.quote(message)}"

headers = {}
if api_key:  # D-06 pattern
    headers["Authorization"] = f"Bearer {api_key}"

try:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        # Read in chunks; SSE format is "data: <token>\n\n"
        while True:
            chunk = response.read(1024)
            if not chunk:
                break
            # Parse chunk for "data: ..." lines
            lines = chunk.decode('utf-8').split('\n')
            for line in lines:
                if line.startswith('data: '):
                    token = line[6:]
                    print(token, end='', flush=True)
except URLError as e:
    print(f"[erro: conexão perdida]")  # D-08 pattern
except Exception as e:
    print(f"[erro: {str(e)}]")
else:
    print()  # Final newline after response
```

**Key details:**
- SSE format: each message is `data: {content}\n\n` (literal newlines)
- Chunk-based reading handles partial tokens arriving mid-stream
- `flush=True` ensures character appears immediately (no buffering)
- `timeout=30` prevents indefinite hangs
- Parsing must handle incomplete lines (chunk boundaries may split a `data:` line)

### Pattern 2: Loop with Health Check Precondition

**What:** Chat loop only starts if gateway health check passes; failure shows error and exits (no retry, satisfies PYCHAT-02).

**When to use:** Ensuring external service is reachable before entering user-facing loop.

**Example:**
```python
# Source: Phase 72 health pattern, extended for Phase 73
config = load_config()
health = check_health(config.gateway_url)
if health.get("gateway") != "ok":
    print(f"Gateway: ✖ offline")
    sys.exit(1)  # Clear error exit before chat loop

print("Chat ready. Type messages and press Enter.")
while True:
    message = input('> ')
    if not message.strip():
        continue
    # Stream response here (Pattern 1)
```

### Pattern 3: Config-Driven API Key Injection (D-05/D-06)

**What:** API key loaded from `.env` or `config.json`, conditionally injected as Bearer token.

**When to use:** Optional authentication for gateway access (local dev uses no key, production may require).

**Example:**
```python
# Source: Phase 73 config extension pattern
# In config.py — extend JarvisConfig
class JarvisConfig(BaseModel):
    gateway_url: str = Field(default="http://localhost:3000")
    api_key: str = Field(default="")  # D-05: new field
    # ... other fields unchanged ...

# In __main__.py — use config
config = load_config()  # Load order: env > ~/.jarvis/config.json > defaults (unchanged)
headers = {}
if config.api_key:  # D-06: only inject if non-empty
    headers["Authorization"] = f"Bearer {config.api_key}"
# Pass headers to SSE request
```

Load order per Phase 72 logic:
1. Defaults (JarvisConfig field defaults)
2. `GATEWAY_URL` env var (already implemented)
3. `~/.jarvis/config.json` user file (already implemented)
4. `JARVIS_API_KEY` env var — add this load in `load_config()`

### Anti-Patterns to Avoid

- **Hardcoded API key or gateway URL:** Breaks when gateway moves; use config (CLAUDE.md constraint).
- **Crashing on gateway error:** Per Phase 72 D-11, always show error message and continue (never unhandled exception).
- **Buffering SSE tokens:** Use `flush=True` in print() to display character-by-character; buffering makes response feel slow.
- **Parsing SSE naively (splitting on `\n`):** SSE events end with `\n\n`; incomplete chunks may split a token; accumulate buffer and parse complete lines.
- **Hardcoding timeouts:** Make SSE timeout configurable via config or environment; 30 seconds is reasonable default.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client library | Custom socket code | urllib.request (stdlib) | urllib handles SSL, chunked encoding, redirects; socket code is fragile |
| SSE parsing | Regex or naive split | Accumulate buffer, parse lines with `data: ` prefix | SSE has subtle format; gaps between data/code event types; hand-rolled parser introduces bugs |
| Input/output buffering | Manual flush logic | Python's print(..., flush=True) + input() | Stdlib handles line buffering correctly; manual code usually gets edge cases wrong |
| Error handling for network | Retry loops | Single attempt per user message, show error | Retry loops hide real problems (gateway crash vs. transient packet loss); user can retry by typing again |
| Config persistence | Manual JSON serialization | Pydantic v2 model_dump() + json module | Pydantic handles validation, default values, forward-compat (unknown keys); manual code duplicates validation |

**Key insight:** SSE streaming and HTTP client management are deceptively complex (buffering, partial reads, encoding, timeouts, SSL). urllib.request handles all this; rolling custom code introduces subtle hangs and data corruption bugs.

## Common Pitfalls

### Pitfall 1: Incomplete SSE Line Parsing
**What goes wrong:** Chunk boundary splits a `data: token` line in half. Code waits forever for the `\n\n` end marker that comes in the next chunk. Response hangs.

**Why it happens:** Naive implementation accumulates no buffer between `read()` calls, parses complete lines only within a single chunk.

**How to avoid:** Maintain a buffer across chunk reads; parse complete lines (ending in `\n`) only after appending new chunk data.

**Warning signs:** First few tokens appear, then response freezes mid-stream.

**Example fix:**
```python
buffer = ""
while True:
    chunk = response.read(1024)
    if not chunk:
        break
    buffer += chunk.decode('utf-8')
    lines = buffer.split('\n')
    # Last item may be incomplete; keep it in buffer
    buffer = lines[-1]
    for line in lines[:-1]:
        if line.startswith('data: '):
            token = line[6:]
            print(token, end='', flush=True)
print()  # Final newline
```

### Pitfall 2: Forgetting error message after gateway offline mid-stream
**What goes wrong:** Stream starts, reads first token, gateway crashes mid-response. Code prints nothing to indicate failure. User thinks JARVIS is still thinking.

**Why it happens:** No try/except around streaming loop; URLError raised on read(), response abruptly terminates.

**How to avoid:** Wrap streaming loop in try/except; always print `\n[erro: conexão perdida]` on URLError (D-08 pattern).

**Warning signs:** Conversation halts silently; no error message; user reboots thinking app is broken.

### Pitfall 3: No flush on print() — tokens bunch up
**What goes wrong:** Response arrives character-by-character but doesn't display until a full line is printed. Users see nothing for 1-2 seconds, then a wall of text.

**Why it happens:** `print()` defaults to line buffering for file/pipe output; tokens accumulate until newline.

**How to avoid:** Always `print(token, end='', flush=True)` for streaming output.

**Warning signs:** Real-time feel is gone; response displays all at once instead of token-by-token.

### Pitfall 4: No timeout on urlopen()
**What goes wrong:** Gateway hangs; sends nothing; client waits forever. User can't Ctrl+C cleanly because Python is blocked in urllib.

**Why it happens:** Default timeout is `None` (infinite wait). Network partition has no automatic detection.

**How to avoid:** Always pass `timeout=<seconds>` to `urlopen()`; 30 seconds is reasonable for LLM response.

**Warning signs:** Ctrl+C doesn't work, or takes 5+ minutes to respond.

### Pitfall 5: API key in query string instead of header
**What goes wrong:** Bearer token visible in gateway logs as plaintext in URL; if logs leak, auth is compromised.

**Why it happens:** Lazily appending `&api_key=...` to URL instead of setting header.

**How to avoid:** Always use `Authorization: Bearer {api_key}` header per D-06; never query string for secrets.

**Warning signs:** Security audit finds tokens in access logs.

### Pitfall 6: Terminal history lost on crash
**What goes wrong:** Long conversation, app crashes on unhandled exception, all terminal history is erased (depending on shell/OS).

**Why it happens:** No signal handler for SIGTERM; app terminates abruptly without flushing terminal state.

**How to avoid:** Phase 72 already has SIGINT handler (Ctrl+C). Ensure all exceptions are caught; gracefully exit with error message (no bare raise).

**Warning signs:** User loses work; frustration.

## Runtime State Inventory

Not applicable (greenfield phase — no existing state to rename/migrate).

## Code Examples

### Full Chat Loop (Minimal MVP)

**Source:** Phase 73 design from CONTEXT.md

```python
# Phase 73: Terminal Chat Loop
# Replaces: while True: time.sleep(1) in __main__.py

def chat_loop(config: JarvisConfig) -> None:
    """Infinite chat loop: read message → stream response → repeat.
    
    Exits on Ctrl+C (handled by existing signal handler in main()).
    """
    import urllib.request
    import urllib.parse
    from urllib.error import URLError

    print("Chat ready. Type messages and press Enter. Ctrl+C to exit.")
    print()

    while True:
        message = input('> ')
        if not message.strip():
            continue

        # Build request with optional API key header (D-06)
        url = f"{config.gateway_url.rstrip('/')}/api/chat/stream"
        query = f"?message={urllib.parse.quote(message)}"
        url = url + query

        headers = {}
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"

        # Stream response (SSE format: data: <token>\n\n)
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=30) as response:
                buffer = ""
                while True:
                    chunk = response.read(1024)
                    if not chunk:
                        break
                    buffer += chunk.decode('utf-8')
                    lines = buffer.split('\n')
                    buffer = lines[-1]  # Keep incomplete line
                    for line in lines[:-1]:
                        if line.startswith('data: '):
                            token = line[6:]
                            print(token, end='', flush=True)
                print()  # Final newline after response
        except URLError as e:
            print(f"\n[erro: conexão perdida]")  # D-08
        except Exception as e:
            print(f"\n[erro: {str(e)}]")
        print()  # Blank line before next prompt
```

**Called from main() after health check:**
```python
# In __main__.py main()
health = check_health(config.gateway_url)
if health.get("gateway") == "ok":
    backend_status = health.get("backend", "unknown")
    print(f"Gateway: ✔ online  (backend: {backend_status})")
else:
    print(f"Gateway: ✖ offline")
    print("Chat requires gateway. Exiting.")
    sys.exit(1)  # D-09: Clear error exit, not crash

chat_loop(config)  # Phase 73: Replace sleep loop with this
```

### Config Extension (D-05/D-06)

**Source:** Phase 72 JarvisConfig extension

```python
# In config.py
class JarvisConfig(BaseModel):
    gateway_url: str = Field(default="http://localhost:3000")
    whisper_model: str = Field(default="tiny")
    tts_provider: str = Field(default="kokoro")
    voice_mode: str = Field(default="ptt")
    api_key: str = Field(default="")  # D-05: New field, empty default

# In load_config()
def load_config() -> JarvisConfig:
    # ... existing .env load ...
    
    # D-06: Load order
    gateway_url = os.getenv("GATEWAY_URL", "http://localhost:3000")
    api_key = os.getenv("JARVIS_API_KEY", "")  # Add this line
    config = JarvisConfig(gateway_url=gateway_url, api_key=api_key)
    
    # ... existing ~/.jarvis/config.json load (api_key may override env) ...
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| urllib.request | SSE streaming | ✓ | stdlib (Python 3.10+) | — |
| print() / input() | Terminal I/O | ✓ | stdlib (Python 3.10+) | — |
| curl or wget | Manual testing SSE | ✓ (project CLI) | system | `python -m http.client` |

No external tool dependencies required. urllib.request is stdlib since Python 3.1.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio 0.23.x |
| Config file | `apps/desktop-py/pyproject.toml` [tool.pytest.ini_options] |
| Quick run command | `cd apps/desktop-py && uv run pytest tests/test_chat.py -xvs` |
| Full suite command | `cd apps/desktop-py && uv run pytest tests/ -xvs` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PYCHAT-01 | Parse SSE `data: token\n\n` format correctly, display token immediately | unit | `pytest tests/test_chat.py::test_parse_sse_tokens -xvs` | ❌ Wave 0 |
| PYCHAT-01 | Handle partial reads (chunk splits line) without hanging | unit | `pytest tests/test_chat.py::test_buffer_incomplete_sse_line -xvs` | ❌ Wave 0 |
| PYCHAT-02 | config.api_key loaded from JARVIS_API_KEY env correctly | unit | `pytest tests/test_config.py::test_api_key_env_load -xvs` | ❌ Wave 0 |
| PYCHAT-02 | config.api_key from ~/.jarvis/config.json overrides env | unit | `pytest tests/test_config.py::test_api_key_file_override -xvs` | ❌ Wave 0 |
| PYCHAT-02 | Authorization header injected only if api_key non-empty | unit | `pytest tests/test_chat.py::test_auth_header_conditional -xvs` | ❌ Wave 0 |
| PYCHAT-02 | URLError during health check shows error, exits with code 1 (no crash) | integration | `pytest tests/test_chat.py::test_gateway_offline_at_startup -xvs` | ❌ Wave 0 |
| PYCHAT-03 | Terminal scroll history available (manual verification: scroll up in terminal) | manual | (scroll up after multi-message session) | N/A |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/test_chat.py -xvs` (unit tests for chat logic)
- **Per wave merge:** `uv run pytest tests/ -xvs` (all tests including config)
- **Phase gate:** Full suite green + manual scroll test before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_chat.py` — SSE parsing, buffer handling, error cases (PYCHAT-01, PYCHAT-02)
- [ ] `tests/test_config.py` — extend with `test_api_key_*` (PYCHAT-02)
- [ ] `tests/conftest.py` — mock gateway fixture for SSE responses (if needed)
- [ ] Manual verification: "Scroll through terminal history after 3-message session" (PYCHAT-03)

*(If implemented: existing test infrastructure covers all phase requirements. Test stubs created in Wave 0.)*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Blocking urllib.request with timeout | Standard practice | Always (since Python 3.x) | Simple, reliable, no async overhead for MVP |
| Token buffering in print() | `flush=True` per token | Python 3.3+ | Character-by-character display without manual buffering |
| Query string API keys | HTTP Authorization header | HTTP/1.1 standard (1997) | Secrets not logged in URLs; standard across APIs |
| Multi-turn context in client | Backend memory management (ChromaDB) | Phase 72+ (backend-ts redesign) | Client stays thin; memory lives in TypeScript backend |

**Deprecated/outdated:**
- `xmlrpc.client` for RPC (replaced by modern JSON/REST APIs) — not relevant to chat
- Separate STT/TTS libraries in Python client — deferred to Phase 74+ (not MVP)

## Open Questions

1. **SSE library vs. stdlib?**
   - What we know: stdlib `urllib.request` supports streaming via chunk-based read(); no third-party SSE library is needed for MVP
   - What's unclear: Future phases may add async streaming (Phase 75 TTS?) — may warrant httpx then
   - Recommendation: Use stdlib now; extract to `chat.py` module if Phase 74+ STT adds complexity

2. **Terminal UI in Phase 73 or Phase 77?**
   - What we know: D-01 defers rich UI to Phase 77; Phase 73 uses print()/input()
   - What's unclear: Difference between "terminal scroll history" and "in-memory history with arrow keys"
   - Recommendation: Terminal scroll (natural scrollback) satisfies PYCHAT-03; Phase 77 adds interactive history if needed

3. **Config persistence — is api_key saved to ~/.jarvis/config.json?**
   - What we know: load_config() reads ~/.jarvis/config.json; api_key field is new
   - What's unclear: Should api_key be user-editable in JSON, or env-only for security?
   - Recommendation: Allow both (env overrides JSON) per D-06; Phase 77 config menu may allow editing

## Sources

### Primary (HIGH confidence)
- **urllib.request stdlib** — Python 3.10+ official docs; streaming via chunk-based read() confirmed
- **Phase 72 code (config.py, health.py)** — existing patterns for load_config(), error handling, stdlib-only approach
- **CONTEXT.md §canonical_refs** — gateway API endpoint `/api/chat/stream` confirmed SSE format `data: {token}\n\n`

### Secondary (MEDIUM confidence)
- **chat.ts (gateway router)** — SSE headers `Content-Type: text/event-stream` confirmed; Authorization header injection pattern confirmed
- **Conventional chat UX** — print() + input() loop with terminal scroll is de-facto standard for CLI chat (learned from ecosystem)

### Tertiary (LOW confidence)
- None — all primary sources verified against codebase

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — urllib.request is stdlib; Phase 72 establishes stdlib-only pattern; gateway SSE format verified in code
- **Architecture:** HIGH — patterns follow Phase 72 precedent; CONTEXT.md locked decisions are comprehensive
- **Pitfalls:** MEDIUM — SSE buffering/timeout pitfalls are well-known in streaming APIs; not verified against this specific gateway (but gateway code looks standard)
- **Tests:** MEDIUM — test structure inferred from pyproject.toml and Phase 72 stubs; specific test cases not yet written

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (stable domain, no major library changes expected)
