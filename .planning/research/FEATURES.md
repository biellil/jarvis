# Feature Landscape: JARVIS v2.2 LLM Actions & Polish

**Domain:** Personal AI Assistant (Electron desktop + Node.js backend + LangChain.js)
**Researched:** 2026-05-05
**Confidence:** HIGH (ElevenLabs/Murf official docs), MEDIUM (LLM routing architecture, memory soak test patterns)

---

## 1. LLM→Electron Actions: File & Folder Operations

**Status:** NEW feature (not in v2.1)
**Complexity:** Medium
**Dependencies:** Existing LLM agent framework, SSE bidirectional streaming, Electron IPC

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| LLM can request to open file | Core assistant use case — "show me the notes I wrote last Tuesday" | Low | Electron `shell.openPath(filePath)` or app-specific handler |
| LLM can request to open folder | File explorer navigation by voice — "open Downloads folder" | Low | Electron `shell.openPath(dirPath)` |
| LLM can request to view file (inline) | Read text files without external app — for quick reference | Medium | Parse text files, return content in SSE stream to UI |
| Error state when file/folder not found | Graceful failure — "I couldn't find that file on disk" | Low | Check `fs.existsSync()` before dispatch; return error message to LLM and user |
| Action confirmation before executing | User must authorize file/folder opening — security/privacy boundary | Low | Toast or confirmation dialog; user approval required before Electron executor runs |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-device routing (if multiple Electron clients) | JARVIS remembers which PC the action targets | High | Future-proofing: requires client registry, session affinity, or explicit user choice in Settings |
| Sandbox file picker (allow user to select file to show) | "Show me a file I pick" vs "open Downloads" | Medium | Electron `dialog.showOpenDialog()` invoked by LLM intent, returns path to LLM context |
| Inline file preview (< 100KB text files) | View file without leaving JARVIS widget | Medium | Read + truncate + render as code block in chat history |
| Audit log of file operations | Compliance + debugging — what files the LLM accessed | Low | Log to SQLite: timestamp, action type, path, success/error, LLM model |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| LLM can modify/delete files | Destructive capability without strong guardrails | File operations are read-only (open/view) in MVP; defer write capability to v2.3+ |
| LLM can access any path (including /home, /System, Windows\System32) | Security hole + privacy violation | Whitelist: only user's home directory, Downloads, Documents, Desktop; reject absolute paths outside whitelist |
| Automatic opening of executables | RCE vulnerability — LLM could execute arbitrary code | Reject file paths with extensions [.exe, .sh, .bat, .com, .scr, .app]; only allow document types [.txt, .md, .pdf, .docx, .json, .yaml] |
| Open file without user confirmation | User loses control over what executes | Always show toast confirmation: "JARVIS wants to open [filename]. Allow?" — async wait for response before dispatch |

### Confirmation UX Pattern

Based on 2026 UX best practices, confirmation dialogs should:
- **Be specific:** "Open 'notes.txt' in default editor?" vs generic "Allow action?"
- **Appear close to action trigger:** Toast near the Orb or in chat history, not modal window
- **Offer undo:** After file opens, show "Undo" button in toast for ~5 seconds
- **Never block voice:** Confirmation should be non-blocking; if user doesn't respond in 10 seconds, timeout silently (don't nag)

### Error Handling States

| Scenario | Expected Behavior | User Feedback |
|----------|-------------------|---------------|
| File not found | Return structured error: `{ success: false, error: "File not found", path: "..." }` | Toast: "I couldn't find notes.txt — maybe it was deleted?" |
| File too large (> 1MB) | Reject inline preview; offer "Open in app" instead | Toast: "notes.txt is too large to preview — open in editor?" |
| Permission denied (macOS/Linux) | Catch EACCES; return error | Toast: "JARVIS doesn't have permission to access that file" |
| Path outside whitelist | Reject at backend; never dispatch to Electron | Toast: "JARVIS can't access that location for security" |
| User denies confirmation | Abort silently; log in audit trail | No toast (user already said no); LLM gets: "User declined action" |

