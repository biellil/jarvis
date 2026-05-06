# Architecture Integration: v2.3 LLM Providers & System Actions

**Project:** JARVIS v2.3  
**Researched:** 2026-05-06  
**Overall Confidence:** HIGH

## Executive Summary

v2.3 adds 5 new features across existing layers. No breaking changes; all integrate via patterns established in v2.2 (store persistence, IPC handlers, action executors, LLM factory).

**Key findings:**

1. **Gemini LLM provider** — Extend switch in `factory.ts` (1 new case), add to `StoreSchema` enum, add env var to `config.ts`. ~20 LOC total.

2. **LM Studio Streaming Events** — Likely automatic via langchain-openai v0.3.x. No code change expected; verify with research before Phase 1.

3. **Embedding/LLM prioritization** — Already satisfied by fire-and-forget pattern in `ChatSession.send()` (v1.8 Phase 36). Skip MVP.

4. **File opener fallback** — 5-line change in `open-file.ts`: on error, call `shell.openExternal()`.

5. **Media controls** — Add 3 new action handlers (Electron) + 3 tool factories (backend). ~100 LOC. Use keyboard simulation (Option A) for MVP.

**Architecture impact:** Zero new services, databases, or abstractions. All changes fit existing patterns:
- **LLM factory:** Extend switch with `case 'gemini'`
- **Tools:** Add 2–3 new tool factories in `pc-tools.ts`
- **Settings:** Extend `electron-store` schema + UI dropdown (already exists from v2.2)
- **Actions:** Add 2–3 new handlers in `apps/desktop/src/main/actions/`

**Suggested build order:** 
1. **Phase 1:** Research LM Studio streaming (1–2 days)
2. **Phases 2–3:** Gemini + file fallback + action confirmation (5–8 days, parallelizable)
3. **Phases 4–5:** Media controls (6–8 days)

**Total estimated effort:** 2–3 weeks (Phases 1–5)

---

## Feature 1: Google Gemini LLM Provider (LLM-PROV-01)

**Requirement:** Users can select Google Gemini as LLM provider in Settings UI.

### Current Architecture

```
┌─ Settings UI (Electron Renderer)
│   Provider dropdown: ['LM Studio' | 'Claude' | 'GPT-4o']
│
└─ Electron Store (electron-store)
    ├─ llmProvider: LlmProvider = 'lmstudio' | 'openai' | 'anthropic'
    └─ lmStudioUrl: string
    
└─ Backend Config (backend-ts/src/llm/config.ts)
    ├─ LLM_PROVIDER: enum
    ├─ LM_STUDIO_URL: string
    ├─ OPENAI_API_KEY?: string
    └─ ANTHROPIC_API_KEY?: string
    
└─ LLM Factory (backend-ts/src/llm/factory.ts)
    case 'lmstudio': ChatOpenAI({ baseURL: ... })
    case 'openai': ChatOpenAI({ apiKey: ... })
    case 'anthropic': ChatAnthropic({ apiKey: ... })
```

### Changes Required

**File: `apps/backend-ts/src/llm/types.ts`**
```typescript
// Current:
export type LLMProvider = 'lmstudio' | 'openai' | 'anthropic';

// New:
export type LLMProvider = 'lmstudio' | 'openai' | 'anthropic' | 'gemini';
```

**File: `apps/backend-ts/src/llm/config.ts`**
```typescript
export const envSchema = z.object({
  // ... existing ...
  GEMINI_API_KEY: z.string().optional().default(''),  // NEW
});
```

**File: `apps/backend-ts/src/llm/factory.ts`**
```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';  // NEW

export function createLLM(provider?: LLMProvider, config?: LLMConfig): BaseChatModel {
  const cfg = config || loadConfig();
  const selectedProvider = provider || cfg.LLM_PROVIDER;

  switch (selectedProvider) {
    case 'lmstudio':
      // ... existing ...
    case 'openai':
      // ... existing ...
    case 'anthropic':
      // ... existing ...
    case 'gemini':  // NEW
      if (!cfg.GEMINI_API_KEY) {
        throw new LLMConfigError('gemini', 'GEMINI_API_KEY');
      }
      return new ChatGoogleGenerativeAI({
        apiKey: cfg.GEMINI_API_KEY,
        model: cfg.LLM_MODEL || 'gemini-2.0-flash',
        streaming: true,
      });
    default:
      throw new Error(`Unknown provider: '${selectedProvider}'...`);
  }
}
```

