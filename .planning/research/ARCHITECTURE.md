# Architecture Integration: v3.0 Agentic JARVIS

**Project:** JARVIS v3.0 (Electron + TypeScript desktop assistant)  
**Researched:** 2026-05-07  
**Overall Confidence:** HIGH (core patterns established; new integrations fit existing structure)

## Executive Summary

v3.0 adds 6 major capabilities to existing Electron + Express + LangGraph architecture. No breaking changes; all integrate via patterns proven in v2.3:

1. **MCP Client** — JARVIS connects to external MCP servers (GitHub, Notion, filesystem); tools wired into ReAct agent
2. **MCP Server** — JARVIS exposes voice, PC control, memory as MCP services to Claude Desktop, Cursor, Windsurf
3. **Kokoro Offline TTS** — Replaces Murf.ai fallback; fully local neural TTS in backend-ts + Electron
4. **Vision Pipeline TS** — TypeScript rebuild of ScreenAnalyzer; desktopCapturer → sharp resize → LangChain vision
5. **Agentic Multi-Step** — LangGraph ReAct loop enhanced for planning + reflection; existing checkpointer reused
6. **Proactive Scheduling** — node-cron (scheduled tasks) + chokidar (file watchers) → agent background loop

**Key findings:**

1. **MCP runs in backend-ts** — Single process encapsulates LLM, tools, state; Electron calls backend via HTTP. stdio transport if Claude Desktop integration; HTTP Streamable deferred to v3.1.

2. **No new long-lived processes** — Avoid spawning external MCP servers in Electron main. Use child_process in backend-ts with lifecycle management. Simplifies IPC and state synchronization.

3. **Vision pipeline** — Electron main captures (already does), sends screenshot as base64 to backend-ts for vision LLM inference. Existing precedent: PC tools architecture (backend generates payloads, Electron executes).

4. **Kokoro TTS in backend-ts** — Neural model runs where LLM lives. Electron still calls TTS via HTTP (voiceHandler.ts unchanged). Offline by default; Murf.ai fallback on error or user preference via flag.

5. **Proactive tasks** — Use same ChatSession + memory as reactive chat. Schedule via node-cron in backend Electron loop (separate from Express server). Fire-and-forget with p-queue throttling to prevent system overload.

6. **LangGraph state machine** — Existing checkpointer + SQLite already proven (v1.8 Phase 35–38). Multi-step agentic tasks reuse same infrastructure; no new state management needed.

**Architecture impact:** Zero new external services. New components fit established layers:
- **Backend-ts:** Add MCP server facade, Kokoro TTS provider, proactive task scheduler
- **Electron main:** Add proactive task trigger loop (setInterval / EventEmitter)
- **Express routes:** Add `/api/tts`, `/internal/proactive-task` (or fire-and-forget via IPC)
- **Settings UI:** Add flags for Kokoro, MCP server, scheduled tasks

**Suggested build order:**
1. **Phase 1:** Validate Kokoro.js stability on Windows/macOS/Linux (soak test 2h)
2. **Phases 2–3:** Implement MCP server (stdio) + register tools + test with Claude Desktop
3. **Phases 4–5:** Add MCP client (connect to external servers)
4. **Phases 6–7:** Vision pipeline TS port (desktopCapturer → sharp → vision LLM)
5. **Phases 8–9:** Multi-step agentic (ReAct reflection loops, task checkpointer)
6. **Phases 10–11:** Proactive scheduling (node-cron, chokidar, IPC triggers)

**Total estimated effort:** 8–10 weeks (v3.0 ship target Q2/Q3 2026)

---

## Component Boundaries & Data Flow

### Current Architecture (v2.3)