### Routing Strategy (Multi-Device)

If JARVIS runs on multiple PCs (future v2.3+):
- **Backend generates payload:** `{ clientId?, action, filePath, ... }`
- **Gateway routes to correct Electron client:** SSE stream has clientId header; gateway multiplexes
- **Single-client MVP:** Assume one Electron client; set `clientId = "primary"` by default
- **User choice:** If multiple clients online, Settings modal: "Which device should open this file?" (dropdown, save preference)

---

## 2. Streaming TTS: Sentence-by-Sentence Audio Playback

**Status:** NEW feature (replaces full-audio-generation-first model)
**Complexity:** Medium-High
**Dependencies:** Existing TTS providers (ElevenLabs/Murf.ai), HTTP chunked transfer, audio playback pipeline in Electron

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| TTS starts playing before full generation completes | Perceived latency << actual latency; users expect <200ms time-to-first-byte | High | Sentence-level chunking + streaming HTTP response handling |
| Chunked at sentence boundaries | Preserves natural pauses + intonation; avoids mid-word audio cuts | Medium | Regex: split on `[.!?]\s+` or use LLM to mark sentence boundaries |
| MP3 audio format | Industry standard for TTS delivery (ElevenLabs/Murf default) | Low | Both providers default to MP3; decode + playback in Electron via Web Audio API or native player |
| Graceful fallback to full audio | Network timeout or provider unavailable | Medium | Start playback from first sentence; if rest of stream dies, show "Connection lost" and repeat last sentence |

### How Streaming TTS Works (2026)

**ElevenLabs & Murf both support:**
- **HTTP chunked transfer encoding:** Client receives MP3 bytes as they're generated, not waiting for full file
- **Sentence-level input:** Send text incrementally (sentence by sentence) via WebSocket or HTTP POST
- **Time-to-first-byte:** ~130ms (Murf Falcon model), 200–300ms (ElevenLabs standard)
- **Audio format:** MP3 by default; can also request WAV/PCM for lower latency (no decoding overhead)

**Implementation strategy:**
1. **Backend chunks LLM response** at sentence boundaries (e.g., split on `[.!?]\s+`)
2. **For each sentence:**
   - Send to TTS provider's streaming endpoint
   - Provider returns MP3 bytes incrementally via chunked HTTP
   - Electron immediately starts playback (Web Audio API or `<audio>` buffer)
3. **Overlap:** While sentence N is playing, backend is already fetching sentence N+1

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| PCM format option | Lowest latency (no MP3 decode) — for ultra-responsive voice agents | High | ElevenLabs/Murf support PCM; Electron needs custom audio sink |
| Word-level alignment metadata | Show current word being spoken (for reading along UI) | High | ElevenLabs WebSocket API returns alignment info; Murf does not (yet) |
| Custom voice parameters per sentence | Change pitch/speed mid-response | Medium | Some providers support SSML; Murf has style/pitch params per request |
| Pause/resume TTS stream mid-playback | User interrupts; resume when they're done | Medium | Buffer audio in ring buffer; pause output device |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Word-by-word streaming | Unnatural-sounding speech; excessive latency overhead | Sentence-level is the sweet spot (50–100 chars per chunk) |
| Streaming STT input (speech-to-text via stream) while TTS is playing | Doubles microphone load; interference | Use PTT hotkey or Always-Listening pre-transcribe, then generate response in one shot, then stream TTS |
| Full-text TTS request (wait for all LLM output before streaming TTS) | Reintroduces latency; defeats purpose of streaming | Trigger TTS per sentence as LLM streams (fire-and-forget) |

### Audio Format Decision