**File: `apps/desktop/src/main/store.ts`**
```typescript
// Current:
const VALID_LLM_PROVIDERS: LlmProvider[] = ['lmstudio', 'openai', 'anthropic'];

// New:
const VALID_LLM_PROVIDERS: LlmProvider[] = ['lmstudio', 'openai', 'anthropic', 'gemini'];
```

**Settings UI:** No changes — dropdown reads from `VALID_LLM_PROVIDERS` array (already handles new entries dynamically).

### Data Flow

```
User selects "Gemini" in Settings UI dropdown
  ↓ onChange handler
  ↓ ipcRenderer.invoke('apply-llm-provider-without-restart', 'gemini')
  ↓ (Electron main IPC handler — already exists from v2.2)
  ↓ store.setLlmProvider('gemini')
  ↓ electron-store persists
  ↓ (backend continues running, no restart)
  ↓
Next user message sent via `/api/chat/stream`
  ↓ Backend loads env vars (or .env file)
  ↓ GEMINI_API_KEY = "AIza..."  [from .env or env var]
  ↓ createLLM() → case 'gemini' → ChatGoogleGenerativeAI({ apiKey })
  ↓ LLM inference via Google Generative AI API
  ↓ Tokens streamed back via SSE
  ↓ Electron renders chat response
```

### Decision: ChatGoogleGenerativeAI vs ChatVertexAI

| Option | Pros | Cons | Recommendation |
|--------|------|------|-----------------|
| **ChatGoogleGenerativeAI** | Simple API key setup; no GCP project needed; matches OpenAI/Anthropic pattern | Slightly less enterprise features | ✅ **Use for MVP** |
| **ChatVertexAI** | More enterprise; GCP ecosystem | Requires GCP project + OAuth; complex setup | ❌ Defer to v2.4 |

### Dependencies

Add to `apps/backend-ts/package.json`:
```json
"@langchain/google-genai": "^0.2.x"
```

### Testing

- **Unit test:** `llm/factory.test.ts` — snapshot test for ChatGoogleGenerativeAI instantiation
- **Integration test:** Chat request with `GEMINI_API_KEY` set; verify token streaming
- **E2E test:** Settings UI → select Gemini → send message → verify response

### Complexity: **LOW** (~20 LOC)

---

## Feature 2: LM Studio Streaming Events (LLM-PROV-02)

**Requirement:** Reduce latency when LM Studio supports streaming events (v0.2.26+).

### Current State

- `ChatOpenAI` initialized with `streaming: true` — always token-by-token
- LM Studio v0.2.26+ supports `stream_options: { include_usage: true }` in OpenAI API payloads
- Not clear if langchain-openai v0.3.x automatically optimizes for this

### Investigation

**Question:** Does `@langchain/openai@0.3.x` support streaming event optimization?

**Research steps:**
1. Check `langchain-openai` v0.3.x CHANGELOG for "streaming events" or "stream_options"
2. Read `ChatOpenAI._generate()` source to see if it passes `stream_options`
3. Test against real LM Studio v0.2.26+ instance with `DEBUG=*` logging
4. Measure token latency before/after

### Likely Outcome

**Most probable:** `langchain-openai` already optimizes. No code change needed.

**If optimization required:** Create custom `llm/lmstudio-streaming.ts` subclass:
```typescript
import { ChatOpenAI } from '@langchain/openai';

export class LMStudioOptimized extends ChatOpenAI {
  protected _generate(messages, options, runManager) {
    // Inject stream_options into OpenAI API call
    const params = {
      ...options,
      stream_options: { include_usage: true },  // NEW
    };
    return super._generate(messages, params, runManager);
  }
}
```

Then in `factory.ts`:
```typescript
case 'lmstudio':
  return new LMStudioOptimized({
    configuration: { baseURL: cfg.LM_STUDIO_URL },
    // ... rest unchanged
  });
```

### Complexity

- **If no code needed:** 0 LOC (just verification)
- **If custom class needed:** ~30 LOC

### Build order: **PHASE 1** (research only, 1–2 days)

---

## Feature 3: LLM/Embedding Priority (LLM-PRIO-01, 02)

**Requirement:** When embedding and LLM run simultaneously on LM Studio, LLM takes priority.

### Analysis

**Current behavior (v1.8 Phase 36 — fire-and-forget):**

```typescript
// In ChatSession.send()
export async send(message: string) {
  // Synchronous: waits for LLM response
  const response = await this.llm.invoke(...);

  // Fire-and-forget: does NOT wait
  void this.memoryManager.extractAndStore(messages);  // No await

  return response;
}
```

