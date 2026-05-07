# Technology Stack Additions: v3.0 Agentic JARVIS

**Project:** JARVIS v3.0 (Electron + TypeScript desktop assistant)
**Research Date:** 2026-05-07
**Focus:** New capabilities for v3.0 milestone: MCP client/server, Kokoro offline TTS, Vision pipeline TS, agentic multi-step tasks, proactive scheduling

---

## Recommended Stack Additions

### MCP Integration (Client + Server)

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| `@modelcontextprotocol/sdk` | 1.29.0 | Official MCP client + server SDK for TypeScript | Latest stable (April 2026). Supports stdio and HTTP Streamable transport. Tool/prompt registration with Standard Schema (Zod v4+). Widely adopted (46K+ projects using it). v2 anticipated Q1 2026 but v1.x stable with 6+ months support post-v2. |
| `zod` | 4.x (as is) | Schema validation for MCP tools/prompts | Already in stack. MCP SDK uses Zod v4 internally but compatible with v3.25+. No version bump needed. |

**Why MCP v1.29.0 and not v2?** v2 launched in Q1 2026 but project is stable on v1.x. Upgrade to v2 can wait for a dedicated phase; v1 has 6+ months of continued support and is production-tested.

**MCP Transport Decision:**
- **stdio (default):** JARVIS server → Claude Desktop, Cursor, Windsurf via IPC. Zero network overhead. Recommended for desktop integration.
- **HTTP Streamable:** For exposing JARVIS as MCP server to remote clients or containerized deployments. Use only if explicitly needed later (Phase milestone).

---

### Offline TTS: Kokoro Node.js

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| `kokoro-js` | 1.2.1 | 82M neural TTS model, 100% offline, ~350MB | Only maintained ONNX-based Kokoro port for Node.js. Last published May 2025 (1 year old). Replaces Murf.ai/ElevenLabs fallback with fully offline option. High-quality voice, Apache license. |
| `onnxruntime-node` | 1.20.x | ONNX Runtime for Node.js CPU inference | Dependency of kokoro-js. Bundled wheels for Linux/macOS/Windows. Enables GPU acceleration optional (CUDA/TensorRT) but CPU-only acceptable for TTS latency. |
| `soundfile` | 0.13.x | WAV file I/O for TTS audio output | Dependency of kokoro-js. Used to save synthesized audio to .wav before playback. Already using sounddevice for capture; soundfile complements it. |

**Why kokoro-js over alternatives?**
- ✓ Only maintained ONNX JavaScript port (not deprecated like Coqui TTS)
- ✓ Community-driven (Xenova/Transformers.js ecosystem), not commercial lock-in
- ✓ 4x smaller than Murf.ai API dependency (350MB once downloaded vs API key management)
- ✗ kokoro-js 1.2.1 is 1 year old (published May 2025) — LOW confidence on production stability. Will need phase-specific validation.

**Integration Point:**
- Backend-ts: Move TTS generation from Murf.ai to kokoro-js (no API key needed, full privacy)
- Electron: Keep Murf.ai as fallback if kokoro-js fails or user prefers cloud voice
- Config: Settings UI feature flag `USE_KOKORO_TTS` (default: true if offline, fallback to Murf.ai on error)

---

### Vision Pipeline (Electron + TypeScript)

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| `desktopCapturer` (Electron built-in) | — | Screen/window capture from Electron main | Native Electron API. No external dependency. GPU-accelerated on Windows/macOS via DXGI/Metal. |
| `sharp` | 0.35.x+ | Fast image processing: resize, compress, format conversion | High-performance libvips wrapper. Used to normalize screenshots before vision LLM (e.g., downscale 4K to 1080p for cost/latency). 4-5x faster than ImageMagick. TypeScript-friendly (built-in types post-0.32). |
| `jimp` | 1.x (optional) | Pure JS image processing fallback (no system deps) | If sharp's libvips native module fails to build. JIMP slower but zero dependencies. Decision: Try sharp first; add jimp only if sharp fails on target platform. |

**Vision LLM Integration (already in stack, no new deps):**
- Claude 3 vision (via `langchain-anthropic`) — preferred for local/privacy
- GPT-4 vision (via `langchain-openai`) — fallback for complex scenes
- LM Studio vision models (Llava, Moondream) — if available locally

**Architecture:**
```
Electron main (voiceHandler.ts)
  → desktopCapturer.getSources()
  → sharp.resize() to 1080p max
  → base64 encode
  → IPC to backend-ts
  → LangChain ChatOpenAI/ChatAnthropic with vision
  → response back to Electron for orb state
```