```
┌─────────────────────────────────────────────────────────────────┐
│ Electron Main (voiceHandler, actions, tray, settings, hotkey)   │
│                                                                  │
│  IPC Handlers:                                                   │
│  ├─ sendAudioAndHandle → desktopCapturer (screen capture)      │
│  ├─ exec-action → ActionExecutor (PC tools)                     │
│  ├─ tts-generate → HTTP call to backend-ts                      │
│  ├─ recall-memory → HTTP call to backend-ts                     │
│  └─ proactive task loop (NEW v3.0)                              │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   │ HTTP (Express 5, port 8001)
                   │ SSE (chat/stream), JSON (tool calls, memory)
                   ↓
┌──────────────────────────────────────────────────────────────────┐
│ Backend-ts (Express 5, port 8001)                                │
│                                                                  │
│  Routes:                                                         │
│  ├─ POST /chat → ChatSession.send() → Agent (ReAct)            │
│  ├─ GET /chat/stream → SSE streaming                           │
│  ├─ POST /tool-calls → Tool execution audit                     │
│  ├─ POST /api/tts → Kokoro TTS generation (NEW v3.0)           │
│  ├─ POST /api/mcp-tools → MCP tool registration (NEW v3.0)     │
│  ├─ POST /internal/proactive-task → Background task exec (NEW)  │
│  └─ (MCP stdio server in backend process, NEW v3.0)            │
│                                                                  │
│  Core Services:                                                  │
│  ├─ LLM Factory (multi-provider)                                │
│  ├─ ChatSession (ReAct agent, tools, memory)                   │
│  ├─ MemoryManager (SQLite + ChromaDB)                          │
│  ├─ VisionAnalyzer (sharp resize + LLM inference) (NEW v3.0)   │
│  └─ MCPServer (stdio transport) (NEW v3.0)                     │
│  └─ MCPClient (external server connections) (NEW v3.0)         │
│  └─ ProactiveScheduler (node-cron + task queue) (NEW v3.0)     │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   │ HTTP (Express 5, port 3000)
                   │ (Gateway proxy)
                   ↓
┌──────────────────────────────────────────────────────────────────┐
│ Gateway (Express 5, port 3000)                                   │
│                                                                  │
│  Routes:                                                         │
│  ├─ POST /api/chat → proxy to backend /chat                     │
│  ├─ GET /api/chat/stream → proxy SSE                           │
│  ├─ GET /api/health → check backend + ChromaDB                  │
│  ├─ POST /api/tts → proxy to backend /api/tts (NEW v3.0)       │
│  ├─ POST /api/vision → proxy to backend /api/vision (NEW v3.0) │
│  ├─ (MCP stdio not proxied — Electron only)                    │
│  └─ (Proactive tasks not proxied — backend only)               │
└──────────────────────────────────────────────────────────────────┘
```

### New Components in v3.0

#### 1. MCP Server (backend-ts)

**Location:** `apps/backend-ts/src/mcp/server.ts`

**Responsibility:**
- Register JARVIS tools as MCP protocol tools
- Accept stdio connections from Claude Desktop, Cursor, Windsurf
- Proxy tool calls to existing ChatSession.agent tools
- Handle resource/prompt registration (optional, defer to v3.1)

**Data flow:**
```
Claude Desktop (stdio parent process)
  ↓ stdio transport (JSON-RPC)
  ↓ MCP Server in backend-ts
  ├─ List tools → returns [recall_memory, list_files, execute_tool, ...]
  ├─ Call tool → invoke ChatSession tool
  └─ Tool result → return to Claude
```

**Integration point:** `createReactAgent(llm, tools)` already has tools array. MCP server wraps same tools for external consumers.

**Gotcha:** Stdio transport requires parent process to manage lifecycle. If running backend-ts as daemon (systemd/PM2), MCP parent must be Claude Desktop (not practical). **Decision:** MCP server lives in Express backend but is stdio-only for v3.0. HTTP Streamable transport deferred to v3.1 when containerizing (Docker).

#### 2. MCP Client (backend-ts)

**Location:** `apps/backend-ts/src/mcp/client.ts`