**Impact:**
- LLM call **blocks request pipeline** — synchronous, must wait for response before client gets data
- Embedding runs **in background** — asynchronous, started after response sent
- **No contention:** LLM gets immediate CPU, embedding runs during idle time

**Conclusion:** Current design **already satisfies** LLM-PRIO-02 (graceful degradation). Embedding never blocks LLM.

### If Blocking Observed

If v2.2 testing reveals embedding latency affects LLM (rare edge case), add `AbortController`:

```typescript
// In ChatSession
private embeddingAbort?: AbortController;

async send(message: string) {
  // Cancel previous embedding if in flight
  if (this.embeddingAbort) {
    this.embeddingAbort.abort();
  }

  const response = await this.llm.invoke(...);

  // Start new embedding with cancellation token
  this.embeddingAbort = new AbortController();
  void this.memoryManager.extractAndStore(messages, {
    signal: this.embeddingAbort.signal,
  });

  return response;
}
```

### Complexity

- **No change needed:** 0 LOC
- **Optional optimization:** ~20 LOC

### Build order: **PHASE 5 (optional, defer)**

---

## Feature 4: System File Opener Fallback (FACT-12)

**Requirement:** If file has no registered app handler, fall back to system default app (xdg-open, open, start).

### Current State

```typescript
// apps/desktop/src/main/actions/open-file.ts
export const openFileHandler: ActionHandler = async (args) => {
  const path = args['path'];
  try {
    const errMsg = await shell.openPath(path);
    if (errMsg) {
      return fail(`subprocess_failed: ${errMsg}`);
    }
    return ok(`opened file: ${path}`);
  } catch (err) {
    return fail(describeError(err));
  }
};
```

### Change

Add fallback to `shell.openExternal()` with `file://` protocol:

```typescript
export const openFileHandler: ActionHandler = async (args) => {
  const path = args['path'];
  if (typeof path !== 'string' || path.length === 0) {
    return fail('invalid_args: path must be a non-empty string');
  }
  try {
    const errMsg = await shell.openPath(path);
    if (errMsg) {
      // FALLBACK: Try system default app handler
      try {
        await shell.openExternal(`file://${path}`);
        return ok(`opened file via system handler: ${path}`);
      } catch (fallbackErr) {
        return fail(`both openPath and openExternal failed: ${errMsg}`);
      }
    }
    return ok(`opened file: ${path}`);
  } catch (err) {
    return fail(describeError(err));
  }
};
```

### How It Works

- **`shell.openPath()`** — Electron's native method, tries to find registered app for file extension
- **`shell.openExternal()`** — Uses OS default behavior (xdg-open on Linux, `open` on macOS, `start` on Windows)
- **`file://` protocol** — Ensures OS recognizes argument as file path, not URL

### Example Scenarios

1. **User opens `.zip` without archive app registered**
   - `shell.openPath()` fails with error
   - `shell.openExternal()` triggers system default dialog or app
   - User can choose app or decompress

2. **User opens `.iso` on Windows**
   - `shell.openPath()` fails (no default handler)
   - `shell.openExternal()` triggers Windows mount dialog
   - ISO mounts as virtual drive

### Complexity: **LOW** (~5 LOC)

### Build order: **PHASE 2–3** (parallel with Gemini)

---

## Feature 5: Media Controls (SYSCTRL-01, 02)

**Requirement:** User controls volume, media playback (play/pause, next, prev) via voice commands.

### Architecture Addition

**New backend tools** (`pc-tools.ts`):
```typescript
export function createPlayPauseTool() { ... }
export function createNextTrackTool() { ... }
export function createPreviousTrackTool() { ... }
```

**New Electron handlers** (`actions/media-controls.ts`):
```typescript
export const playPauseHandler: ActionHandler = async () => { ... }
export const nextTrackHandler: ActionHandler = async () => { ... }
export const prevTrackHandler: ActionHandler = async () => { ... }
```

**Data flow:**
```
User: "próxima música"
  ↓ STT → "próxima música"
  ↓ LLM recognizes intent → calls next_track tool
  ↓ Backend payload: { action: 'next_track', args: {} }
  ↓ SSE → Electron actionExecutor
  ↓ nextTrackHandler() → triggers media key
  ↓ Active player responds (Spotify, VLC, browser, etc.)
```

### Implementation Strategy: Option A — Keyboard Simulation

**Why:** Universal across apps (Spotify, VLC, Chrome, system player); simple implementation.

