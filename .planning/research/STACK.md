# Technology Stack — v2.2 LLM Actions & Streaming TTS

**Project:** JARVIS v2.2  
**Researched:** 2026-05-05  
**Current Stack:** Node.js 22 + TypeScript 5.6+ + Express 5 + Electron + LangChain.js 1.x

---

## New Additions for v2.2

### 1. Bidirectional Backend→Electron Action Channel

**Context:** v2.1 shipped unidirectional SSE (backend→client). v2.2 needs backend to push tool execution commands to a specific Electron client. Multiple Electron instances may connect; routing must target correct device.

#### Recommended: WebSocket (ws) + Express integration

| Component | Library | Version | Purpose | Why Chosen |
|-----------|---------|---------|---------|-----------|
| WebSocket Server | **ws** | 8.20.0+ | Low-level WebSocket implementation for Express | Standard, lightweight, zero-dependency layer; no sticky session requirement unlike Socket.io. Single server instance handles multiple clients cleanly. |
| Express Integration | **express-ws** | 6.0.0+ | Wraps ws for Express-like route definition (optional) | Simplifies route definition if preferred; OR use raw `ws` with manual upgrade handler. Recommend: **express-ws** for v2.2 MVP. |
| Client ID Management | **uuid** | 9.0.0+ | Generate unique Electron client IDs on connection | Standard library for connection tracking and routing. |

#### Integration Points

**Backend changes (port 8001):**
- `POST /api/chat` → (existing SSE endpoint) — no change
- `GET /api/chat/stream` → (existing SSE endpoint) — no change
- **NEW:** `WS /api/actions` — WebSocket endpoint on same Express server
  - On connection: Electron sends `{ clientId: "uuid", deviceName: "user-pc" }`
  - Backend maintains `Map<clientId, WebSocket>` in memory
  - Tool execution routed: backend queries LLM, receives action payload, sends via `wsMap.get(clientId).send(JSON.stringify(action))`

**Gateway changes (port 3000):**
- Proxy `WS /api/actions` to `WS localhost:8001/api/actions`
- No buffering needed (unlike SSE passthrough)

**Electron changes:**
- Connect to `WS /api/actions` on startup
- Receive action payload on `ws.onmessage = (e) => executeTool(JSON.parse(e.data))`
- IPC to renderer for confirmations, logged to SQLite tool audit

#### Architecture Notes

- **Stateful routing:** Map stored in memory; survives request lifetime unlike SSE
- **Multiple Electron clients:** Each client sends unique `clientId` on connection; backend routes to correct one
- **Fallback path:** If WS unavailable, tools fail gracefully (no blocking gateway)
- **Persistence:** Tool execution logged to backend SQLite — WebSocket is transport only

---

### 2. Streaming TTS (Token-by-Token Playback)

**Context:** Current TTS generates full audio, then plays. Latency ~2-3s before first sound. Streaming reduces to ~500ms perceived latency.

#### ElevenLabs Streaming (Primary)

| Component | Library/API | Version | Purpose | Why Chosen |
|-----------|-------------|---------|---------|-----------|
| Official SDK | **@elevenlabs/elevenlabs-js** | 0.3.0+ | ElevenLabs Node.js SDK with streaming | Official, maintained, supports `.stream()` method for chunked audio. Audio format: MP3 (default mp3_44100_128), PCM, µ-law. |
| Streaming Pattern | HTTP chunked (built-in SDK) | native | SDK wraps `fetch` with chunked response | `.stream()` returns async iterator of audio chunks |

**Latency profile:**
- Time-to-first-byte: ~200-300ms (ElevenLabs API)
- Per-chunk delivery: ~50-100ms
- Perceived latency: ~500ms (first chunk played while rest streams)

#### Murf.ai Streaming (Fallback/Alternative)

| Component | API | Method | Purpose | Why |
|-----------|-----|--------|---------|-----|
| Murf Streaming | HTTP chunked via Falcon model | REST streaming | Ultra-low latency TTS (~130ms time-to-first-audio) | Faster than ElevenLabs, but requires separate API credentials. Use as fallback or primary for latency-critical cases. |