**Why not use dedicated vision services?**
- ✓ sharp + LangChain vision = same cost/latency as Claude API directly, but zero service-specific binding
- ✗ Google Cloud Vision, Azure Vision API add dependency + cost
- Decision: Use existing LLM providers with vision capability.

---

### Agentic Multi-Step Tasks (LangGraph Enhancement)

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| `langgraph` | 1.1.4 (as is) | Already in stack. Upgrade to latest 1.x | Core dependency for multi-step planning + execution loop. v1.x is stable; v2 anticipated but not required. No version bump in critical path; defer to post-v3.0 if breaking changes come. |
| `@langchain/core` | 1.1.45+ | BaseMessageChunk, RunnableConfig, checkpointer | Already in stack. Verify version supports `.invoke()` streaming for multi-step tasks. Recent versions (1.1.40+) have stable checkpointer for agent state persistence. |
| `zod` | 4.x | StructuredOutput schema for task planning | Already required. Multi-step agentic uses `withStructuredOutput()` to enforce task decomposition format. |

**New Patterns for v3.0 (no new libs, existing LangGraph features):**
- **ReAct loop:** Planning node (decompose goal) → Execution nodes (parallel tools) → Reflection node (did it work?) → Loop or exit
- **Stateful checkpointing:** LangGraph's built-in memory persists agent state across browser/PC restarts. SQLite checkpoint + state graph recovery already implemented (v1.8 Phase 35).
- **Tool use:** Existing PC tools + new MCP tools via `@modelcontextprotocol/sdk` Server wrapper

**Example task:** "Summarize my Downloads folder, organize by date, flag large files"
```
1. Plan → "List files, group by date, check size"
2. Execute → list_files, calculate_size (parallel)
3. Reflect → Check counts, identify >100MB files
4. Execute → create_folders, move_files
5. Exit with summary
```

All of this uses existing LangGraph 1.1.4 — no new dependencies. Just different graph topology (conditional edges for reflection feedback loops).

---

### Proactive Scheduling & Monitoring

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| `node-cron` | 3.0.x+ | Schedule tasks: "run at 9am", "every 30min", etc. | Simple cron syntax. ~31M weekly npm downloads. ESM-compatible as of v3.0 (2025). Fits JARVIS's lightweight philosophy. |
| `bree` | 9.x (optional) | Advanced job scheduler with worker threads, retries, concurrency | If cron-only insufficient. Adds complexity; prefer `node-cron` as MVP. Consider for v3.1+ if scheduling needs expand (recurring tasks with state, failure recovery). |
| `chokidar` | 5.0.x+ | File system watcher (ESM-only as of Nov 2025) | Detects changes in folders (Downloads, Documents) to trigger proactive tasks. Cross-platform fs.watch wrapper. 30M repos using it. v5 (Nov 2025) breaks from node <v20; project already Node 22, so compatible. |
| `p-queue` | 7.3.x+ (already in stack) | Concurrency control for proactive tasks | Already used for EmbeddingQueue (v2.3 Phase 61). Reuse for scheduling concurrent proactive actions without overwhelming system. |

**Why node-cron over alternatives?**
- ✓ Minimal footprint, straightforward cron syntax
- ✓ No worker threads (Bree overhead) for simple tasks
- ✓ ESM v3.0 aligns with TypeScript + Vite build
- ✗ No built-in retry/persistence — design proactive tasks to be idempotent

**Why chokidar v5?**
- ✓ ESM-only matches modern Node.js/TypeScript setup
- ✓ v5 requires Node 20+ (project uses 22 LTS, compatible)
- ✗ Breaking change from v4; verify existing projects using it
- Decision: Upgrade to v5 as part of v3.0 dependency refresh

**Proactive JARVIS Examples:**
1. **Daily Standup (9am cron):** "Tell me today's calendar + unfinished tasks"
2. **Downloads Monitor (chokidar):** New file → "Should I organize/archive this?"
3. **Idle Task Processor (p-queue):** Every 30min when system idle, empty task backlog
4. **Memory Rollup (nightly cron):** Run rolling summarization (v2.3 Phase 38) if threshold reached

No new code structure required — just scheduling + watch patterns wired into existing Agent.

---

## Supporting Libraries (Verify/Upgrade)