```typescript
// Option A: Keyboard simulation
import robot from 'robotjs';

export const playPauseHandler: ActionHandler = async () => {
  try {
    robot.keyTap('playpause');
    return ok('media playback toggled');
  } catch (err) {
    return fail(`media control failed: ${(err as Error).message}`);
  }
};

export const nextTrackHandler: ActionHandler = async () => {
  try {
    robot.keyTap('medianext');
    return ok('next track');
  } catch (err) {
    return fail(`next track failed: ${(err as Error).message}`);
  }
};

export const prevTrackHandler: ActionHandler = async () => {
  try {
    robot.keyTap('mediaprevious');
    return ok('previous track');
  } catch (err) {
    return fail(`previous track failed: ${(err as Error).message}`);
  }
};
```

### Implementation Strategy: Option B — Platform-Native APIs (Fallback)

**Why:** Robust on systems where keyboard events don't work; app-specific.

| Platform | Approach |
|----------|----------|
| **Windows 11+** | `Windows.Media.Control` API via node-ffi or native module |
| **macOS** | AppleScript to Spotify/Music.app; or `mpris` protocol fallback |
| **Linux** | D-Bus `org.mpris.MediaPlayer2.Player` interface |

**Recommendation:** Implement Option A for MVP. If keyboard events fail on test systems, add Option B per-platform.

### Dependencies

Add to `apps/backend-ts/package.json`:
```json
"robotjs": "^0.6.0"
```

**Note:** `robotjs` includes C++ bindings; requires build tools. Pre-compile wheels for Windows/macOS/Linux during CI/CD.

### Code Structure

**File: `apps/backend-ts/src/session/pc-tools.ts` (additions)**

```typescript
export function createPlayPauseTool() {
  return tool(
    async () => buildResult({ action: 'toggle_media_playback', args: {} }),
    {
      name: 'toggle_media_playback',
      description: 'Toca ou pausa a música/vídeo atualmente em reprodução.',
      schema: z.object({}),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createNextTrackTool() {
  return tool(
    async () => buildResult({ action: 'next_track', args: {} }),
    {
      name: 'next_track',
      description: 'Passa para a próxima música ou vídeo.',
      schema: z.object({}),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createPreviousTrackTool() {
  return tool(
    async () => buildResult({ action: 'previous_track', args: {} }),
    {
      name: 'previous_track',
      description: 'Volta para a música ou vídeo anterior.',
      schema: z.object({}),
      responseFormat: 'content_and_artifact',
    },
  );
}
```

**File: `apps/backend-ts/src/session/tools.ts` (modification)**

```typescript
export function setupTools(memory: MemoryManager): ToolInterface[] {
  return [
    createRecallMemoryTool(memory),
    createRequestFileActionTool(clientIdRef),
    // ... existing PC tools ...
    createPlayPauseTool(),          // NEW
    createNextTrackTool(),          // NEW
    createPreviousTrackTool(),      // NEW
  ];
}
```

**File: `apps/desktop/src/main/actions/media-controls.ts` (new file)**

```typescript
import robot from 'robotjs';
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';

export const playPauseHandler: ActionHandler = async () => {
  try {
    robot.keyTap('playpause');
    return ok('media playback toggled');
  } catch (err) {
    return fail(`failed to toggle media: ${(err as Error).message}`);
  }
};

export const nextTrackHandler: ActionHandler = async () => {
  try {
    robot.keyTap('medianext');
    return ok('next track triggered');
  } catch (err) {
    return fail(`failed to next track: ${(err as Error).message}`);
  }
};

export const prevTrackHandler: ActionHandler = async () => {
  try {
    robot.keyTap('mediaprevious');
    return ok('previous track triggered');
  } catch (err) {
    return fail(`failed to previous track: ${(err as Error).message}`);
  }
};
```

**File: `apps/desktop/src/main/actions/index.ts` (modification)**

```typescript
import { openFileHandler } from './open-file.js';
// ... other imports ...
import { playPauseHandler, nextTrackHandler, prevTrackHandler } from './media-controls.js';  // NEW

export const actionHandlers: Record<string, ActionHandler> = {
  open_file: openFileHandler,
  // ... existing handlers ...
  toggle_media_playback: playPauseHandler,      // NEW
  next_track: nextTrackHandler,                 // NEW
  previous_track: prevTrackHandler,             // NEW
};
```

### Complexity: **MEDIUM** (~100 LOC)

### Build order: **PHASES 4–5**

---

## Feature: Action Confirmation Model (FACT-10, 11)

**Requirement:** Skip toast confirmation for read-only actions; keep confirmation for destructive actions.