**Responsibility:**
- Connect to external MCP servers (GitHub, Notion, Filesystem via MCP)
- Convert MCP tools to LangChain StructuredTool
- Add tools to ChatSession.agent dynamically
- Manage process lifecycle (stdio child processes)

**Data flow:**
```
External MCP Server (GitHub, Notion, Filesystem)
  ↓ stdio transport
  ↓ MCP Client in backend-ts
  ├─ List tools from external server
  ├─ Wrap as LangChain tools
  └─ Inject into ChatSession.agent
```

**Integration point:** `createAllPcTools()` returns LangChain tools. MCP client adds to same array.

**Gotcha — Process management:** Each external MCP server = subprocess. Must spawn on backend startup, manage graceful shutdown, restart on crash. Use `p-queue` for concurrency limits (already in stack, v2.3 Phase 61).

#### 3. Kokoro TTS Provider (backend-ts + Electron)

**Location:** `apps/backend-ts/src/voice/tts-providers/kokoro.ts`

**Responsibility:**
- Load Kokoro model on first use (~350MB, downloaded to `~/.jarvis/models`)
- Generate WAV from text (onnxruntime-node inference)
- Return base64 audio to Electron

**Data flow:**
```
Electron voiceHandler.ts
  ↓ HTTP POST /api/tts
  ↓ { text: "...", provider: "kokoro", fallback: "murf" }
  ↓
Backend TTS router
  ├─ try: kokoro.generate(text)
  ├─ catch: fallback to Murf.ai (requires API key)
  └─ return base64 audio
```

**Config flag:**
```typescript
// .env
USE_KOKORO_TTS=true          // Default: offline
MURF_API_KEY=...             // Fallback only
```

**Gotcha — Model download:** First request with Kokoro will stall (model downloading). Add toast "Downloading TTS model (~350MB)" with progress. Reuse existing progress UI from Whisper model downloads (Phase 50).

**Privacy trade-off:** Kokoro offline by default (privacy-first); Murf.ai as explicit user choice via Settings flag.

#### 4. Vision Pipeline (Electron → backend-ts)

**Location:** 
- `apps/desktop/src/main/vision/screen-analyzer.ts` (Electron capture)
- `apps/backend-ts/src/vision/analyzer.ts` (LLM inference)

**Responsibility:**
- Electron desktopCapturer → PNG
- Sharp resize to 1080p max (cost optimization)
- Backend calls Claude vision API
- Return analysis + potential tool calls

**Data flow:**
```
Electron voiceHandler.ts (when user asks "analyze screen")
  ↓ desktopCapturer.getSources()
  ↓ Capture main display
  ↓ HTTP POST /api/vision
  ├─ { image: base64PNG, task: "analyze this" }
  ↓
Backend vision router
  ├─ sharp.resize(image, { max: 1080 })
  ├─ ChatOpenAI / ChatAnthropic with vision capability
  ├─ LLM analyzes screenshot
  └─ Return { analysis: "...", tool_calls?: [...] }
  ↓
Electron receives response
  ├─ Display analysis in chat
  ├─ Execute tool_calls if any (e.g., "click on X")
  └─ Show visual feedback on screen
```

**Integration point:** Existing precedent — backend PC tools generate payloads (e.g., "click at 640,480"), Electron executes. Vision uses same pattern.

**Gotcha — Rate limiting:** Vision API calls are expensive. Add Settings slider:
```typescript
VISION_CHECK_INTERVAL: 5000–60000ms (default 30000)
```

Prevent user from asking "analyze screen every 2 seconds" without explicit confirmation.

#### 5. Agentic Multi-Step (LangGraph enhancement)

**Location:** `apps/backend-ts/src/agent/task-executor.ts` (new)

**Responsibility:**
- Plan decomposition: "Organize downloads by date" → ["list files", "analyze dates", "create folders", "move files"]
- Execute in ReAct loop with reflection nodes
- Checkpoint state at each step (SQLite, already exists from v1.8)
- Resume on interrupt (browser close, Electron restart)