**Note:** Murf.ai does NOT have an official npm package; use REST API directly via `fetch()`.

**Streaming Formats:**
- ElevenLabs: MP3 (variable bitrate), PCM, µ-law
- Murf Falcon: MP3 or WAV

#### Backend Integration

**Current flow (v2.1):**
1. Backend LLM streams text tokens via SSE
2. Electron collects full text
3. Electron batches text to TTS
4. TTS returns full audio blob
5. Play entire blob

**v2.2 streaming flow:**
1. Backend LLM streams text tokens via SSE (unchanged)
2. Electron accumulates tokens until sentence boundary
3. On boundary, send sentence to TTS .stream()
4. Play audio chunks as they arrive (overlapping with next sentence generation)
5. No waiting for full response

**Implementation flag:**
```
STREAMING_TTS=true
TTS_STREAMING_PROVIDER=elevenlabs
```

---

### 3. Memory/Heap Soak Testing (8h Always-Listening Validation)

**Context:** Always-Listening runs 24/7 in v1.9. v2.2 needs formal 8h heap validation to catch memory leaks.

#### Heap Profiling Tools

| Tool | Library | Version | Purpose | When to Use |
|------|---------|---------|---------|-------------|
| Heap Snapshots | **heapdump** | 0.8.0+ | Capture V8 heap at intervals | Baseline snapshots (start, mid, end) — compare in DevTools to find retained objects |
| Memory Watcher | **memwatch-next** | 0.6.0+ | Event-based memory leak detection | Alerts when heap grows after GC (passive monitoring) |
| Flame Graphs | **clinic** | 15.x+ | CPU/memory visualization during load test | Real-time view of memory consumption during 8h run |
| Automated Profiling | **node --inspect** | native | Chrome DevTools remote profiling | Manual heap snapshots, timeline recording for analysis |

#### Setup

```bash
npm install --save-dev heapdump memwatch-next clinic
```

**Soak Test Script** creates heap snapshots at:
- Start (baseline)
- 4 hours (mid-test)
- 8 hours (final comparison)

**Load Test Driver** (simulate Always-Listening):
- Audio frames via IPC every 10 seconds
- Varies audio length (0.5s - 5s utterances)
- Tracks VAD, STT, intent classifier memory across cycles

#### Load Test Library (Optional)

| Library | Version | Purpose | When |
|---------|---------|---------|------|
| **autocannon** | 7.10.0+ | HTTP load testing backend endpoints | If testing backend memory isolation separately |

---

## Integration Summary

### Gateway (port 3000, Express 5)
- **Existing:** SSE `/api/chat/stream` passthrough (no change)
- **NEW:** WebSocket `/api/actions` upgrade handler → proxy to backend WS
- **Unchanged:** HTTP routes (POST /api/chat, GET /api/health, etc.)

### Backend-TS (port 8001, Express 5)
- **Existing:** `/api/chat` (HTTP), `/api/chat/stream` (SSE)
- **NEW:** `/api/actions` WebSocket endpoint
  - On connection: receive clientId, store in `wsMap`
  - Tool execution: look up client, send action payload
- **NEW:** TTS streaming integration
  - Break Electron text batching into sentences
  - Call ElevenLabs/Murf `.stream()` on each sentence
  - Push chunks to Electron via existing IPC

### Electron (Renderer + Main)
- **NEW:** WebSocket client to `/api/actions`
  - Auto-reconnect on disconnect
  - Execute received actions immediately
- **NEW:** Streaming TTS reception
  - Accumulate tokens until sentence boundary
  - Trigger `.stream()` on backend
  - Receive chunks, queue to Web Audio API

### Memory Testing
- Separate script, runs independent 8h loop
- No changes to core JARVIS code
- Optional CI integration

---

## Versions Confirmed (2026-05-05)