### Current State (v2.2 Phase 54)

```typescript
// apps/desktop/src/main/action-executor.ts
const requiresConfirmation = new Set<string>();  // Empty — all actions use default

export function createActionExecutor(deps: CreateActionExecutorDeps) {
  const { requiresConfirmation = new Set<string>(), ... } = deps;
  // ... uses requiresConfirmation to gate dialog ...
}
```

### Change

Initialize `requiresConfirmation` Set with only **destructive** action names:

```typescript
// apps/desktop/src/main/ipc/chat.ts (where ActionExecutor is created)

const requiresConfirmation = new Set([
  'delete_file',       // Destructive
  'move_file',         // Destructive (changes location)
  'rename_file',       // Destructive (unsure if user intends)
  // Skip: 'open_file', 'open_folder', 'view_content' — read-only
]);

const executor = createActionExecutor({
  handlers: actionHandlers,
  requiresConfirmation,  // Now non-empty
  backendClient,
  dialog,
});
```

### Impact

- **openFolder** — No confirmation (reads only)
- **openFile** — No confirmation (reads only) + fallback
- **viewContent** — No confirmation (reads only)
- **deleteFile** — Confirmation required
- **moveFile** — Confirmation required
- **closeApp** — No confirmation (but should it?)

### Decision: Should closeApp require confirmation?

**Current:** No confirmation (app-level, not file-level)  
**Risk:** User accidentally closes important app  
**Recommendation:** Add `'close_app'` to `requiresConfirmation` Set for v2.3

### Complexity: **LOW** (~3 LOC)

---

## New vs Modified Components Summary

### New Files

| File | Purpose | LOC | Phase |
|------|---------|-----|-------|
| `apps/desktop/src/main/actions/media-controls.ts` | Media control handlers | 40 | 4–5 |

### Modified Files

| File | Change | LOC Delta | Phase |
|------|--------|-----------|-------|
| `apps/backend-ts/src/llm/types.ts` | Add `'gemini'` to union | +1 | 2 |
| `apps/backend-ts/src/llm/config.ts` | Add `GEMINI_API_KEY` schema | +3 | 2 |
| `apps/backend-ts/src/llm/factory.ts` | Add `case 'gemini'` | +12 | 2 |
| `apps/backend-ts/src/session/pc-tools.ts` | Add 3 media tool factories | +60 | 4 |
| `apps/backend-ts/src/session/tools.ts` | Register media tools | +3 | 4 |
| `apps/desktop/src/main/store.ts` | Update `VALID_LLM_PROVIDERS` | +1 | 2 |
| `apps/desktop/src/main/actions/open-file.ts` | Add fallback logic | +8 | 3 |
| `apps/desktop/src/main/actions/index.ts` | Register media handlers | +3 | 4 |
| `apps/desktop/src/main/ipc/chat.ts` | Init `requiresConfirmation` Set | +4 | 3 |

**Total new code:** ~135 LOC

---

## Build Order & Phase Structure

### Phase 1: Research LM Studio Streaming (1–2 days)

**Goal:** Determine if code change needed for streaming events.

**Tasks:**
1. Read langchain-openai@0.3.x CHANGELOG + source code
2. Test against LM Studio v0.2.26+ with `DEBUG=*`
3. Measure token latency before/after
4. **Decision:** No change needed → COMPLETE | Change needed → escalate to Phase 2

**Deliverables:**
- Research findings in `.planning/research/STREAMING-EVENTS-RESEARCH.md`
- Decision: implement custom class or use defaults

### Phase 2: Gemini LLM Provider Integration (3–5 days)

**Goal:** Add Gemini to factory, settings, and test E2E.

**Tasks:**
1. Add `ChatGoogleGenerativeAI` to factory.ts
2. Update config.ts, types.ts, store.ts
3. Unit test: factory instantiation
4. Integration test: chat with GEMINI_API_KEY set
5. E2E test: Settings UI → select Gemini → send message

**Deliverables:**
- Working Gemini provider in production
- Tests passing
- Docs updated (README: LLM provider list)

### Phase 3: File Opener Fallback & Action Confirmation (2–3 days)

**Goal:** Add fallback for unsupported files; model confirmation correctly.

**Tasks:**
1. Modify `open-file.ts` to add `shell.openExternal()` fallback
2. Initialize `requiresConfirmation` Set with destructive actions only
3. Unit test: fallback logic
4. E2E test: open .zip/.rar → system dialog

**Deliverables:**
- File fallback working
- Confirmation model correct (read-only = no toast)
- Tests passing