**Data flow:**
```
User: "Summarize Downloads, organize by date, flag large files"
  ↓ ChatSession.send() → Agent
  ↓
Agent planning node:
  └─ Invoke LLM with Zod schema:
     {
       goal: "...",
       steps: ["step 1", "step 2", ...],
       context: "..."
     }
  ↓
Agent execution nodes (parallel where possible):
  ├─ Tool: list_files("/Downloads")
  ├─ Tool: identify_large_files()
  └─ Tool: date_analysis()
  ↓
Agent reflection node:
  ├─ Did we complete all steps?
  ├─ Any errors?
  ├─ Next steps?
  ↓
Loop or exit
```

**Integration point:** `createReactAgent(llm, tools)` already returns agent with `.invoke()`. Wrap in new `TaskExecutor` class that adds planning + reflection nodes.

**Gotcha — Token budgets:** Multi-step agentic burns tokens fast:
- Plan: 1–2K tokens
- Execute (per tool): 2–5K tokens
- Reflect: 1K tokens
- **Total:** 5–10K tokens per task

Add warning in Settings for expensive models (Llama 7B vs Claude 3.5).

**Checkpoint safety:** LangGraph checkpointer (v1.8 Phase 35) already persists agent state. Task executor reuses same mechanism; no new state management.

#### 6. Proactive Scheduler (Electron + backend-ts)

**Location:**
- `apps/desktop/src/main/proactive/scheduler.ts` (Electron trigger loop)
- `apps/backend-ts/src/proactive/task-queue.ts` (backend executor)

**Responsibility:**
- Schedule daily tasks (9am standup: "What's on my calendar?")
- Watch file system (Downloads folder: new file → "Should I organize this?")
- Run background rollups (nightly: summarization checkpoint)
- Queue with p-queue to prevent system overload

**Data flow:**

**Scheduled tasks (node-cron):**
```
Electron background loop:
  ├─ cron.schedule('0 9 * * *', async () => {
  │    ipcRenderer.invoke('run-proactive-task', 'daily-standup')
  │  })
  └─ ipcMain on('run-proactive-task', async (taskId) => {
       const result = await backend.executeProactiveTask(taskId)
       // Fire-and-forget: no toast/await
     })
```

**Event-driven tasks (chokidar):**
```
Backend file watcher:
  ├─ chokidar.watch('/Users/*/Downloads')
  └─ on('add', (path) => {
       proactiveQueue.add(async () => {
         const analysis = await agent.invoke('new file: ' + path)
         // Optional: toast user if action needed
       })
     })
```

**Integration point:** Same `ChatSession.send()` as reactive chat. Proactive tasks use same memory, tools, agent.

**Gotcha — Never block:** Proactive tasks are fire-and-forget. Use `p-queue` with reasonable concurrency (default: 1–2) to prevent flooding LLM with parallel requests.

---

## Modified Components

### Backend-ts `app.ts` (Express routes)

**Current (v2.3):**
```typescript
app.use("/", healthRouter);
app.use("/", createChatRouter(session, lock));
app.use("/", createToolCallsRouter(toolLogger));
app.use("/internal", actionsLogRouter);
```

**New (v3.0):**
```typescript
app.use("/", healthRouter);
app.use("/", createChatRouter(session, lock));
app.use("/", createToolCallsRouter(toolLogger));
app.use("/api", createVisionRouter(session));        // NEW
app.use("/api", createTtsRouter());                  // NEW
app.use("/internal", actionsLogRouter);
app.use("/internal", createProactiveTaskRouter(session, queue));  // NEW
// MCP stdio server runs in separate handler, not as Express route
```

### Backend-ts `ChatSession` (tool injection)

**Current (v2.3):**
```typescript
const tools = [
  createRecallMemoryTool(memory),
  createRequestFileActionTool(clientId),
  ...createAllPcTools(),  // 9 tools
];

const agent = createReactAgent(llm, tools);
```

