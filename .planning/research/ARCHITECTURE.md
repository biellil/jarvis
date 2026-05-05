# Architecture Design: v2.2 LLM Actions & Streaming TTS

**Project:** JARVIS v2.2  
**Research Date:** 2026-05-05

## Executive Summary

v2.2 integrates three architectural extensions into the existing Electron+Express+Node.js stack:

1. **LLM Actions via SSE**: Extend `/api/chat/stream` with custom event types. EventSource natively handles custom types via addEventListener(). Perfect for MVP auto-execute. (HIGH confidence)

2. **Streaming TTS**: Web Audio API chunk decoding + buffer queuing. Lower latency than MediaSource Extensions. Backward-compatible. (HIGH confidence)

3. **Multi-Device Routing**: Gateway maintains sessionId→Set<deviceId> map. Device UUID persists via electron-store. Scales to 10-100 devices; Redis for 1000+. (MEDIUM confidence)

---

## Answer 1: SSE Action Channel Architecture

**Recommendation:** Extend existing SSE stream with custom event types.

SSE format supports multiplexing: `event: message` for tokens, `event: action` for commands. Electron EventSource natively parses custom event types via `addEventListener('action', handler)`. W3C spec verified.

**Why not WebSocket?** Only required for bidirectional signaling (user approval). For v2.2 auto-execute, SSE is lower-overhead and proven.

**Implementation:**
- Backend writes `event: action\ndata: {...}\n\n` to existing stream
- Electron renderer listens on 'action' event, parses JSON, invokes IPC
- Electron main executes action

**Confidence: HIGH** - W3C spec, Electron EventSource inherits browser API

---

## Answer 2: Streaming TTS Approach

**Recommendation:** Web Audio API chunk decoding with buffer queuing.

**Backend:** Extend TTS endpoint to support chunked HTTP. Provider returns streaming audio bytes via chunked transfer encoding.

**Electron:** Use Fetch Streams API on response.body. For each chunk:
1. Call `audioContext.decodeAudioData(chunk)` 
2. Queue decoded buffer to AudioContext
3. Schedule playback immediately
4. Overlap decode with playback for seamless streaming

Web Audio API is lower-latency than MediaSource Extensions (no codec negotiation). Chunks arrive 50-100ms apart; Web Audio queues at <20ms latency.

**Backward compatibility:** Non-streaming TTS fallback via header detection.

**Confidence: HIGH** - Fetch Streams and Web Audio API are standard

---

## Answer 3: Multi-Device Session Routing

**Recommendation:** In-memory routing map at gateway level.

**Architecture:**
- Each Electron instance: persistent device UUID via crypto.randomUUID() + electron-store
- Session ID: URL query param or header
- Gateway middleware: Map<sessionId, { clients: Map<deviceId, Response> }>
- On SSE connect: add device to clients set
- On finish: remove device
- Cleanup: garbage-collect empty sessions after timeout

Backend includes deviceId in action payloads. Gateway can filter device-specific actions if needed.

**Scaling:** In-memory sufficient for 10-100 devices per session. For 1000+, use Redis: `SADD session:${sessionId} ${deviceId}`.

**Confidence: MEDIUM** - Pattern sound, needs load testing

---

## Answer 4: Suggested Build Order

**Critical path (minimum v2.2): 10 days**
- Phase 51-52: SSE actions (2+2 days, parallelizable)
- Phase 53-54: Streaming TTS (2+2 days, parallel with 51-52)
- Phase 57: E2E integration (2 days)

**Full v2.2 (with multi-device + Settings): 18 days**
- Add Phase 55-56: Session routing (1+1 days)
- Add Phase 58: Settings UI (2 days)
- Add Phase 59: Polish (2 days)

**Parallelization:** Actions and TTS independent. Session routing independent. Settings after config infra ready.

**Confidence: MEDIUM** - Depends on provider streaming API support

---

## Component Changes

**New:**
- actionExecutor.ts (Electron main)
- sessionRouter.ts (Gateway middleware)
- audioPlayer.ts (Electron renderer)
- actionHandler.ts (Electron renderer)

**Modified (small):**
- chatSession.ts: action event writes
- ttsService.ts: streaming support
- voiceHandler.ts: use StreamingAudioPlayer
- Express gateway: sessionRouter middleware
- Settings UI: LM Studio URL, provider fields

**Unchanged:**
- IPC bridge, electron-store, ChromaDB, LangChain agent

---

## Technical Debt

**v2.2-v2.3:**
- Action confirmation UX (needs bidirectional → WebSocket)
- TTS chunk timing precision
- Multi-instance gateway (→ Redis)

**v3+:**
- Local Kokoro TTS
- Agent pause-for-approval
- Session persistence (LangGraph checkpointer)

---

## Sources

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [W3C HTML Spec: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [web.dev: Media Source Extensions](https://web.dev/media-mse-basics/)
- [GitHub: fetch-stream-audio](https://github.com/AnthumChris/fetch-stream-audio)
- [LangChain Docs: Streaming](https://docs.langchain.com/oss/javascript/langchain/streaming)
- [Sevensquare Tech: Multi-Device Session Management](https://www.sevensquaretech.com/multi-device-session-management-in-nodejs/)
- [Ably: WebSockets vs SSE](https://ably.com/blog/websockets-vs-sse)
- [RxDB: Real-time Communication](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)