### Phase 4: Media Controls — Core (4–6 days)

**Goal:** Implement play/pause, next, prev tools and handlers.

**Tasks:**
1. Add 3 tool factories to pc-tools.ts
2. Create media-controls.ts with keyboard simulation
3. Register in action handlers
4. Cross-platform testing (Windows, macOS, Linux)
5. Unit test: handler stubs
6. Integration test: SSE → Electron → media key

**Deliverables:**
- Media controls working on dev system
- Tests passing
- Fallback strategy for robotjs failures documented

### Phase 5: Media Controls — Polish & Voice UX (2–3 days)

**Goal:** System prompt updates, E2E voice testing, UX refinement.

**Tasks:**
1. Update system prompt to include media control guidance
2. E2E voice test: "próxima música" → skips track
3. E2E voice test: "aumenta o volume" → volume changes
4. Settings tooltip updates
5. Release notes

**Deliverables:**
- Voice commands recognized correctly
- E2E tests passing
- Documentation updated

### Phase 6: Embedding Priority (Optional, 1 day)

**Goal:** Add AbortController if embedding latency observed.

**Tasks:**
1. Monitor v2.2 production for LLM lag during concurrent embedding
2. If observed: add AbortController to ChatSession
3. Test: no regression in memory extraction

**Deliverables:**
- (If needed) Optimized embedding cancellation

---

## Component Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                  JARVIS v2.3 Full Stack                        │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Electron Renderer (React)                                     │
│  ┌──────────────────────────────────────────────────┐         │
│  │ Settings Panel                                   │         │
│  │  + Provider Dropdown: [... | Gemini]             │         │
│  │  + LM Studio URL, Wake Word Threshold, etc.      │         │
│  └──────────────┬───────────────────────────────────┘         │
│                 │ IPC: apply-llm-provider-without-restart     │
│  ┌──────────────▼───────────────────────────────────┐         │
│  │ Chat Component                                   │         │
│  │  + Input: "próxima música"                       │         │
│  │  + Toast: action confirmations (read-only skip) │         │
│  └──────────────┬───────────────────────────────────┘         │
│                 │ IPC: chat:send-text                         │
│                                                                │
│  Electron Main (Node.js)                                      │
│  ┌──────────────────────────────────────────────────┐         │
│  │ Store (electron-store)                           │         │
│  │  llmProvider, lmStudioUrl, wakeWordThreshold    │         │
│  └──────────────────────────────────────────────────┘         │
│  ┌──────────────────────────────────────────────────┐         │
│  │ SSE Client (/api/chat/stream)                    │         │
│  │  + Tokens → renderer                             │         │
│  │  + Actions → actionExecutor                      │         │
│  └──────────────┬───────────────────────────────────┘         │
│                 │                                              │
│  ┌──────────────▼───────────────────────────────────┐         │
│  │ Action Executor                                  │         │
│  │  requiresConfirmation = {'delete_file', ...}    │         │
│  │  + Queued execution, dedup, confirmation gate   │         │
│  └──────────────┬───────────────────────────────────┘         │
│                 │                                              │
│  ┌──────────────▼───────────────────────────────────┐         │
│  │ Action Handlers                                  │         │
│  │  + open-file (with fallback)                     │         │
│  │  + toggle_media_playback (robot.keyTap)         │         │
│  │  + next_track (robot.keyTap)                    │         │
│  │  + previous_track (robot.keyTap)                │         │
│  │  + ... other file/app/system actions            │         │
│  └──────────────┬───────────────────────────────────┘         │
│                 │ HTTP: postToolCallResult (success/error)   │
│                                                                │
│  Backend-TS (Node.js + Express)                              │
│  ┌──────────────────────────────────────────────────┐         │
│  │ Config Loader (Zod)                              │         │
│  │  + LLM_PROVIDER (from electron-store)            │         │
│  │  + GEMINI_API_KEY (from .env)                    │         │
│  │  + LM_STUDIO_URL (from electron-store)           │         │
│  └──────────────┬───────────────────────────────────┘         │
│                 │                                              │
│  ┌──────────────▼───────────────────────────────────┐         │
│  │ LLM Factory                                      │         │
│  │  case 'lmstudio' → ChatOpenAI                   │         │
│  │  case 'openai' → ChatOpenAI                     │         │
│  │  case 'anthropic' → ChatAnthropic               │         │
│  │  case 'gemini' → ChatGoogleGenerativeAI (NEW)   │         │
│  └──────────────┬───────────────────────────────────┘         │
│                 │                                              │
│  ┌──────────────▼───────────────────────────────────┐         │
│  │ Tool Registry (LangChain)                        │         │
│  │  + recall_memory, request_file_action           │         │
│  │  + open_app, close_app, set_volume, set_bright  │         │
│  │  + toggle_media_playback (NEW)                   │         │
│  │  + next_track (NEW)                             │         │
│  │  + previous_track (NEW)                         │         │
│  │  + ... other PC control tools                   │         │
│  └──────────────┬───────────────────────────────────┘         │
│                 │                                              │
│  ┌──────────────▼───────────────────────────────────┐         │
│  │ Chat Session (ReAct Loop)                        │         │
│  │  + LLM invoke → tokens (SSE)                     │         │
│  │  + Tools available for function calling         │         │
│  │  + Fire-and-forget: embeddings (no priority)    │         │
│  └──────────────────────────────────────────────────┘         │
│  ┌──────────────────────────────────────────────────┐         │
│  │ Memory (ChromaDB + SQLite)                       │         │
│  │  + Semantic search, conversation history        │         │
│  │  + Extraction (background, non-blocking)        │         │
│  └──────────────────────────────────────────────────┘         │
│                                                                │
│  External APIs                                                │
│  ┌──────────────────────────────────────────────────┐         │
│  │ Google Generative AI API (NEW)                   │         │
│  │  + Gemini 2.0 Flash, etc.                        │         │
│  │ OpenAI API (existing)                            │         │
│  │ Anthropic Claude API (existing)                  │         │
│  │ LM Studio (local, via localhost:1234)            │         │
│  └──────────────────────────────────────────────────┘         │
│                                                                │
│  OS / Environment                                             │
│  ┌──────────────────────────────────────────────────┐         │
│  │ File system, media players, system volume        │         │
│  │ Keyboard events (via robotjs)                    │         │
│  └──────────────────────────────────────────────────┘         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Examples