| Format | Latency | Size | Playback Complexity | Recommendation |
|--------|---------|------|---------------------|-----------------|
| MP3 | 200–300ms TTFB (includes decode) | ~10KB/sec | Web Audio API, native `<audio>` | MVP default (proven, fast decode) |
| WAV | 130–150ms TTFB (no decode) | ~200KB/sec | Direct PCM, native `<audio>` | Phase 2 optimization |
| PCM | 100–130ms TTFB (raw samples) | ~800KB/sec | Custom audio sink | Phase 2 expert feature |

### Chunking Algorithm

```
LLM outputs: "Hello. This is great. How are you?"

Chunk 1: "Hello."
  → Send to TTS → get MP3 bytes → play immediately
  
Chunk 2: "This is great."
  → Send to TTS → get MP3 bytes → queue for playback
  
Chunk 3: "How are you?"
  → Send to TTS → get MP3 bytes → queue for playback
  
Total TTFB: ~200ms (first sentence starts in 200ms)
Total playback: ~3.5s (three sentences, 1–1.5s each)
```

Savings: **Without streaming:** 3.5s (wait for full response) → **With streaming:** 0.2s perceived wait (user hears audio immediately)

---

## 3. Settings Extras: LM Studio URL, LLM Provider Switch, Wake Word Sensitivity

**Status:** NEW settings (extends v2.1 Settings UI)
**Complexity:** Low-Medium
**Dependencies:** Existing electron-store persistence, pydantic settings validation

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| LM Studio URL configuration in UI | Users running local models need to change default port/host | Low | Text input field in Settings; validate format `http://host:port` before saving |
| LLM provider dropdown (Claude/OpenAI/LM Studio) | Hot-swap between cloud and local LLMs without restart | Low | Radio button group or Select menu in Settings; persist to electron-store |
| Wake word sensitivity slider (0.0–1.0) | Tune false positives/negatives per environment | Low | Slider with numeric display; 0.3=strict, 0.5=default, 0.8=loose |
| Validation on provider switch | Prevent user selecting unavailable provider (e.g., Claude without API key) | Medium | Check env vars / credentials when user selects provider; show warning toast if missing |
| Runtime apply (no restart required) | Changes take effect immediately in voice pipeline | Medium | IPC message to update LLM factory + wake word engine without full app restart |

### LLM Provider Switching: Critical Details

**Problem (2026 research finding):** Tokenizer incompatibility. When you switch LLM providers mid-conversation, the new model's tokenizer may count tokens differently (OpenAI vs Claude can differ by 10–20% on same text). This causes **silent context overflow** — the conversation seems valid but the new model actually sees truncated context.

**JARVIS's multi-LLM handling (current):**
- LangChain.js abstracts provider via `BaseChatModel` interface
- Token counting uses provider-specific clients (langchain-openai, langchain-anthropic)
- Session history is provider-agnostic (just message objects)

**Requirement for v2.2:**
- **Before switching provider:** Recount session history with new provider's tokenizer
- **If context exceeds new provider's window:** Warn user: "Switching to Claude will lose oldest 3 messages (context overflow). Continue?" → User can choose to start fresh or stick with current provider
- **Capability mismatch:** If switching to LM Studio but LM Studio model doesn't support vision, disable vision-based tools (graceful degrade)

**Table of Provider Capabilities (2026):**

| Provider | Max Tokens | Vision | Tool Use | Cost | Setup |
|----------|-----------|--------|----------|------|-------|
| Claude (Anthropic) | 200K | ✓ (yes) | ✓ (yes) | $$ | API key in .env |
| GPT-4 / OpenAI | 128K | ✓ (yes) | ✓ (yes) | $$$$ | API key in .env |
| LM Studio (local) | 2K–32K (model-dependent) | ✗ (no) | ✓ (yes) | $ | Port 1234 (configurable) |

**Anti-pattern to avoid:** Don't silently switch providers if context overflows. User must opt-in.

### Wake Word Sensitivity Configuration

**Current implementation (v1.9):** openwakeword with fixed threshold of ~0.5
**v2.2 enhancement:** User-tunable sensitivity slider in Settings