| Package | Latest | Recommended | Notes |
|---------|--------|-------------|-------|
| ws | 8.20.0 | 8.20.0+ | Released 2026-01; active maintenance |
| express-ws | 6.0.0 | 6.0.0+ | Last update 2025; stable |
| @elevenlabs/elevenlabs-js | 0.3.0+ | 0.3.0+ | Official SDK; streaming via .stream() |
| heapdump | 0.8.0 | 0.8.0+ | Stable; v8 compatible |
| memwatch-next | 0.6.0 | 0.6.0+ | Community fork of original memwatch |
| clinic | 15.x | 15.x | Latest; flame graphs included |
| autocannon | 7.10.0 | 7.10.0+ | HTTP benchmarking; soak test capable |

---

## Installation

```bash
# Core bidirectional communication
npm install ws express-ws uuid

# TTS Streaming
npm install @elevenlabs/elevenlabs-js

# Dev: Memory testing
npm install --save-dev heapdump memwatch-next clinic
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Socket.io** | Requires sticky sessions on load balancers; overkill for agent→device routing | `ws` + `express-ws` |
| **Murf npm package** | No official npm package; API-only | Direct REST to Murf API |
| **Native TTS (kokoro port)** | Out of scope for v2.2; local fallback exists | Keep HTTP TTS providers (ElevenLabs/Murf) |
| **Async iterators for non-streaming** | Unnecessary for full-audio TTS endpoints | Use `.stream()` only for streaming providers |
| **Logging heap every 1 second** | Noise; unreadable data | 5-minute intervals |

---

## Known Constraints

1. **Electron clientId storage:** Generated on each app startup (no persistence). If user restarts app mid-conversation, old clientId is orphaned in wsMap. **Mitigation:** Add 60s TTL cleanup for idle connections, or persist clientId in electron-store.

2. **TTS sentence boundary detection:** Naïve `\. |\? |! ` split. Fails on abbreviations (e.g., "Dr. Smith"). **Better:** Use LLM sentence tokenizer or library like `sent-tokenize`.

3. **Murf API instability:** Real-time streaming via Murf Falcon is newer (2026). ElevenLabs more battle-tested. **Recommendation:** Ship with ElevenLabs primary, Murf as optional fallback (feature flag).

4. **Soak test automation:** 8-hour run cannot be triggered from CI easily. **Plan:** Manual soak test pre-release, automated weekly soak in staging only (no blocking gate).

---

## Sources

- [RxDB WebSocket vs SSE comparison (2026)](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)
- [Ably WebSocket vs SSE](https://ably.com/blog/websockets-vs-sse)
- [OneUptime SSE vs WebSocket guide](https://oneuptime.com/blog/post/2026-01-27-sse-vs-websockets/view)
- [ws WebSocket library - NPM](https://www.npmjs.com/package/ws)
- [express-ws documentation - NPM](https://www.npmjs.com/package/express-ws)
- [ElevenLabs Streaming API docs](https://elevenlabs.io/docs/api-reference/streaming)
- [ElevenLabs Text-to-Speech Streaming guide](https://elevenlabs.io/docs/developers/guides/cookbooks/text-to-speech/streaming)
- [@elevenlabs/elevenlabs-js SDK - NPM](https://www.npmjs.com/package/@elevenlabs/elevenlabs-js)
- [Murf.ai Streaming API docs](https://murf.ai/api/docs/text-to-speech/streaming)
- [Murf Falcon streaming model (130ms latency)](https://murf.ai/falcon)
- [heapdump - NPM](https://www.npmjs.com/package/heapdump)
- [memwatch-next - NPM](https://www.npmjs.com/package/memwatch-next)
- [Clinic.js profiling tool](https://clinicjs.org/)
- [DEV Community: Node.js Memory Leak Profiling (2026)](https://dev.to/_d7eb1c1703182e3ce1782/nodejs-memory-management-and-profiling-find-and-fix-memory-leaks-in-2026-od4)
- [Autocannon HTTP benchmarking - NPM](https://www.npmjs.com/package/autocannon)
- [AppSignal: Performance and Stress Testing in Node.js](https://blog.appsignal.com/2025/06/04/performance-and-stress-testing-in-nodejs.html)
- [Electron Performance Documentation](https://www.electronjs.org/docs/latest/tutorial/performance)

---

*Last updated: 2026-05-05 — Research for v2.2 stack additions (WebSocket, streaming TTS, memory testing)*