### Example 1: Gemini Provider Selection

```
User opens Settings → Provider dropdown
  ↓ selects "Google Gemini"
  ↓ onChange → ipcRenderer.invoke('apply-llm-provider-without-restart', 'gemini')
  ↓ Electron main: store.setLlmProvider('gemini')
  ↓ electron-store persists: { llmProvider: 'gemini' }
  ↓ (Backend continues, no restart needed)
  ↓
User sends message: "quem foi o primeiro presidente do brasil?"
  ↓ Renderer: ipcRenderer.invoke('chat:send-text', message)
  ↓ Electron main: handleSendText() → openChatStream('/api/chat/stream')
  ↓ Backend: GET /api/chat/stream?message=...&apiKey=...
  ↓ Backend loads config: LLM_PROVIDER = 'gemini' (from store or .env override)
  ↓ createLLM() → case 'gemini' → ChatGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY })
  ↓ LLM inference: Gemini processes message
  ↓ Tokens streamed: "O primeiro presidente..." (token-by-token via SSE)
  ↓ Electron SSE client accumulates tokens
  ↓ Renderer displays response in real-time
```

### Example 2: File Opener Fallback

```
LLM determines: User wants to open ~/Downloads/archive.zip
  ↓ LLM calls request_file_action tool: { action: 'openFile', path: '~/Downloads/archive.zip' }
  ↓ Tool returns payload: { action: 'open_file', args: { path } }
  ↓ SSE event: action → Electron actionExecutor
  ↓ Action queued, dedup TTL tracked
  ↓ requiresConfirmation.has('open_file') = false → skip dialog
  ↓ openFileHandler(path):
    1. shell.openPath(path) → error: "no app handler for .zip"
    2. [NEW] shell.openExternal(`file://${path}`) → succeeds
    3. return ok("opened file via system handler")
  ↓ postToolCallResult(success=true) → Backend logs action
  ↓ Renderer toast: "Arquivo aberto" (2s, auto-closes)
  ↓
OS opens default archive app (7-Zip, WinRAR, etc.)
  ↓ User decompresses or views archive
```

### Example 3: Media Control Voice Command

```
User says (wake word active): "Próxima música, por favor"
  ↓ STT (whisper.cpp): "próxima música por favor"
  ↓ LLM processes: Intent = media control, action = next_track
  ↓ LLM calls next_track tool → payload: { action: 'next_track', args: {} }
  ↓ SSE event: action → Electron actionExecutor
  ↓ requiresConfirmation.has('next_track') = false → skip dialog
  ↓ actionHandlers['next_track']():
    1. robot.keyTap('medianext') → sends MediaNext keyboard event
  ↓ postToolCallResult(success=true) → success
  ↓ Renderer toast: "Próxima faixa" (2s, auto-closes)
  ↓