**Sensitivity semantics:**
- **0.0–0.3:** Strict (few false positives, but might miss real "Hey JARVIS" in noisy environment)
- **0.4–0.5:** Default (balanced for typical office/home environment)
- **0.6–0.8:** Loose (catches more real activations, but higher false alarm rate in TV/conversation noise)
- **0.9–1.0:** Very loose (almost everything triggers wake word — not recommended)

**Implementation:**
1. Store sensitivity value in electron-store: `vad.wakeWordThreshold = 0.5`
2. Pass to wake word engine at startup + on Settings save via IPC
3. openwakeword's score output: [0, 1] float → compare against threshold
4. If user changes slider in Settings, update threshold via IPC without restart

**Testing guide for phase:**
- Test at 0.3 in quiet environment → should not false-trigger
- Test at 0.8 in noisy environment (TV playing) → measure false trigger rate
- Recommend default 0.5 for "typical user"

### Table Stakes (Settings Persistence)

| Setting | Stored In | Sync To | Restart Required? |
|---------|-----------|---------|-------------------|
| LM Studio URL | electron-store | Backend via Settings API endpoint | No (via IPC) |
| LLM provider | electron-store | LLM factory + Chat session | No (via IPC) |
| Wake word sensitivity | electron-store | Wake word engine | No (via IPC) |
| PTT hotkey | electron-store (v2.1) | IPC hotkey listener | No |
| TTS provider + API key | electron-store (v2.1) | Electron main voiceHandler.ts | No |

### Error Scenarios for LLM Provider Switch

| Scenario | Expected Behavior | User Feedback |
|----------|-------------------|---------------|
| Select Claude but no ANTHROPIC_API_KEY | Show validation error in Settings | Toast: "Claude selected but API key not configured. Set ANTHROPIC_API_KEY or switch provider." |
| Select LM Studio but server unreachable | Check connection on save; if fails, revert selection | Toast: "LM Studio not reachable at http://localhost:1234. Check URL and try again." |
| Current session uses Claude, user switches to LM Studio | Warn about context overflow risk | Toast: "Switching providers will start a new conversation (context incompatible). Continue?" |
| User adjusts wake word sensitivity while Always-Listening is active | Apply change immediately | Toast: "Wake word sensitivity updated" (2s, no blocking) |

---

## 4. macOS Tray Icon: Template Image (Dark/Light Mode)

**Status:** NEW UI polish (extends v1.7 cross-platform tray)
**Complexity:** Low
**Dependencies:** Electron native-image API, existing Tray setup

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Icon respects system dark/light mode | macOS convention; icon is visible in both light and dark menu bars | Low | Use template image naming: `icon{Template,Template@2x}.png` |
| Icon doesn't look washed out in dark mode | Common pitfall: solid-color icon in light mode becomes invisible in dark menu bar | Low | Template images: black + alpha channel → macOS auto-inverts for dark mode |
| No performance overhead | Icon change is instant when user changes system theme | Low | Electron handles this automatically; no polling or theme detection code needed |

### How Template Images Work (macOS)

From Electron documentation:
- **Template image naming:** File must end with `Template` in the name (e.g., `iconTemplate.png` or `iconTemplate@2x.png`)
- **Content:** Black image with alpha channel (transparency)
- **Behavior:** macOS automatically inverts colors for dark menu bar, uses as-is for light menu bar
- **DPI variants:** `@2x` suffix for Retina displays (2x resolution)

**Implementation:**
```typescript
// Before (v1.7 — solid color icon, invisible in dark mode)
const tray = new Tray(path.join(__dirname, 'icon.png'));

// After (v2.2 — template image, auto-adapts)
const tray = new Tray(path.join(__dirname, 'iconTemplate.png'));
```

### Design Spec for Icon