**New (v3.0):**
```typescript
const tools = [
  createRecallMemoryTool(memory),
  createRequestFileActionTool(clientId),
  ...createAllPcTools(),
  ...(mcpClient ? await mcpClient.getTools() : []),  // NEW: MCP external tools
];

const agent = createReactAgent(llm, tools);
```

### Electron voiceHandler.ts (new routes)

**Current (v2.3):**
```typescript
const audioResponse = await axios.post<{ text: string }>(
  `${backendUrl}/chat/audio`,
  formData
);
```

**New (v3.0 — no HTTP route, use IPC instead):**
```typescript
// STT still local via whisper.cpp (unchanged)
// TTS now via HTTP to /api/tts
const ttsResponse = await axios.post<{ audio: string }>(
  `${backendUrl}/api/tts`,
  { text, provider: 'kokoro', fallback: 'murf' }
);

// Vision: new HTTP route (if user asks "analyze screen")
const visionResponse = await axios.post<{ analysis: string }>(
  `${backendUrl}/api/vision`,
  { image: base64, task: 'analyze' }
);
```

### Gateway `app.ts` (new proxy routes)

**Current (v2.3):**
```typescript
app.use("/api", chatRouter);
app.use("/api", healthRouter);
app.use("/internal", dispatchActionRouter);
```

**New (v3.0):**
```typescript
app.use("/api", chatRouter);
app.use("/api", healthRouter);
app.use("/api", createVisionRouter());       // NEW: proxy to backend /api/vision
app.use("/api", createTtsRouter());          // NEW: proxy to backend /api/tts
app.use("/internal", dispatchActionRouter);
// MCP stdio not proxied (Electron direct connection to backend)
// Proactive tasks not proxied (backend internal)
```

### Electron Settings UI

**New toggles/dropdowns:**

```typescript
// TTS Provider (extended from v2.3)
<Select label="TTS Provider">
  <Option value="kokoro">Kokoro (offline, local)</Option>
  <Option value="murf">Murf.ai (cloud, fallback)</Option>
  <Option value="elevenlabs">ElevenLabs (cloud)</Option>
</Select>

// Kokoro privacy settings
<Checkbox>Use Kokoro offline first (fallback to Murf on error)</Checkbox>
<Slider label="Vision check interval (ms)" min={5000} max={60000} default={30000} />

// Proactive tasks (new in v3.0)
<Checkbox>Enable proactive scheduling (standup, file watch)</Checkbox>
<Checkbox>Enable daily standup at 9am</Checkbox>
<Checkbox>Enable Downloads file watcher</Checkbox>

// MCP configuration (new in v3.0)
<Checkbox>Enable MCP server (expose tools to Claude Desktop)</Checkbox>
<TextInput label="MCP external servers (comma-separated paths)" />
```

---

## Data Flow Diagrams

### 1. MCP Server Integration

```
┌─────────────────────────────┐
│   Claude Desktop (stdio)    │
│   Cursor (stdio)            │
│   Windsurf (stdio)          │
└──────────────┬──────────────┘
               │ JSON-RPC (stdio)
               ↓
┌──────────────────────────────────────────┐
│ Backend-ts Process                       │
│                                          │
│  MCP Server (stdio transport)            │
│  ├─ ListToolsRequest                     │
│  │  └─ Returns: [recall_memory, ...]     │
│  │                                       │
│  ├─ CallToolRequest (e.g. recall_memory) │
│  │  └─ Invoke ChatSession tool           │
│  │  └─ Return result                     │
│  └─ Message: JSON-RPC response           │
│                                          │
│  ChatSession (same agent as REST API)    │
│  ├─ Tools: recall_memory, list_files     │
│  ├─ Memory: MemoryManager                │
│  └─ LLM: multi-provider (Claude, GPT, ..)│
└──────────────────────────────────────────┘
```

### 2. Vision Analysis Flow