Active media player (Spotify, VLC, etc.) receives keyboard event
  ↓ Media player skips to next track
  ↓ (If Spotify: API call triggers, track changes)
  ↓ User hears next song
```

---

## Risk Assessment & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Gemini API Key validation fails** | MED | HIGH | Add startup validation per OpenAI/Anthropic pattern; test with real key during Phase 2 |
| **LM Studio streaming change breaks inference** | LOW | HIGH | Phase 1 research determines if code change needed; test against v0.2.26+ before commit |
| **robotjs compilation fails on Windows** | MED | MED | Pre-compile wheels in CI/CD; fallback to Windows Media Control API if needed |
| **Media key codes not recognized on Linux/macOS** | LOW | MED | Phase 4 cross-platform testing identifies platform-specific codes; use native APIs as fallback |
| **File fallback creates security issue** | LOW | MED | Paths already validated via Zod whitelist in backend; openExternal on untrusted path is low-risk |
| **Embedding latency blocks LLM on LM Studio** | LOW | MED | Current fire-and-forget design prevents this; Phase 6 adds AbortController if observed |
| **Provider dropdown stale in Settings** | LOW | LOW | Dropdown reads from `VALID_LLM_PROVIDERS` array dynamically; always in sync |

---

## Testing Strategy

### Unit Tests (to add/modify)

1. **`llm/factory.test.ts`** — Add snapshot test for Gemini case
2. **`actions/open-file.test.ts`** — Add test for fallback logic
3. **`actions/media-controls.test.ts`** — Stub handlers, mock robotjs

### Integration Tests

1. **Chat with Gemini API** — Full chat request with GEMINI_API_KEY set
2. **File fallback E2E** — Open unsupported file type, verify system handler invoked
3. **Media control dispatch** — Next track action → robot.keyTap called

### E2E Tests (Electron)

1. **Settings UI → Gemini selection** → next chat uses Gemini
2. **Voice command "próxima música"** → Spotify/VLC actually skips
3. **Voice command "aumenta o volume"** → system volume changes

---

## Open Questions & Decision Points

1. **LM Studio streaming:** Does langchain-openai v0.3.x auto-optimize? (Phase 1 research)
2. **robotjs cross-platform:** Do media key codes (`'playpause'`, `'medianext'`) work on all OSes? (Phase 4 testing)
3. **Gemini context window:** How large vs Claude/GPT-4? Affects system prompt injection. (Phase 2)
4. **Media controls + Always-Listening:** Should media commands trigger intent classifier, or bypass it? (Phase 5)
5. **embeddings abort:** Has v2.2 reported LLM lag during concurrent embedding? (Phase 6 decision)

---

## Final Recommendations

| Feature | Priority | Complexity | Confidence | Build Order |
|---------|----------|-----------|-----------|------------|
| 1. Gemini | HIGH | LOW | HIGH | Phase 2 |
| 2. LM Studio Streaming | MED | UNKNOWN | LOW | Phase 1 (research) |
| 3. Embedding Priority | LOW | LOW | HIGH | Phase 6 (defer) |
| 4. File Fallback | MED | LOW | HIGH | Phase 3 |
| 5. Media Controls | MED | MED | MED | Phases 4–5 |
| Action Confirmation | HIGH | LOW | HIGH | Phase 3 |

**Total v2.3 effort:** 2–3 weeks (Phases 1–5)  
**Suggested start:** Immediately after v2.2 ships (2026-05-06)  
**Target release:** ~2026-05-20 (2 weeks)

---

## References & Sources

- **LangChain Google Generative AI:** [npm](https://www.npmjs.com/package/@langchain/google-genai)
- **Electron shell module:** [Docs](https://www.electronjs.org/docs/api/shell)
- **robotjs keyboard simulation:** [GitHub](https://github.com/octalmage/robotjs)
- **Windows Media Control API:** [Microsoft Docs](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediacontrolsessionmanager)
- **Linux D-Bus MPRIS:** [Freedesktop Spec](https://specifications.freedesktop.org/mpris-spec/latest/)
- **Google Generative AI API:** [Docs](https://ai.google.dev/)
- **LM Studio API Docs:** [Official](https://lmstudio.ai/docs/app/api/endpoints/openai)

---

**Document complete. Ready for phase execution via `/gsd:execute-phase`.**