| Property | Value |
|----------|-------|
| Size (1x) | 22×22 pixels (standard macOS menu bar icon) |
| Size (2x) | 44×44 pixels (Retina) |
| Format | PNG (transparency support) |
| Content | Black on transparent background |
| Weight | Solid, no thin strokes (readability at 22px) |
| Naming | `iconTemplate.png` and `iconTemplate@2x.png` |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Hardcoded white or colored icon | Not a template image → macOS can't adapt → invisible in dark mode | Use black+alpha template image only |
| Separate light and dark icon variants | Manual theme detection = extra code + bugs | Template image handles both automatically |
| Vector-based SVG | Electron doesn't natively render SVG to tray; requires rasterization | Use PNG at 22px (1x) and 44px (2x) |

---

## 5. Always-Listening Soak Test: 8h Memory Validation (Not a User Feature)

**Status:** NEW validation test (internal QA, not end-user facing)
**Complexity:** High (memory profiling, automation)
**Dependencies:** Existing Always-Listening pipeline, Node.js heap profiler

### What This Tests

Not a feature that end-users see, but a formal validation that Always-Listening can run for 8 hours without:
- Heap memory growing unbounded
- RSS (resident set size) degrading
- Event loop lag increasing over time
- File handle leaks (e.g., microphone stream never closed)

### Metrics to Capture

| Metric | Tool | Why Important | Threshold |
|--------|------|---------------|-----------|
| Heap used (MB) | `process.memoryUsage().heapUsed` | Garbage collection working | Should plateau after 1h; <100MB growth over 8h |
| RSS (MB) | `process.memoryUsage().rss` | OS-level memory not released | Should not grow >200MB over 8h |
| Microphone stream open count | Count active `AudioContext` sources | File handle leak detector | Should be 1 (always one active stream in Always-Listening) |
| Event loop lag (ms) | `monitorEventLoopDelay()` API | Voice responsiveness | p99 <50ms (no blocking operations) |
| VAD activations (count) | Counter in voiceInputManager | Functional stability | Should vary naturally with room noise |
| Whisper transcriptions (count) | Counter in whisperHandler | Pipeline throughput | Should stay constant per voice utterance |

### Sample Implementation (test harness)

```typescript
// soak-test-8h.ts
import { monitorEventLoopDelay } from 'perf_hooks';

const startTime = Date.now();
const metrics = {
  heapSnapshots: [],
  eventLoopLag: [],
  vadActivations: 0,
  whisperCalls: 0,
};

// Capture every 10 minutes
setInterval(() => {
  metrics.heapSnapshots.push({
    time: Date.now() - startTime,
    heap: process.memoryUsage().heapUsed,
    rss: process.memoryUsage().rss,
  });
}, 10 * 60 * 1000);

// Log event loop lag
const h = monitorEventLoopDelay();
h.enable();
setInterval(() => {
  metrics.eventLoopLag.push({
    p99: h.percentile(99),
    mean: h.mean,
  });
  h.reset();
}, 5 * 60 * 1000);

// After 8h, output report
setTimeout(() => {
  console.log(JSON.stringify(metrics, null, 2));
  // Compare against thresholds; fail if exceeded
  process.exit(metrics.heapSnapshots.at(-1).heap > 100 ? 1 : 0);
}, 8 * 60 * 60 * 1000);
```

### Pass/Fail Criteria

| Criterion | Pass | Fail |
|-----------|------|------|
| Heap growth | <100MB over 8h | >100MB (indicates memory leak) |
| RSS stability | <200MB growth | >200MB (OS not reclaiming) |
| Event loop lag p99 | <50ms | >50ms (VoiceInputManager blocking?) |
| VAD stream closed count | 0 (never closed) | >1 (resource leak) |
| Graceful shutdown | Process exits cleanly | Hangs or crashes |

### Notes for Phase

- **Automation:** Run via CI/CD or manual desktop overnight; not user-facing
- **Environment:** Simulate voice input (generate synthetic audio or record 8h ambient noise tape)
- **Reporting:** Output JSON metrics + pass/fail summary for QA signoff
- **Pitfall:** Don't run in production; use isolated test environment
- **Documentation:** Phase should include script + results in `.planning/SOAK_TEST_RESULTS.md`