| Library | Current | Recommended | Reason |
|---------|---------|-------------|--------|
| `@langchain/core` | 1.1.45 | 1.2.x+ | Verify streaming stability for multi-step vision tasks |
| `@langchain/openai` | 0.3.x | 0.3.x+ | No breaking changes; latest patch for streaming events |
| `@langchain/anthropic` | 0.3.x | 0.3.x+ | No breaking changes; latest patch |
| `chokidar` | (not currently used) | 5.0.x | Add for proactive FS monitoring |
| `node-cron` | (not currently used) | 3.0.x+ | Add for scheduled tasks |
| `sharp` | (not currently used) | 0.35.x+ | Add for vision screenshot preprocessing |
| `p-queue` | 9.2.0 | 9.2.x+ | Already in stack (Phase 61). Keep latest 9.2.x |

---

## Installation Plan

```bash
# New core MCP + scheduling + vision
pnpm add @modelcontextprotocol/sdk@1.29.0
pnpm add kokoro-js@1.2.1
pnpm add node-cron@3.0.x
pnpm add chokidar@5.0.x
pnpm add sharp@0.35.x

# Dev + peer deps
pnpm add -D @types/node-cron

# Verify (already present, no action needed)
# - zod 4.x
# - langgraph 1.1.4
# - @langchain/core 1.1.45+
# - p-queue 9.2.0
```

---

## What NOT to Add

| Technology | Reason | Use Instead |
|-----------|--------|------------|
| `onnxruntime` directly (separate install) | Bundled via kokoro-js dependency | Let kokoro-js manage onnxruntime-node |
| Bree job scheduler | Overkill for MVP; adds worker thread overhead | node-cron + p-queue for concurrency control |
| `jimp` as primary | Pure JS, 10x slower than sharp | Use sharp; add jimp only if libvips build fails |
| Google Cloud Vision SDK | Unnecessary; Claude/GPT already support vision | Use LangChain's vision integrations |
| LangChain 2.0 | Not stable; v1.x sufficient | Stay on 1.x unless explicit requirement |
| Firebase Cloud Tasks / AWS Lambda | Local-first philosophy; overkill for PC assistant | node-cron + chokidar sufficient |
| `RealtimeTTS` wrapper | Complex abstraction; kokoro-js + soundfile simpler | Use kokoro-js directly + Murf fallback |

---

## Integration Points & Gotchas

### MCP Server Registration (JARVIS as MCP Server)

**Goal:** Claude Desktop, Cursor, Windsurf can call JARVIS's tools (file access, PC control, memory recall).

**Implementation:**
```typescript
// backend-ts/src/mcp/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "jarvis-server",
  version: "3.0.0",
});

// Register JARVIS tools as MCP tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "recall_memory", ... },
    { name: "list_files", ... },
    { name: "execute_tool", ... },
  ],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Critical Detail:** If exposed to network later, use `HttpServerTransport` (requires v1.25+). For v3.0 MVP, stdio-only (no network exposure).

### MCP Client Integration (JARVIS calls external MCP servers)

**Goal:** JARVIS can connect to GitHub, Notion, filesystem MCP servers and use their tools in agent loop.

```typescript
// backend-ts/src/mcp/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const client = new Client({ name: "jarvis-client" });
const transport = new StdioClientTransport({
  command: "node",
  args: ["external-mcp-server.js"],
});

await client.connect(transport);
const tools = await client.listTools();
// Convert to LangChain tools, wire into agent
```

**Gotcha:** Each external MCP server = separate process. Manage lifecycle (spawn on start, graceful shutdown). Use with p-queue for concurrency limits.

### Kokoro TTS: Privacy vs. Fallback

**Decision:** Kokoro offline by default, Murf.ai fallback if kokoro-js fails or user prefers cloud.

**Config Flag:**
```typescript
// config.ts
USE_KOKORO_TTS: env.boolean('USE_KOKORO_TTS', true),
MURF_API_KEY: env.string('MURF_API_KEY', ''),
```

**Logic in voiceHandler.ts:**
```typescript
if (settings.USE_KOKORO_TTS) {
  try {
    const audio = await kokoro.generate(text);
    return audio;
  } catch (err) {
    console.warn('Kokoro failed, falling back to Murf', err);
    return murftts.generate(text); // Requires API key
  }
} else {
  return murftts.generate(text);
}
```

**Model Download:** Kokoro model (~350MB) downloads on first use via `kokoro-js`. Verify disk space warning in Settings.

### Vision Pipeline: Screenshot → LLM → Action

**Architecture Decision:**
1. Electron desktopCapturer captures full screen
2. sharp resizes to 1080p max (cost/latency optimization)
3. Backend LangChain vision → Claude/GPT with screenshot
4. Response → orb state + potential tool calls

**Gotcha — Rate Limiting:**
If user says "analyze screen every 2 seconds", vision API costs explode. Add settings throttle:
```typescript
// Settings UI
VISION_CHECK_INTERVAL: Slider (5000–60000ms, default 30000)
```

### Multi-Step Agentic: State Persistence

**Existing Foundation (v1.8 Phase 35):** LangGraph checkpointer + SQLite already deployed. Reuse for multi-step tasks.

**New Pattern:** Create task-specific graph checkpoint separate from conversation.
```typescript
// backends-ts/src/agent/task-executor.ts
const taskGraph = createAgentGraph({
  checkpointId: `task-${Date.now()}`,
  // Survives browser/electron restart
});

