# Phase 84: Fix PC Control Tools - Python-Native Fallback - Research

**Researched:** 2026-05-28
**Domain:** Gateway SSE dispatch architecture + Python client registration
**Confidence:** HIGH

## Summary

This phase implements a registration and dispatch mechanism for the Python desktop client to execute PC control actions (`openFolder`, `openFile`, `closeFile`, `viewContent`) without requiring Electron. The Python client already has all implementations locally (`pc_control.py`); the problem is routing — the backend's `request_file_action` tool currently only sends actions to Electron via WebSocket.

The solution mirrors the existing Electron WS pattern but uses HTTP (SSE for server→client, POST for client→server ACK). The gateway will maintain two parallel dispatch paths: Electron WS and Python SSE, sharing the same `pendingAckResolvers` mechanism for ACK handling.

**Primary recommendation:** Implement SSE-based registration (D-01) with fallback dispatch logic in `action-dispatcher.ts`, a new `/api/actions/events` SSE endpoint for Python registration, and update Python client to boot the SSE listener and send `x-jarvis-client-id` headers on all requests.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Mecanismo de registro — SSE persistente dedicada
- **D-02:** Python client — geração e envio do clientId
- **D-03:** Dispatch path no gateway — fallback Python SSE
- **D-04:** Endpoint de ACK — POST /api/actions/ack
- **D-05:** Confirmação no terminal Python — pedir antes de executar
- **D-06:** Ações Python cobertas nesta fase (openFolder, openFile, closeFile, viewContent)

### Claude's Discretion
- Nome exato do Map para SSE clients no gateway (`pythonSseClients`, `sseConnections`, etc.)
- Formato exato do evento SSE emitido (usar padrão `data: {json}\n\n`)
- UUID gerado no boot: in-memory (por processo) ou persistente em `~/.jarvis/client_id`
- Reconexão automática da SSE persistente: backoff linear ou exponencial (simples é ok)
- Detecção de clientType: por prefix ("python-" no clientId) ou por registro separado

### Deferred Ideas (OUT OF SCOPE)
- **viewContent via Python** — already implementable; added as bonus, not mandatory
- **Confirmação via voz** — confirm_destructive() already supports voice queue; Terminal input simpler for MVP
- **Python como cliente WS** — could use WS instead of SSE+POST for symmetry; SSE is simpler given existing patterns

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| (TBD) | Python client registers via SSE on boot | SSE protocol + persistent connection handling |
| (TBD) | Python client sends x-jarvis-client-id header on all requests | Header injection in urllib.request |
| (TBD) | Gateway dispatches PC actions to Python SSE when Electron WS unavailable | action-dispatcher.ts fallback logic |
| (TBD) | Python client asks for confirmation before executing PC actions | Terminal input + timeout in confirm_destructive() |
| (TBD) | POST /api/actions/ack endpoint resolves pending action requests | Express router + pendingAckResolvers integration |

## Standard Stack

### Core Gateway Components (TypeScript)
| Component | Purpose | Why |
|-----------|---------|-----|
| Express Router | Route definition for SSE endpoint + ACK endpoint | Lightweight, integrates with existing gateway app |
| Zod | Runtime schema validation for ACK payloads | Already used throughout gateway (path-validator.ts, dispatch-action.ts) |
| Node.js streams (Response.write) | SSE event emission | Built-in; avoids extra dependencies |

### Python Client Components
| Component | Purpose | Why |
|-----------|---------|-----|
| urllib.request | HTTP requests with custom headers | stdlib; already used in chat.py for SSE streaming |
| threading | Background SSE listener thread | Already used in pc_control.py for confirm_destructive timeout polling |
| uuid | Client ID generation | stdlib; cross-platform |

### Supporting Libraries (No New Installs)
- **langfuse** (if langfuse observability enabled) — will need to propagate x-jarvis-client-id header when calling gateway
- **loguru** (gateway) — structured logging for SSE connections and ACK routing
- **pydantic** (Python) — JarvisConfig already has this for config management

## Architecture Patterns

### Gateway SSE Registration Pattern

The Python client establishes a long-lived GET request to `/api/actions/events?clientId={uuid}`:

```
GET /api/actions/events?clientId=550e8400-e29b-41d4-a716-446655440000 HTTP/1.1

[gateway responds with SSE headers and keeps connection open]
```

The gateway stores the response object (Express Response) in a Map keyed by clientId:

```typescript
const pythonSseClients = new Map<string, Response>();

// On successful SSE connection:
pythonSseClients.set(clientId, res);

// On disconnect or error:
pythonSseClients.delete(clientId);
```

### Dispatch Fallback Logic

When `sendActionRequest()` in `action-dispatcher.ts` is called:

1. **Check Electron WS first** (existing): `clientConnections.get(clientId)`
2. **If not found or closed**, check **Python SSE**: `pythonSseClients.get(clientId)`
3. **If Python SSE found**: emit `task:pc_action` event over SSE instead of WS
4. **ACK handling** is identical in both cases — same `pendingAckResolvers` Map

### Python Client SSE Listener

The Python client runs a background thread (or asyncio task in future) that:

1. Connects to `/api/actions/events?clientId={uuid}` on boot
2. Parses SSE events and dispatches `task:pc_action` to `_handle_agentic_event()`
3. On action receipt: calls `execute_pc_action()` with confirmation prompts
4. POSTs result to `/api/actions/ack` with `{ requestId, status, content? }`
5. Reconnects automatically on connection drop with simple backoff

### Header Injection Pattern

Python client must send `x-jarvis-client-id: {uuid}` on **all** requests to gateway:

```python
# In chat.py build_request_headers():
def build_request_headers(api_key: str, client_id: str = "") -> dict:
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    if client_id:
        headers["x-jarvis-client-id"] = client_id
    return headers

# At chat_loop() startup:
client_id = _load_or_create_client_id()  # UUID persisted or generated per-process
# Pass client_id to all requests
```

### Confirmation Flow (Python Terminal)

When Python receives `task:pc_action` for `openFolder` or `openFile`:

```python
# In _handle_agentic_event() for task:pc_action:
action = data.get("action")  # "openFolder", "openFile", etc.
path = data.get("params", {}).get("path")

# For non-destructive actions, ask for confirmation:
if action in ("openFolder", "openFile"):
    prompt = f"Confirmar: abrir {Path(path).name}? [s/n] (5s): "
    confirmed = confirm_destructive(prompt, timeout=5)
    
    if confirmed:
        result = execute_pc_action(action, params, config)
        status = "confirmed"
    else:
        status = "denied"
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background HTTP connection polling | Custom polling loop | Python `threading` + urllib (already in use) | Proven pattern in confirm_destructive(); simpler than asyncio for MVP |
| SSE parsing | Regex/manual line splitting | Existing `parse_sse_chunk()` in chat.py | Already debugged and handles edge cases |
| Response streaming to multiple clients | Manual Socket management | Express Response.write() + Map | Built-in Express streaming with backpressure handling |
| Timeout handling for action dispatch | Custom timer loop | JavaScript `setTimeout()` (gateway), Python `time.time()` + `while` loop (Python) | Standard patterns in existing codebase |
| UUID generation | Custom hashing | `uuid.uuid4()` (Python), `crypto.randomUUID()` (Node) | Cryptographically sound, cross-platform |
| Configuration validation | Ad-hoc checks | Zod (gateway), Pydantic (Python) | Already integrated, prevents silent config errors |

**Key insight:** SSE dispatch is simpler than WS because it's unidirectional + POST-based ACK; no need for message framing or connection upgrade complexity.

## Common Pitfalls

### Pitfall 1: SSE Connection Held Too Long Without Proper Cleanup

**What goes wrong:** Python client closes ungracefully (Ctrl+C, crash), but gateway keeps SSE entry in `pythonSseClients` Map. Gateway tries to write to closed response → crash or silent failure.

**Why it happens:** Node.js doesn't automatically detect when TCP socket closes on the client side until attempting a write.

**How to avoid:** 
- Always attach `res.on('close')` handler to remove from Map immediately
- Use `try/catch` around `res.write()` with explicit cleanup
- Set heartbeat/keepalive pings every 30s to detect stale clients

**Warning signs:** 
- "EPIPE: broken pipe" errors in gateway logs
- `pythonSseClients` Map grows but never shrinks
- Python client reconnects repeatedly without Python-side success logs

### Pitfall 2: clientId Header Lost in Redirect or Proxy

**What goes wrong:** Python client sends `x-jarvis-client-id` to gateway, but reverse proxy (nginx) or redirect doesn't forward it → backend-ts receives empty clientId → request_file_action fails.

**Why it happens:** Custom headers sometimes stripped by proxies unless explicitly whitelisted.

**How to avoid:**
- Verify header is present in backend-ts (logging already at chat.ts L47)
- If behind proxy, add proxy rewrite rule: `proxy_pass_request_headers on;`
- Use `authorization-aware` pattern instead of custom header if proxy is untrusted

**Warning signs:**
- `request_file_action` logs "clientId vazio!"
- Works on localhost, fails on proxied URL
- Electron client works (sends clientId via WS), Python fails

### Pitfall 3: SSE Event Format Mismatch

**What goes wrong:** Gateway emits `task:pc_action` event, but format differs from what Python's `parse_sse_chunk()` expects → event silently dropped or malformed JSON parsed as error.

**Why it happens:** SSE format is strict — `event: \ndata: \n\n` with exact spacing. Missing newlines breaks the parser.

**How to avoid:**
- Use template: `event: task:pc_action\ndata: ${JSON.stringify(payload)}\n\n`
- Verify with: `res.write(event) && console.log('SSE sent')` (check logs)
- Test gateway SSE endpoint with curl: `curl "http://localhost:3000/api/actions/events?clientId=test"`

**Warning signs:**
- Python client connects to SSE but receives nothing
- Gateway logs show event was emitted but Python logs don't show handler called
- `parse_sse_chunk()` returns empty events list

### Pitfall 4: ACK Resolver Never Clears on Timeout

**What goes wrong:** Action times out (30s), resolver is deleted from `pendingAckResolvers`, but next request with same requestId hangs because resolver still exists (old code didn't delete).

**Why it happens:** Timeout handler deletes resolver, but success path tries to delete again → no error, but if code paths diverge, resolver can leak.

**How to avoid:**
- Always delete resolver BEFORE calling resolve/reject: `pendingAckResolvers.delete(requestId); resolve(ack);`
- Use pattern from existing ws-server.ts L70: `resolver(...); pendingAckResolvers.delete(...)`
- Verify timeout handler also deletes: action-dispatcher.ts L63 does it correctly

**Warning signs:**
- Requests start hanging after ~5-10 actions
- Memory usage climbs (resolvers accumulate)
- Logs show "No pending resolver for ACK — dropped"

### Pitfall 5: Python Confirmation Prompt Blocks Main Chat Loop

**What goes wrong:** User says "abrir downloads" → Python receives `task:pc_action` in SSE handler → confirms synchronously → prompt blocks until user responds → chat loop freezes.

**Why it happens:** `_handle_agentic_event()` is called directly from `_read_sse_stream()` loop, not in a separate thread.

**How to avoid:**
- Run confirmation in a background thread: `threading.Thread(target=_prompt_and_ack, ...).start()`
- Or: queue the event and process later (more complex)
- Set a short timeout (5s default, 10s max) so user doesn't wait forever

**Warning signs:**
- Python client appears frozen during PC action
- Terminal input('> ') doesn't respond to new commands while action pending
- Multiple SSE events pile up without processing

## Code Examples

### Gateway — Adding Python SSE Dispatcher

**File: `apps/gateway/src/lib/action-dispatcher.ts`**

After existing `clientConnections.get()` check, add Python SSE fallback:

```typescript
// Existing Electron WS check (L54-58)
const ws = clientConnections.get(req.clientId);
if (!ws || ws.readyState !== WebSocket.OPEN) {
  // NEW: Check Python SSE as fallback
  const pythonSse = pythonSseClients.get(req.clientId);
  if (!pythonSse) {
    throw new Error(`CLIENT_NOT_CONNECTED: no active connection for clientId=${req.clientId}`);
  }
  
  // PYTHON SSE PATH: Same ACK resolver setup, different emission channel
  const ack = await new Promise<ActionAck>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAckResolvers.delete(requestId);
      reject(new Error(`TIMEOUT: no ACK from Python after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    pendingAckResolvers.set(requestId, (incoming) => {
      clearTimeout(timer);
      resolve(incoming);
    });

    // Emit over SSE instead of WS
    const sseEvent = `event: task:pc_action\ndata: ${JSON.stringify({
      requestId,
      action: req.action,
      params: { path: req.path },
    })}\n\n`;
    
    pythonSse.write(sseEvent);
    logger.info({ clientId: req.clientId, requestId, via: 'SSE' }, 'action_request sent to Python');
  });
  
  // Rest of ACK handling is identical...
  // (lines 81-100 unchanged)
}
```

**File: `apps/gateway/src/lib/ws-server.ts`** — Add import and export for Python SSE Map:

```typescript
// Add near top with clientConnections
export const pythonSseClients = new Map<string, http.ServerResponse>();
```

### Gateway — New `/api/actions/events` SSE Endpoint

**File: `apps/gateway/src/routes/actions-events.ts` (new file)**

```typescript
import { Router, type Request, type Response } from 'express';
import { pythonSseClients } from '../lib/ws-server.js';
import { logger } from '../lib/logger.js';

export const actionsEventsRouter = Router();

actionsEventsRouter.get('/actions/events', (req: Request, res: Response) => {
  const clientId = req.query.clientId as string;
  
  if (!clientId || typeof clientId !== 'string' || clientId.length === 0) {
    res.status(400).json({ error: 'clientId query param required' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Store reference for action dispatch
  const old = pythonSseClients.get(clientId);
  if (old) {
    old.end();  // Close stale connection
  }
  pythonSseClients.set(clientId, res);
  logger.info({ clientId, total: pythonSseClients.size }, 'Python SSE client connected');

  // Handle client disconnect
  res.on('close', () => {
    pythonSseClients.delete(clientId);
    logger.info({ clientId, total: pythonSseClients.size }, 'Python SSE client disconnected');
  });

  res.on('error', (err) => {
    logger.error({ clientId, error: err }, 'Python SSE error');
    pythonSseClients.delete(clientId);
  });

  // Optional: send heartbeat every 30s to detect stale clients
  const heartbeat = setInterval(() => {
    if (!pythonSseClients.has(clientId)) {
      clearInterval(heartbeat);
      return;
    }
    res.write(':heartbeat\n\n');
  }, 30_000);
});
```

**File: `apps/gateway/src/app.ts`** — Register new router:

```typescript
import { actionsEventsRouter } from './routes/actions-events.js';

// In createApp():
app.use('/api', actionsEventsRouter);  // Must come BEFORE errorHandler
```

### Gateway — New `/api/actions/ack` Endpoint

**File: `apps/gateway/src/routes/actions-ack.ts` (new file)**

```typescript
import { Router, type Request, type Response } from 'express';
import { pendingAckResolvers } from '../lib/ws-server.js';
import { z } from 'zod';
import { logger } from '../lib/logger.js';

export const actionsAckRouter = Router();

const AckPayloadSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(['confirmed', 'denied', 'timeout']),
  content: z.string().optional(),
});

actionsAckRouter.post('/actions/ack', (req: Request, res: Response) => {
  const parsed = AckPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, '/api/actions/ack: invalid payload');
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const { requestId, status, content } = parsed.data;
  const resolver = pendingAckResolvers.get(requestId);
  
  if (!resolver) {
    logger.warn({ requestId }, '/api/actions/ack: no pending resolver');
    res.status(404).json({ error: 'Request not found or already processed' });
    return;
  }

  pendingAckResolvers.delete(requestId);
  resolver({ type: 'action_ack', requestId, status, content });
  logger.info({ requestId, status }, 'action_ack resolved from Python');
  
  res.json({ ok: true });
});
```

**File: `apps/gateway/src/app.ts`** — Register:

```typescript
import { actionsAckRouter } from './routes/actions-ack.js';

// In createApp():
app.use('/api', actionsAckRouter);
```

### Python Client — Generate and Send clientId

**File: `apps/desktop-py/src/jarvis_desktop/__main__.py`**

Add near boot before chat_loop():

```python
def _load_or_create_client_id() -> str:
    """Load clientId from ~/.jarvis/client_id or generate and persist new one."""
    import uuid
    client_id_file = Path.home() / ".jarvis" / "client_id"
    
    if client_id_file.exists():
        client_id = client_id_file.read_text().strip()
        if client_id:
            return client_id
    
    # Generate new UUID
    client_id = str(uuid.uuid4())
    client_id_file.parent.mkdir(parents=True, exist_ok=True)
    client_id_file.write_text(client_id)
    return client_id

# In main():
# Step 6.5: Load/create client ID
client_id = _load_or_create_client_id()
config.client_id = client_id  # Store on config object
c.print(f"[Config] Client ID   : {client_id}")
```

### Python Client — Send Header on All Requests

**File: `apps/desktop-py/src/jarvis_desktop/chat.py`**

Update `build_request_headers()` to include clientId:

```python
def build_request_headers(api_key: str, client_id: str = "") -> dict:
    """Build HTTP headers for SSE request.
    
    Returns Authorization and x-jarvis-client-id headers if provided.
    """
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if client_id:
        headers["x-jarvis-client-id"] = client_id
    return headers

# Update all callers:
# In _read_sse_stream():
headers = build_request_headers(config.api_key, getattr(config, 'client_id', ''))

# In _post_task_resume():
headers = {"Content-Type": "application/json", **build_request_headers(config.api_key, getattr(config, 'client_id', ''))}
```

### Python Client — Boot SSE Listener Thread

**File: `apps/desktop-py/src/jarvis_desktop/sse_listener.py` (new file)**

```python
"""Background SSE listener for Python PC control dispatch.

Connects to /api/actions/events on gateway and handles task:pc_action events.
Runs in a daemon thread separate from main chat loop.
"""
import json
import threading
import time
import urllib.error
import urllib.request
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from jarvis_desktop.config import JarvisConfig

_listener_thread = None
_stop_event = threading.Event()

def start_sse_listener(config: "JarvisConfig", client_id: str) -> None:
    """Start background SSE listener thread."""
    global _listener_thread
    if _listener_thread and _listener_thread.is_alive():
        return
    
    _stop_event.clear()
    _listener_thread = threading.Thread(
        target=_sse_loop,
        args=(config, client_id),
        daemon=True,
        name="SSEListener",
    )
    _listener_thread.start()

def stop_sse_listener() -> None:
    """Signal listener to stop and wait for thread exit."""
    global _listener_thread
    _stop_event.set()
    if _listener_thread and _listener_thread.is_alive():
        _listener_thread.join(timeout=5)

def _sse_loop(config: "JarvisConfig", client_id: str) -> None:
    """Main SSE listener loop — reconnects on failure with backoff."""
    from jarvis_desktop.chat import parse_sse_chunk, _handle_agentic_event
    
    backoff = 1
    while not _stop_event.is_set():
        try:
            url = config.gateway_url.rstrip('/') + f'/api/actions/events?clientId={client_id}'
            headers = {'x-jarvis-client-id': client_id}
            
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=300) as response:
                backoff = 1  # Reset backoff on successful connection
                buffer = ""
                
                while not _stop_event.is_set():
                    chunk = response.read(1024).decode('utf-8')
                    if not chunk:
                        break
                    
                    events, buffer = parse_sse_chunk(chunk, buffer)
                    for event_type, payload in events:
                        if event_type == 'task:pc_action':
                            # Run confirmation + action in thread to avoid blocking
                            threading.Thread(
                                target=lambda: _handle_agentic_event(event_type, payload, config),
                                daemon=True,
                            ).start()
        
        except urllib.error.URLError as exc:
            if not _stop_event.is_set():
                _console().print(f"[SSE] Connection lost: {exc.reason} — reconnecting in {backoff}s...")
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)  # Exponential with 30s cap
        except Exception as exc:
            if not _stop_event.is_set():
                _console().print(f"[SSE] Error: {exc} — reconnecting in {backoff}s...")
                time.sleep(backoff)

def _console():
    """Lazy console accessor."""
    from jarvis_desktop import ui
    return ui.get_console()
```

**File: `apps/desktop-py/src/jarvis_desktop/__main__.py`** — Boot listener:

```python
# Step 7: Boot SSE listener for PC control dispatch
from jarvis_desktop.sse_listener import start_sse_listener
start_sse_listener(config, client_id)

# Then chat_loop as before
chat_loop(config)
```

### Python Client — Confirmation in _handle_agentic_event

**File: `apps/desktop-py/src/jarvis_desktop/chat.py`** — Update task:pc_action handler:

```python
elif event_type == "task:pc_action":
    from jarvis_desktop import pc_control
    from jarvis_desktop import ui as _ui
    
    action = data.get("action", "")
    params = data.get("params", {})
    request_id = data.get("requestId", "")
    
    # Ask for confirmation before executing
    if action in ("openFolder", "openFile"):
        path_display = params.get("path", "?")
        action_label = "abrir pasta" if action == "openFolder" else "abrir arquivo"
        prompt = f"Confirmar: {action_label} {Path(path_display).name}? [s/n] (5s): "
        confirmed = confirm_destructive(prompt, timeout=5)
        status = "confirmed" if confirmed else "denied"
    else:
        # closeFile, viewContent don't need confirmation
        confirmed = True
        status = "confirmed"
    
    # Execute if confirmed
    if confirmed:
        _ui.set_state("executing_pc_action")
        try:
            result = pc_control.execute_pc_action(action, params, config)
            if result.get("result") == "ok":
                content = result.get("content")
            else:
                status = "denied"
                content = result.get("error", "Execução falhou")
        finally:
            _ui.set_state("idle")
    else:
        content = "Ação recusada pelo usuário"
    
    # POST ACK back to gateway
    _post_action_ack(config, request_id, status, content)
```

**New helper in chat.py:**

```python
def _post_action_ack(config: JarvisConfig, request_id: str, status: str, content: str = "") -> None:
    """POST action ACK to /api/actions/ack."""
    url = config.gateway_url.rstrip("/") + f"/api/actions/ack"
    body = {
        "requestId": request_id,
        "status": status,
    }
    if content:
        body["content"] = content
    
    request_bytes = json.dumps(body).encode()
    headers = {
        "Content-Type": "application/json",
        **build_request_headers(config.api_key, getattr(config, 'client_id', ''))
    }
    try:
        req = urllib.request.Request(url, data=request_bytes, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=10) as _:
            pass  # Silent success
    except Exception as exc:
        _console().print(f"[erro ao enviar ACK: {exc}]")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Electron-only PC control | Dual Electron WS + Python SSE | Phase 84 | Enables Python client to use local PC tools |
| One-off confirmations in pc_control | Pre-execution confirmation prompts | Phase 84 | User intentional before destructive actions |
| No client registration | clientId header + SSE registration | Phase 84 | Gateway knows which client to dispatch to |
| WebSocket-only dispatch | WS primary, SSE fallback | Phase 84 | Simplifies Python integration (no WS upgrade) |

## Open Questions

1. **Persistent vs. In-Memory clientId?**
   - What we know: In-memory simpler, persistent survives restart
   - What's unclear: User preference for identification across sessions
   - Recommendation: Start with persistent (D-02 allows discretion) — write to `~/.jarvis/client_id`, survives reinstalls if home persisted

2. **Heartbeat vs. Idle Detection?**
   - What we know: Heartbeat (`:` comment line) every 30s detects stale clients
   - What's unclear: Is 30s interval too aggressive? Risk of noise?
   - Recommendation: Implement with 30s default, skip if network bandwidth critical — heartbeat is optional per SSE spec

3. **Confirmation Timeout — 5s or 10s?**
   - What we know: D-05 specifies 5s for open actions, 10s for destructive; existing confirm_destructive already 10s
   - What's unclear: Is 5s enough for user to respond to terminal prompt?
   - Recommendation: Default 5s, auto-extend on first voice input detected to prevent race conditions

4. **How to prevent race: clientId in header vs. SSE query param?**
   - What we know: Gateway already reads `x-jarvis-client-id` from chat header (chat.ts L47)
   - What's unclear: Does SSE listener need it in both places? Or just query param for auth?
   - Recommendation: Use query param for SSE URL auth (required), also send header for consistency with POST requests

5. **Error recovery in SSE listener — restart gateway vs. restart Python client?**
   - What we know: SSE listener should reconnect transparently on network drop
   - What's unclear: What if gateway crashes and comes back up? Will Python find it?
   - Recommendation: Simple exponential backoff (1s, 2s, 4s... 30s max) — Python will find it when gateway restarts

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js http/stream | Gateway SSE endpoint | ✓ | Built-in | — |
| Express framework | Gateway router setup | ✓ | 4.21+ | — |
| Python uuid module | clientId generation | ✓ | stdlib | — |
| Python threading | SSE listener thread | ✓ | stdlib | — |
| Python urllib | HTTP requests with headers | ✓ | stdlib | — |
| Gateway running at startup | Python client registration | ✓ | Required | Chat loop exits if unhealthy |

**Missing dependencies with no fallback:**
- None — all dependencies are stdlib or already present

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (Python) + vitest (Gateway) — existing |
| Config file | `apps/gateway/vitest.config.ts` + `apps/desktop-py/pyproject.toml` |
| Quick run command | `pnpm test:gateway --run` (SSE endpoint tests) + `pytest tests/test_sse_listener.py -x` (Python client tests) |
| Full suite command | `pnpm test` (all) + `pytest --cov` (Python with coverage) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-84-01 | Python SSE connects to gateway on boot | integration | `pytest tests/test_sse_listener.py::test_sse_connection_established -x` | ❌ Wave 0 |
| REQ-84-02 | x-jarvis-client-id header sent on all requests | unit | `pytest tests/test_chat.py::test_build_request_headers_includes_client_id -x` | ❌ Wave 0 |
| REQ-84-03 | Gateway dispatches to Python SSE when Electron WS unavailable | integration | `pytest tests/test_action_dispatcher_python.py -x` | ❌ Wave 0 |
| REQ-84-04 | Python asks confirmation before open_folder/openFile | unit | `pytest tests/test_pc_action_confirmation.py::test_confirm_destructive_timeout -x` | ✅ Exists (Phase 79) |
| REQ-84-05 | POST /api/actions/ack resolves pending resolver | integration | `pnpm test:gateway --run tests/actions-ack.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:gateway --run tests/actions-ack.test.ts` + `pytest tests/test_sse_listener.py::test_sse_connection -x` (< 10s)
- **Per wave merge:** Full `pnpm test` + `pytest --cov` (< 2 min)
- **Phase gate:** Full suite green + manual smoke test (Python client connects, executes openFolder on gateway with Electron disconnected)

### Wave 0 Gaps
- [ ] `tests/test_sse_listener.py` — SSE listener boot, reconnection logic, event dispatch
- [ ] `apps/gateway/src/routes/actions-events.ts` test suite (mock clientId, verify pythonSseClients Map)
- [ ] `apps/gateway/src/routes/actions-ack.ts` test suite (verify resolver resolution)
- [ ] `tests/test_chat.py::test_build_request_headers_includes_client_id` — header injection
- [ ] `tests/test_action_dispatcher_python.py` — fallback dispatch logic when WS unavailable

*(Existing confirm_destructive tests from Phase 79 cover timeout + acceptance logic; reuse those mocks for Phase 84)*

## Sources

### Primary (HIGH confidence)
- **CONTEXT.md (Phase 84):** Decisions D-01 through D-06 locked; Claude's Discretion defined; canonical refs to gateway/backend-ts/Python client code
- **Code inspection:** 
  - `apps/gateway/src/lib/action-dispatcher.ts` — existing WS dispatch pattern (L60-77)
  - `apps/gateway/src/lib/ws-server.ts` — `clientConnections` Map and `pendingAckResolvers` pattern (L6-7)
  - `apps/backend-ts/src/routes/chat.ts` — clientId header extraction (L47)
  - `apps/desktop-py/src/jarvis_desktop/chat.py` — SSE parsing and event handling (L50-109, L174-298)
  - `apps/desktop-py/src/jarvis_desktop/pc_control.py` — existing implementations (open_folder, open_file, close_app, read_file)

### Secondary (MEDIUM confidence)
- **Node.js SSE pattern:** Standard `response.write(data)` + `Content-Type: text/event-stream` header for server-sent events
- **Python urllib pattern:** Already used in chat.py (L164) for streaming requests with custom headers
- **Express Router:** Standard pattern used throughout gateway (health.ts, chat.ts, dispatch-action.ts)

### Tertiary (project-specific, HIGH confidence)
- **Existing confirmation pattern:** `pc_control.confirm_destructive()` (Phase 79) with timeout polling — reuse for PC action confirmation
- **Existing audit logging:** `_audit_log()` in pc_control.py — no changes needed for Phase 84 (actions still logged)
- **Existing error handling:** backend-ts errorHandler middleware (Phase 82) — ACK endpoint errors auto-handled

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Node.js http/Express/Python stdlib all standard
- Architecture: HIGH — pattern mirrors existing Electron WS dispatch exactly
- Pitfalls: HIGH — based on common SSE/async pitfalls + project-specific patterns from Phase 79-83
- Code locations: HIGH — all files identified and inspected

**Research date:** 2026-05-28
**Valid until:** 2026-06-04 (7 days — stable patterns, unlikely to change unless upstream gateway refactored)

**Confidence assessment:**
- Implementation is straightforward replication of existing WS pattern but with SSE instead
- All required code patterns already exist in project
- No external dependencies needed
- Risk: SSE client disconnect handling must be robust (pitfall #1) — test with network interruption