---

## Feature Dependencies

```
LLM→Electron Actions
  ← Existing LLM agent framework (v2.1)
  ← Existing SSE streaming (v2.1)
  ← New: Electron IPC command dispatch
  ← New: File operation whitelist validation

Streaming TTS
  ← Existing TTS provider integration (ElevenLabs/Murf, v1.4+)
  ← Existing Voice handler orchestration (v2.1)
  ← New: HTTP chunked response handling
  ← New: Sentence-boundary detection
  ← New: Audio queue management in Electron

Settings Extras
  ← Existing Settings UI (v2.1 Settings redesign)
  ← Existing electron-store persistence
  ← New: LLM factory hot-reload via IPC
  ← New: Wake word engine reconfiguration

macOS Tray Icon
  ← Existing Electron Tray setup (v1.7)
  ← New: PNG template assets
  ← No code dependencies (Electron handles automatically)

Soak Test
  ← Existing Always-Listening pipeline (v1.9)
  ← New: Memory profiling harness
  ← New: Test automation script
```

---

## MVP Recommendation (Phase Ordering)

**Phase 1 (foundational, no user-facing complexity):**
1. **macOS Tray Icon:** Simplest; just asset design + naming convention. No code risk.
2. **Settings Extras:** Extend existing Settings UI (low code risk, high user value for customization).

**Phase 2 (medium complexity, high value):**
3. **Streaming TTS:** Moderate architectural change (sentence chunking, HTTP streaming), but proven pattern with ElevenLabs/Murf. High UX impact.

**Phase 3 (highest complexity, most integration):**
4. **LLM→Electron Actions:** Requires new IPC dispatch path, file operation validation, multi-client routing (if applicable). Highest risk + complexity.

**Phase 4 (validation, not user-facing):**
5. **Soak Test:** Automated validation harness; no end-user feature code.

---

## Complexity Summary

| Feature | Complexity | Risk | Phase Recommendation |
|---------|------------|------|---------------------|
| macOS Tray Icon | **Low** | Low | Early (design-only) |
| Settings Extras | **Low-Medium** | Medium | Early (UI extension) |
| Streaming TTS | **Medium** | Medium | Mid (architectural change) |
| LLM→Electron Actions | **Medium-High** | High | Late (integration heavy) |
| Soak Test | **High** (setup) | Low (validation) | End (after features stable) |

---

## Sources

- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — LLM agent patterns, tool execution best practices
- [Deepgram: Text Chunking for TTS](https://developers.deepgram.com/docs/tts-text-chunking) — Sentence-level chunking for streaming TTS
- [ElevenLabs Streaming TTS API](https://elevenlabs.io/docs/api-reference/streaming) — HTTP chunked transfer, MP3 format delivery
- [Murf.ai Streaming TTS](https://murf.ai/api/docs/text-to-speech/streaming) — Falcon model latency, audio format support
- [Multi-LLM Context Management (2026)](https://earezki.com/ai-news/2026-04-24-the-hidden-challenge-of-multi-llm-context-management/) — Tokenizer incompatibility on provider switch
- [Node.js Heap Profiler](https://nodejs.org/en/learn/diagnostics/memory/using-heap-profiler) — Memory soak testing methodology
- [Node.js Event Loop Monitoring](https://trigger.dev/blog/event-loop-lag) — monitorEventLoopDelay() API
- [Electron Tray / nativeImage](https://www.electronjs.org/docs/latest/api/native-image) — Template image implementation for macOS
- [Electron Dialog API](https://www.electronjs.org/docs/latest/api/dialog) — File operation confirmation patterns
- [2026 UX Error Handling Patterns](https://blog.logrocket.com/ux-design/double-check-user-actions-confirmation-dialog/) — Confirmation dialog design best practices
- [Wake Word Sensitivity Tuning (2026)](https://picovoice.ai/blog/complete-guide-to-wake-word/) — Threshold calibration and false positive/negative tradeoffs
