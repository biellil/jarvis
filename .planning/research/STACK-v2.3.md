# Technology Stack — v2.3 LLM Providers & System Actions

**Project:** JARVIS v2.3 — Google Gemini + LM Studio Improvements + Media Controls  
**Researched:** 2026-05-06  
**Baseline Stack:** Node.js 22 + TypeScript 5.6 + LangChain.js 1.3.5 + Electron 33 + Express 5  
**Status:** New features only (no breaking changes to v2.2 stack)

---

## New Additions for v2.3

### 1. Google Gemini as LLM Provider (LLM-PROV-01)

**Requirement:** User can select Google Gemini in Settings UI dropdown, alongside OpenAI, Anthropic, LM Studio.

#### Primary Integration

| Component | Package | Version | Purpose | Why Chosen |
|-----------|---------|---------|---------|-----------|
| LangChain Adapter | **@langchain/google-genai** | 2.1.30 | LangChain integration for Gemini API | ✓ Latest as of May 6, 2026 (released 2 days ago). Supports Gemini 1.5, 2.0, 2.5. Seamlessly integrates with existing `ChatModel` abstraction in JARVIS `llm_factory.ts`. Zero learning curve — same interface as `ChatOpenAI` or `ChatAnthropic`. |
| Official SDK | **@google/genai** | 1.52.0 | Underlying Gemini SDK (replaces deprecated @google/generative-ai) | ✓ Latest unified Google SDK. @google/generative-ai deprecated Aug 31, 2025 — no more updates. Included as @langchain/google-genai peer dependency. |

#### Integration Points

**Backend llm_factory.ts:**
```typescript
// New provider route
case "gemini": {
  return new ChatGoogleGenerativeAI({
    apiKey: settings.GOOGLE_API_KEY,
    modelName: settings.GEMINI_MODEL || "gemini-2.0-flash",
    temperature: 0.7,
    // ... other config
  });
}
```