```
User: "What's on the screen?"
       ↓
Electron (voiceHandler.ts)
  ├─ desktopCapturer.getSources()
  ├─ Create ImageBitmap from display
  ├─ HTTP POST /api/vision
  │    { image: base64PNG, task: "..." }
  │
Backend (vision router)
  ├─ Receive base64
  ├─ sharp.resize(1080p max)
  ├─ ChatOpenAI / ChatAnthropic
  │    with vision capability
  ├─ LLM: "I see a web browser with..."
  │
Response: { analysis, tool_calls? }
  │
Electron
  ├─ Display: "I see a web browser..."
  ├─ Execute tool_calls if any
  └─ Orb state: responding → idle
```

### 3. Proactive Task Flow

```
Scheduler (node-cron in Electron):
  ├─ 9am: trigger 'daily-standup'
  │
Proactive queue (in backend-ts):
  ├─ Get next task
  ├─ ChatSession.send('daily-standup', memory context)
  ├─ LLM generates: "You have 3 meetings today..."
  └─ (Optional) Toast user: result summary
```

---

## Integration Checklist

### Phase 1: Kokoro Validation

- [ ] Install kokoro-js@1.2.1, onnxruntime-node
- [ ] Test model download (verify ~350MB)
- [ ] Soak test: generate 100 TTS utterances on Windows/macOS/Linux
- [ ] Measure latency: target <1s per 100 chars
- [ ] Verify fallback: if kokoro-js crashes, Murf.ai handles gracefully
- [ ] Settings flag: `USE_KOKORO_TTS` with UI toggle
- [ ] Toast feedback: "Downloading TTS model" with progress

### Phase 2–3: MCP Server Implementation

- [ ] Scaffold `apps/backend-ts/src/mcp/server.ts`
- [ ] Register tools: recall_memory, list_files, execute_tool, adjust_volume, ...
- [ ] Test with Claude Desktop (stdio connection)
- [ ] Verify tool calls round-trip through ChatSession.agent
- [ ] Add to gateway as internal endpoint (not proxied)
- [ ] Settings UI: enable/disable MCP server

### Phase 4–5: MCP Client Implementation

- [ ] Scaffold `apps/backend-ts/src/mcp/client.ts`
- [ ] Connect to 1 external server (GitHub MCP) as test
- [ ] Wrap external tools as LangChain StructuredTool
- [ ] Inject into ChatSession.agent
- [ ] Test multi-tool agentic flow (recall + GitHub search + file op)
- [ ] Process lifecycle: spawn on boot, shutdown gracefully
- [ ] Error handling: external server unreachable → degrade gracefully

### Phase 6–7: Vision Pipeline TS

- [ ] Implement Electron `desktopCapturer` capture
- [ ] Backend `sharp` resize + validation
- [ ] Vision LLM integration (ChatOpenAI, ChatAnthropic)
- [ ] Route: `POST /api/vision` in backend + gateway
- [ ] Settings slider: vision check interval
- [ ] Test: analyze screenshot → LLM response → potential tool calls

### Phase 8–9: Multi-Step Agentic

- [ ] Extend ReAct agent with planning node (Zod schema for goal → steps)
- [ ] Add reflection node (Did we complete? Any errors? Next?)
- [ ] Checkpoint per step (reuse v1.8 Phase 35 checkpointer)
- [ ] Test: "Organize Downloads" → 5-step task → completes
- [ ] Token tracking: warn if task exceeds threshold
- [ ] Resume on interrupt: restart same checkpoint

### Phase 10–11: Proactive Scheduling

- [ ] Install node-cron, chokidar
- [ ] Implement scheduled task runner (9am standup)
- [ ] Implement file watcher (Downloads)
- [ ] Queue management: p-queue concurrency control
- [ ] IPC: Electron trigger → backend task exec
- [ ] Settings: enable/disable each proactive feature
- [ ] Test: 24h soak with scheduled tasks + file watch

---

## Gotchas & Mitigation

### Gotcha 1: MCP Stdio Lifecycle in Daemon Process