const result = await taskGraph.invoke(goal);
// If interrupted, resume later with same checkpointId
```

**Gotcha — Token Budgets:** Multi-step tasks burn tokens faster. Add cost tracking:
- Plan node: 1–2K tokens
- Execute nodes: 2–5K tokens per tool call
- Reflect node: 1K tokens
- **Total per task:** 5–10K tokens typical

Add warnings in Settings for expensive tasks on limited models (Llama 7B vs. Claude 3.5).

### Scheduling: Proactive vs. Reactive

**Reactive (existing):** User message → agent responds.

**Proactive (new):**
- **Scheduled:** `node-cron` (9am standup, nightly rollup)
- **Event-driven:** `chokidar` (new file in Downloads, trigger organize)

**Design:** Proactive tasks use same agent + memory as reactive. Trigger via IPC from Electron backend loop.

```typescript
// background-task-scheduler.ts (new Electron helper)
const standupJob = cron.schedule('0 9 * * *', async () => {
  const result = await backend.executeProactiveTask('daily-standup');
  ipcMain.emit('task-result', result); // Toast to user
});

const fileWatcher = chokidar.watch('/Users/*/Downloads', {
  ignored: /^\./,
});
fileWatcher.on('add', async (path) => {
  await backend.executeProactiveTask('new-file-handler', { path });
});
```

**Gotcha — Never Block:** Proactive tasks must be fire-and-forget. Use promise/await without awaiting LLM response in critical path.

---

## Confidence Assessment

| Area | Level | Notes |
|------|-------|-------|
| MCP SDK 1.29.0 | HIGH | Official package, 46K+ projects, stable v1.x with 6+ month support post-v2 |
| kokoro-js 1.2.1 | MEDIUM | Maintained ONNX port, but 1 year old (last May 2025). Needs phase-specific validation on real hardware. |
| Vision (sharp + LangChain) | HIGH | sharp is battle-tested 0.35.x+; LangChain vision tools existing, well-documented. |
| LangGraph agentic (existing 1.1.4) | HIGH | Proven in v1.8 Phase 35–38; checkpointer + ReAct stable. No version bump needed. |
| Scheduling (node-cron + chokidar) | MEDIUM | node-cron 3.0.x stable but ESM-only; chokidar 5.x recent (Nov 2025, breaking from v4). Needs integration test. |

---

## Sources

- [Model Context Protocol TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [MCP SDKs Official Docs](https://modelcontextprotocol.io/docs/sdk)
- [Kokoro.js Hugging Face Announcement](https://huggingface.co/posts/Xenova/503648859052804)
- [kokoro-js npm Package](https://www.npmjs.com/package/kokoro-js?activeTab=versions)
- [LangGraph TypeScript Guide](https://langgraphjs.guide/)
- [LangChain Structured Output Docs](https://docs.langchain.com/oss/javascript/langchain/structured-output)
- [sharp Image Processing Docs](https://sharp.pixelplumbing.com/)
- [chokidar File Watcher GitHub](https://github.com/paulmillr/chokidar)
- [node-cron npm Package](https://www.npmjs.com/package/node-cron)
- [LangChain Vision Integration Docs](https://docs.langchain.com/oss/javascript/integrations/tools/openai)
- [Electron desktopCapturer API](https://www.electronjs.org/docs/api/desktop-capturer)

---

## Next Steps (Phase Planning)

1. **Phase X:** Validate kokoro-js stability on Windows/macOS/Linux (soak test 2h TTS generation)
2. **Phase X+1:** Implement JARVIS as MCP server (stdio), expose tools to Claude Desktop
3. **Phase X+2:** Add MCP client integration (external server connection)
4. **Phase X+3:** Rebuild vision pipeline in TypeScript (ScreenAnalyzer port), integrate sharp
5. **Phase X+4:** Implement ReAct agentic loop with multi-step task planning
6. **Phase X+5:** Add proactive scheduling (node-cron daily tasks) + file watching (chokidar)

Each phase is independently shippable; order determined by priority and validation gates.