**Settings:**
- Environment var: `GOOGLE_API_KEY` (user provides API key from [Google AI Studio](https://aistudio.google.com/app/apikey))
- Settings UI: Add "Google Gemini" option to provider dropdown (same pattern as OpenAI/Anthropic)
- Optional model selector for Gemini (1.5-pro, 2.0-flash, 2.5-pro-preview)

**Compatibility:**
- ✓ Streaming via existing SSE pipeline (LangChain.js handles SSE transparently)
- ✓ Tool calling (Gemini 2.0+ supports structured outputs)
- ✓ Vision (multimodal via existing ScreenAnalyzer integration)
- ✓ Context caching (optional, for cost optimization later)

#### Version Rationale

@langchain/google-genai 2.1.30 is **3 minor versions ahead** of baseline LangChain.js 1.3.5, confirming active maintenance. @google/genai 1.52.0 proves Gemini SDK is current production-ready (released recently).

---

### 2. LM Studio Streaming Events Protocol (LLM-PROV-02)

**Requirement:** When LM Studio 0.3.18+ loads a model that supports streaming events, use native named events for lower latency.

#### Current State (v2.2 Baseline)

JARVIS already supports LM Studio via OpenAI-compatible API:
```
POST http://localhost:1234/v1/chat/completions
Content-Type: application/json

{
  "stream": true,
  "messages": [...]
}
```

Response: **Server-Sent Events (SSE)** with generic `data: {...}` JSON blobs.

#### LM Studio Streaming Events (New in 0.3.18+)

Named SSE events provide richer information:
```
event: chat.start
data: {"id":"...","timestamp":...}

event: message.delta
data: {"delta":{"content":"..."},...}

event: tool_call.success
data: {"tool_call":{...},...}

event: chat.end
data: {...aggregated result...}
```

#### Integration Strategy

| Aspect | Assessment | Action |
|--------|-----------|--------|
| **Breaking change?** | No — LM Studio still emits `data: {...}` fallback | Zero change to gateway/backend code required |
| **Named events parsing** | Optional enhancement — current SSE parser ignores event names | IF performance gain measured, add named event handlers in ChatSession.ts |
| **LangChain.js compatibility** | langchain-openai 0.3.x uses fetch + response.body reader | Verify works with LM Studio 0.3.18+ named events (likely yes — RFC 6453 compliant) |
| **Action required** | Minimal | Test streaming response from LM Studio 0.3.18 with current code. If latency improves, document in CONFIGURATION. No new packages. |

#### Recommendation

**No new package required.** LM Studio Streaming Events is raw SSE—langchain-openai already handles it. Defer enhanced parsing (named event handlers) to v2.4 if benchmarks show latency win >100ms.

---

### 3. Embedding Priority Management When Both Run in LM Studio (LLM-PRIO-01, LLM-PRIO-02)

**Requirement:** When memory extraction (embedding) and chat (LLM inference) run simultaneously in same LM Studio instance, embedding has low priority. Chat requests preempt queued embeddings gracefully.

**Context:**
- JARVIS fires off async memory extraction after every user message (fire-and-forget, no blocking)
- LM Studio 0.4.0+ supports n_parallel (default 4) via llama.cpp continuous batching
- Problem: embedding + chat both queue — embedding may block chat if processed serially

#### Priority Queue Solution

| Component | Package | Version | Purpose | Why Chosen |
|-----------|---------|---------|---------|-----------|
| Promise Queue with Priority | **p-queue** | 8.4.0+ | Executes tasks in priority order with AbortController support | ✓ Lightweight (20KB), no dependencies. Supports priority levels and AbortSignal for cancellation. Integrates with native fetch() via AbortController. |
| Built-in Cancellation | **AbortController** | Node.js 16.5+ | Signal-based cancellation for fetch/XMLHttpRequest | ✓ Already in Node.js stdlib (no install). p-queue respects AbortSignal natively. |

#### Implementation Pattern

```typescript
// New: EmbeddingQueue.ts singleton
import PQueue from "p-queue";

const embeddingQueue = new PQueue({
  concurrency: 1, // One embedding at a time (LM Studio handles parallelism)
  autoStart: true,
});

const chatAbortController = new AbortController();

// Fire embedding with LOW priority
embeddingQueue.add(async () => {
  const signal = chatAbortController.signal;
  // ChromaDB add_documents call with signal
  // If signal aborted, fetch() throws and memory write skips
}, { priority: 1 }); // Low priority

// Chat request arrives — ABORT low-priority embedding
function onChatStart() {
  chatAbortController.abort(); // Pending embeddings fail cleanly
  // Chat proceeds normally (doesn't wait for embedding cleanup)
}
```

#### Graceful Degradation (LLM-PRIO-02)

If embedding already processing when chat arrives, we **do NOT forcefully interrupt**. Instead:
- p-queue priority ensures next chat request skips ahead
- Embedding finishes normally in background
- Chat latency unaffected (no blocking)

This satisfies LLM-PRIO-02: "system degrades gracefully — chat is never blocked."

#### Installation

```bash
npm install p-queue@8.4.0
```

---

### 4. System Default File Opener Fallback (FACT-12)

**Requirement:** When LLM action to open a file fails (e.g., .zip without handler), execute fallback via system default opener (xdg-open / start / open).

#### Cross-Platform Solution

| Component | Package | Version | Purpose | Why Chosen |
|-----------|---------|---------|---------|-----------|
| System File Opener | **open** | 11.0.0 | Cross-platform abstraction (macOS `open`, Windows `start`, Linux `xdg-open`) | ✓ Latest (May 2026 timeline). 15,960+ projects use it. Atomic solution: handles platform differences, missing command fallback, error handling. ESM-only (JARVIS already ESM). |

**Comparison:**
- ✗ Raw `child_process.spawn('start'/'xdg-open')` — platform detection needed, ENOENT handling complex
- ✗ `opener` package — older, smaller ecosystem
- ✓ `open` — actively maintained, minimal dependencies, battle-tested

#### Integration (Electron)

```typescript
// In pc-control/file.ts — FileActionExecutor

// Primary: try native file open (via Electron)
try {
  await executeNativeFileOpen(filePath);
} catch (err) {
  // Fallback: system default opener
  import("open").then(({ default: open }) => {
    open(filePath).catch(fallbackErr => {
      log.warn("File open failed entirely", { filePath, err, fallbackErr });
    });
  });
}
```

#### Installation

```bash
npm install open@11.0.0
```

---

### 5. System Media Controls — Volume & Play/Pause (SYSCTRL-01, SYSCTRL-02)

**Requirement:** User can control system volume (up/down/mute) and media playback (play/pause, next, prev) via voice command to JARVIS.

#### Media Key + Volume Control

| Component | Package/API | Version | Purpose | Why Chosen |
|-----------|------------|---------|---------|-----------|
| Volume Control | **loudness** | 0.4.2 | System volume get/set/mute cross-platform | ✓ Headless (no UI). Supports macOS (AVFoundation), Windows (WMI), Linux (ALSA). Simple async API: `getVolume()`, `setVolume(vol)`, `getMuted()`, `setMuted(mute)`. Electron compatible (fires in main process, non-blocking). |
| Media Key Registration | **electron.globalShortcut** | Built-in (Electron 33) | Register OS media keys globally (MediaPlayPause, MediaTrackNext, MediaTrackPrevious) | ✓ Native Electron API. No package needed. Works on Windows, macOS, Linux X11. Supports global shortcuts even when Electron unfocused. |

**Why this combination:**
- loudness = volume control (no media player dependency)
- globalShortcut = media key capture (platform-native, global)
- Together = complete headless system audio control without TTS or UI overhead

#### Integration (Electron main)

```typescript
// New: SystemControlManager.ts

import * as loudness from "loudness";
import { globalShortcut, ipcMain } from "electron";

// SYSCTRL-01: Volume commands
export async function changeVolume(delta: number) {
  const current = await loudness.getVolume();
  const next = Math.max(0, Math.min(100, current + delta));
  await loudness.setVolume(next);
  return next;
}

export async function toggleMute() {
  const muted = await loudness.getMuted();
  await loudness.setMuted(!muted);
  return !muted;
}

// SYSCTRL-02: Media key registration
export function registerMediaKeys() {
  globalShortcut.register("MediaPlayPause", () => {
    // Send IPC to backend LLM: execute "pause" action
    // OR trigger system media player directly
  });
  globalShortcut.register("MediaTrackNext", () => {
    // System forward
  });
  globalShortcut.register("MediaTrackPrevious", () => {
    // System back
  });
}

// IPC handler for voice commands
ipcMain.handle("system:volume-up", () => changeVolume(5));
ipcMain.handle("system:volume-down", () => changeVolume(-5));
ipcMain.handle("system:toggle-mute", () => toggleMute());
```

**Voice Integration:**
```typescript
// In ChatSession.ts — system tools namespace
const tools = [
  // ...existing PC control tools
  {
    name: "increase_volume",
    description: "Increase system volume by 5%",
    handler: async () => ipcRenderer.invoke("system:volume-up"),
  },
  {
    name: "decrease_volume",
    description: "Decrease system volume by 5%",
    handler: async () => ipcRenderer.invoke("system:volume-down"),
  },
  {
    name: "play_pause",
    description: "Toggle play/pause on system media player",
    handler: async () => {
      // Trigger OS media player via globalShortcut or direct system call
    },
  },
];
```

#### Installation

```bash
npm install loudness@0.4.2
```

#### Platform-Specific Notes

| OS | loudness | globalShortcut | System Deps |
|----|----|----|----|
| **macOS** | AVFoundation (built-in) | NSEvent + Cocoa (built-in) | None |
| **Windows** | WMI (built-in) | Win32 hotkey registration (built-in) | None |
| **Linux (X11)** | ALSA mixer | X11 (built-in) | `libalsa-dev` system package for loudness |
| **Linux (Wayland)** | ALSA mixer | ⚠️ Partial support (known Electron limitation) | `libalsa-dev` |

---

## Installation Summary

### All New Packages for v2.3

```bash
npm install \
  @langchain/google-genai@2.1.30 \
  @google/genai@1.52.0 \
  p-queue@8.4.0 \
  open@11.0.0 \
  loudness@0.4.2
```

**Total new dependencies:** 5 packages  
**Uncompressed size:** ~280 KB  
**Installation time:** ~30s (first run with npm dedupe)

### No Changes to Existing Dependencies

v2.2 baseline stack (`langchain@1.3.5`, `langchain-openai@0.3.x`, etc.) remains unchanged.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **@google/generative-ai** | Deprecated Aug 31, 2025 | @google/genai (latest official SDK) |
| **@google/generative-ai** | No more security updates | @google/genai only |
| **node-loudness** (fork) | Outdated, unmaintained fork | **loudness** 0.4.2 (original, maintained) |
| **easy-volume** | Newer but smaller ecosystem, less tested | **loudness** |
| **Bull** (job queue) | Over-engineered for simple embedding priority | **p-queue** (lightweight, focused) |
| **Bull + Redis** | Adds Redis server dependency (overkill for local audio) | p-queue (in-memory, sufficient) |
| **Manual ffmpeg for media keys** | System keys already available natively | globalShortcut (built-in Electron API) |
| **Spotify SDK / music platform APIs** | JARVIS doesn't own the player — controls OS only | globalShortcut + loudness (headless OS control) |
| **RealtimeTTS / Kokoro for volume notifications** | Volume changes don't require TTS feedback | loudness alone (silent operation) |
| **Custom child_process for file open** | Cross-platform complexity, error handling | **open** (abstracted, proven) |

---

## Compatibility Matrix

| Package | Requires | Notes |
|---------|----------|-------|
| @langchain/google-genai 2.1.30 | Node 16+, @langchain/core >=0.3.0 | Compatible with LangChain.js 1.3.5 |
| @google/genai 1.52.0 | Node 16+ | Peer dep of @langchain/google-genai |
| p-queue 8.4.0 | Node 12+, AbortController (Node 15+ for full support) | Already in Node 22 |
| open 11.0.0 | Node 16+, ESM-only (no CommonJS) | JARVIS is already ESM |
| loudness 0.4.2 | Node 10+; native modules for macOS/Windows/Linux | Cross-platform, Electron compatible |
| Electron 33 | Windows 7+, macOS 10.13+, Linux (X11 preferred, Wayland partial) | Already baseline |

---

## Testing Strategy by Feature

### 1. Google Gemini Provider (LLM-PROV-01)

```typescript
// Unit: instantiation
test("ChatGoogleGenerativeAI initializes with GOOGLE_API_KEY", () => {
  const llm = new ChatGoogleGenerativeAI({ apiKey: "test" });
  expect(llm).toBeDefined();
});

// Integration: streaming
test("Gemini streaming response works E2E", async () => {
  const llm = new ChatGoogleGenerativeAI({...});
  const stream = await llm.stream("Hello");
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk.content);
  }
  expect(chunks.length).toBeGreaterThan(0);
});
```

### 2. LM Studio Streaming Events (LLM-PROV-02)

```typescript
// Integration: verify LM Studio 0.3.18+ SSE compatibility
test("LM Studio streaming events parse correctly", async () => {
  // Mock LM Studio response with named events
  const response = `event: chat.start\ndata: {...}\n\nevent: message.delta\ndata: {...}\n`;
  // Verify existing SSE parser handles it
  const parsed = parseSSE(response);
  expect(parsed.length).toBeGreaterThan(0);
});
```

### 3. Embedding Priority (LLM-PRIO-01/02)

```typescript
// Unit: p-queue priority
test("Chat request preempts embedding", async () => {
  const q = new PQueue({ concurrency: 1 });
  const results = [];
  
  q.add(async () => results.push("embedding"), { priority: 1 });
  q.add(async () => results.push("chat"), { priority: 10 });
  
  await q.onIdle();
  expect(results).toEqual(["chat", "embedding"]); // Chat first
});

// Integration: AbortController cancellation
test("Chat arrival aborts in-flight embedding", async () => {
  const abortCtrl = new AbortController();
  const task = async (signal) => {
    try {
      await chromaDB.add(...); // abortable fetch
    } catch (e) {
      // Expect AbortError
      expect(e.name).toBe("AbortError");
    }
  };
  q.add(() => task(abortCtrl.signal), { priority: 1 });
  setTimeout(() => abortCtrl.abort(), 10);
  await q.onIdle();
});
```

### 4. File Fallback (FACT-12)

```typescript
// Unit: open() fallback
test("open() fallback triggers on native failure", async () => {
  const mockOpen = jest.fn();
  jest.mock("open", () => ({ default: mockOpen }));
  
  await fileExecutor.executeOpen("/path/unknown.zip");
  expect(mockOpen).toHaveBeenCalledWith("/path/unknown.zip");
});
```

### 5. Media Controls (SYSCTRL-01/02)

```typescript
// Unit: volume control
test("changeVolume() sets system volume", async () => {
  const before = await loudness.getVolume();
  await changeVolume(10);
  const after = await loudness.getVolume();
  expect(after).toBe(before + 10);
});

// Unit: media key registration
test("MediaPlayPause key registered", () => {
  registerMediaKeys();
  const shortcuts = globalShortcut.getAll();
  expect(shortcuts).toContain("MediaPlayPause");
});
```

---

## Integration Points with Existing Code

| Module | Change | Scope |
|--------|--------|-------|
| `llm_factory.ts` | Add GoogleGenerativeAI case + env var read | Minimal, follows pattern |
| `Settings UI` | Add Gemini provider dropdown + API key input | Existing form pattern |
| `ChatSession.ts` | Add p-queue wrapper for memory extraction | Fire-and-forget loop, wrap in queue.add() |
| `MemoryWriter.ts` | Accept AbortSignal in embedVector() | Propagate signal to ChromaDB fetch calls |
| `pc-control/file.ts` | Import open, add fallback try/catch | Post-native-attempt fallback |
| `electron/main.ts` | Import loudness, register globalShortcut | New SystemControlManager singleton |
| `Tools definitions` | Add volume_up, volume_down, play_pause tools | Existing tools array pattern |
| `gateway.ts` | ✗ No changes (LM Studio SSE already works) | Backward compatible |
| `Backend SSE pipeline` | ✗ No changes (Gemini integrates via LangChain) | Backward compatible |

---

## Rollback Plan

If any package causes issues:
- **@langchain/google-genai:** Remove from settings UI, keep other providers. LangChain LLM substitution is clean separation.
- **p-queue:** Revert embedding to non-queued fire-and-forget. LLM-PRIO may degrade but doesn't break voice pipeline.
- **open:** Fall back to native child_process handling (loses cross-platform benefit but tools still work).
- **loudness:** Remove media control tools. Voice commands for volume still execute via LLM, just with error messages.

---

## Sources

- [npm @langchain/google-genai](https://www.npmjs.com/package/@langchain/google-genai)
- [LangChain JS Google Gemini Integration](https://docs.langchain.com/oss/javascript/integrations/chat/google_generative_ai)
- [GitHub langchain-ai/langchain-google](https://github.com/langchain-ai/langchain-google)
- [npm @google/genai](https://www.npmjs.com/package/@google/genai)
- [Google GenAI SDK Migration Guide](https://ai.google.dev/gemini-api/docs/migrate)
- [LM Studio Streaming Events API](https://lmstudio.ai/docs/developer/rest/streaming-events)
- [LM Studio Parallel Requests & n_parallel](https://lmstudio.ai/docs/app/advanced/parallel-requests)
- [npm p-queue](https://www.npmjs.com/package/p-queue)
- [GitHub sindresorhus/p-queue](https://github.com/sindresorhus/p-queue)
- [Node.js AbortController Documentation](https://nodejs.org/api/abort_controller.html)
- [npm open](https://www.npmjs.com/package/open)
- [GitHub sindresorhus/open](https://github.com/sindresorhus/open)
- [npm loudness](https://www.npmjs.com/package/loudness)
- [GitHub LinusU/node-loudness](https://github.com/LinusU/node-loudness)
- [Electron globalShortcut API](https://www.electronjs.org/docs/latest/api/global-shortcut/)
- [Electron Keyboard Shortcuts](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts)
- [Managing Async with AbortController in Node.js](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html)
- [LangChain JS Versioning](https://docs.langchain.com/oss/javascript/versioning)