**Problem:** If backend-ts runs as systemd service (not child of Claude Desktop), stdio parent is lost.

**Solution:** For v3.0 MVP, MCP server is **debugging/development tool only**. Claude Desktop must be parent process. For production (v3.1), add HTTP Streamable transport (requires container refactor).

**Flag:** `ENABLE_MCP_SERVER=false` by default; `true` only in dev.

### Gotcha 2: Kokoro Model Download Stalls First Request

**Problem:** User asks a question → TTS tries Kokoro → model downloads → 5–10s latency spike → bad UX.

**Solution:**
- Pre-download model on app startup (same pattern as whisper.cpp)
- Or show toast "Downloading TTS model" with progress bar
- Or use Murf.ai on first request, switch to Kokoro on second

**Decision:** Add progress UI (proven in Phase 50).

### Gotcha 3: External MCP Servers as Long-Lived Subprocesses

**Problem:** Spawning child process for each external MCP server = process leaks if not managed.

**Solution:**
- Use node `child_process.spawn()` with explicit lifecycle
- Store process reference in Set
- On backend shutdown, kill all child processes
- Add process restart logic (if crashes, spawn new one)
- Use `p-queue` to limit concurrent process spawns

**Example:**
```typescript
private mcpProcesses: Set<ChildProcess> = new Set();

async connectToMcpServer(command: string, args: string[]) {
  const proc = spawn(command, args);
  this.mcpProcesses.add(proc);
  proc.on('exit', () => this.mcpProcesses.delete(proc));
  // ... rest of setup
}

onBackendShutdown() {
  this.mcpProcesses.forEach(proc => proc.kill());
}
```

### Gotcha 4: Vision API Rate Limiting

**Problem:** User says "analyze screen every 2 seconds" → API bill explodes.

**Solution:** Settings slider + explicit confirmation toast.

**Code:**
```typescript
if (timeSinceLastVisionCall < VISION_CHECK_INTERVAL) {
  return { error: 'Too frequent. Configured interval: ' + interval };
}
```

### Gotcha 5: Token Budget Explosion in Multi-Step Agentic

**Problem:** Task "organize Downloads" burns 10K tokens without warning.

**Solution:** Add cost tracking in Settings with threshold + warning.

**Example:**
```typescript
if (estimatedTokens > TOKEN_BUDGET_THRESHOLD) {
  return Toast.warn('This task may cost ~' + estimatedTokens + ' tokens');
}
```

### Gotcha 6: Proactive Tasks Blocking Chat

**Problem:** Proactive task running in same ChatSession → user message queues behind task.

**Solution:** Use p-queue with separate concurrency limit. Never block chat requests.

**Pattern:**
```typescript
// Chat requests: exclusive access (concurrency: 1)
chatQueue = new PQueue({ concurrency: 1 });

// Proactive tasks: lower priority (concurrency: 1, separate queue)
proactiveQueue = new PQueue({ concurrency: 1 });

// Chat always takes priority
chatQueue.add(async () => { /* user message */ });
proactiveQueue.add(async () => { /* standup */ });
```

---

## New vs Modified Components Summary

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| **MCPServer** | NEW | `backend-ts/src/mcp/server.ts` | stdio MCP server, tools registration |
| **MCPClient** | NEW | `backend-ts/src/mcp/client.ts` | Connect to external MCP servers |
| **KokoroTtsProvider** | NEW | `backend-ts/src/voice/tts-providers/kokoro.ts` | Offline neural TTS |
| **VisionAnalyzer** | NEW | `backend-ts/src/vision/analyzer.ts` | Screenshot analysis via LLM |
| **TaskExecutor** | NEW | `backend-ts/src/agent/task-executor.ts` | Multi-step agentic planning + execution |
| **ProactiveScheduler** | NEW | `electron/src/main/proactive/scheduler.ts` | node-cron + chokidar triggers |
| **vision-router** | NEW | `backend-ts/src/routes/vision.ts` | HTTP endpoint for vision requests |
| **tts-router** | NEW | `backend-ts/src/routes/tts.ts` | HTTP endpoint for TTS generation |
| **proactive-task-router** | NEW | `backend-ts/src/routes/proactive-task.ts` | HTTP endpoint for proactive tasks |
| **ChatSession** | MODIFIED | `backend-ts/src/session/chat-session.ts` | Add MCP tools to agent |
| **app.ts (backend)** | MODIFIED | `backend-ts/src/app.ts` | Register new routes + MCP server |
| **app.ts (gateway)** | MODIFIED | `gateway/src/app.ts` | Proxy new routes |
| **voiceHandler.ts** | MODIFIED | `desktop/src/main/voiceInput/voiceHandler.ts` | Call new TTS + vision endpoints |
| **SettingsWindow** | MODIFIED | `desktop/src/renderer/SettingsWindow.tsx` | Add TTS/vision/proactive toggles |
| **index.ts (Electron)** | MODIFIED | `desktop/src/main/index.ts` | Start proactive scheduler loop |

---

## Build Order Rationale

**Critical path:** Kokoro validation → MCP server → Vision → Agentic → Proactive

**Why:**
1. **Kokoro first (Phase 1):** Blocks TTS feature. Validation gate: if fails, fallback to Murf only.
2. **MCP server (Phases 2–3):** Foundational for Claude Desktop integration. Proves tool wrapping works.
3. **Vision (Phases 6–7):** Parallel workstream; doesn't block MCP. Proven pattern (backend generates payload, Electron executes).
4. **Agentic (Phases 8–9):** Depends on MCP (more tools). Also depends on Vision (screenshot analysis in planning).
5. **Proactive (Phases 10–11):** Last; uses all above. No blocking on other features.

**Parallelization opportunities:**
- Phases 2–3 (MCP server) + Phases 4–5 (MCP client) can overlap
- Phases 6–7 (Vision) can start once Phase 3 merges
- Phases 8–9 (Agentic) can start once Phase 5 merges (more tools available)

---

## Confidence Assessment

| Area | Level | Notes |
|------|-------|-------|
| MCP SDK 1.29.0 | HIGH | Official, 46K+ projects, stable v1.x. Stdio transport proven. HTTP Streamable in v1.25+ but deferred. |
| Kokoro.js 1.2.1 | MEDIUM | Maintained ONNX port, but 1 year old (May 2025). Phase 1 soak test required. |
| Vision (sharp + LangChain) | HIGH | sharp 0.35.x battle-tested. LangChain vision tools existing, documented. |
| LangGraph agentic (existing 1.1.4) | HIGH | ReAct proven in v1.8 Phase 35–38. Checkpointer stable. No version bump needed. |
| Scheduling (node-cron + chokidar) | MEDIUM | node-cron 3.0.x stable but ESM-only; chokidar 5.x recent (Nov 2025, breaking from v4). Integration test required. |
| Overall architecture | HIGH | All integrations fit established patterns (HTTP routes, IPC, tool wrappers). Zero new external services. |

---

## Sources

- [Model Context Protocol TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [MCP SDKs Official Docs](https://modelcontextprotocol.io/docs/sdk)
- [Kokoro.js Hugging Face](https://huggingface.co/posts/Xenova/503648859052804)
- [kokoro-js npm Package](https://www.npmjs.com/package/kokoro-js)
- [LangGraph TypeScript Guide](https://langgraphjs.guide/)
- [LangChain Structured Output Docs](https://docs.langchain.com/oss/javascript/langchain/structured-output)
- [sharp Image Processing Docs](https://sharp.pixelplumbing.com/)
- [chokidar File Watcher GitHub](https://github.com/paulmillr/chokidar)
- [node-cron npm Package](https://www.npmjs.com/package/node-cron)
- [Electron desktopCapturer API](https://www.electronjs.org/docs/api/desktop-capturer)

---

**Last updated:** 2026-05-07 — v3.0 Architecture Research Complete
