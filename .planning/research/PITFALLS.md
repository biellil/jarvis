# Domain Pitfalls: v2.2 LLM Actions + Streaming TTS + Settings Expansion

**Domain:** Electron + Node.js + Express SSE + LangChain.js bidirectional action routing, streaming TTS, configuration hot-reload, platform-specific UI, long-running voice capture.

**Researched:** 2026-05-05

---

## Feature 1: LLM → Electron Actions via SSE Bidirectional Stream

### Pitfall 1: Action Arrives After SSE Connection Closes

**What goes wrong:** Backend generates an action (open_file, open_folder, view_screenshot) mid-response, appends to SSE stream, but by the time the message reaches Electron, the EventSource client has already closed the connection (timeout, user interrupt, or natural completion). Action payload is lost silently. User never sees the requested action.

**Why it happens:** SSE is unidirectional by design — server → client only. Once the server sends a `:` keep-alive or the response completes naturally, the client closes the EventSource. If LLM decides to emit an action in the last chunk or after a delay, it arrives on a dead connection.

**Consequences:**
- User asks "open my files folder" → LLM generates response + open_folder action → SSE closes before action arrives
- Action log shows attempted dispatch, but Electron never receives it
- User thinks action failed, asks again, creates duplicate requests

**Prevention:**
1. **Preempt actions in the response stream** — Ensure actions are embedded in SSE before TTS/response completes, not appended after
2. **Connection state awareness** — Renderer-side EventSource must stay open until final confirmation of all actions received
3. **Action acknowledgment protocol** — Client sends `POST /api/actions/ack/{actionId}` confirming receipt; server retries unacknowledged actions via retry queue
4. **Separate action stream** — Consider bifurcating: response text via SSE, critical actions via WebSocket with explicit ACK/NAK

**Detection:**
- Action in audit log but not executed on Electron
- Timestamp gap between SSE completion and action log entry
- Server logs show action emit attempt, Electron logs show no matching IPC dispatch

---

### Pitfall 2: Action Routing Race Condition — Wrong Client Executes Action

**What goes wrong:** Multiple Electron instances running JARVIS on the same user's machine (dev/staging + production, or accidental duplicate launch). Backend receives action request but broadcasts to all connected Electron clients via single SSE response stream. Both instances try to execute the same action simultaneously, or wrong instance receives the action (e.g., staging app opens production files).

**Why it happens:** SSE stream doesn't include session/client identity in action payload. If the backend maintains a broadcast queue or doesn't correlate actions to specific client connections, any listening client will consume the action.

**Consequences:**
- User has JARVIS production + dev running → "Open folder" action from production session routes to dev Electron
- File opens in wrong location (dev's working directory vs production's sandbox)
- Multiple instances of the same action execute (if both clients accept the broadcast)
- Confusion about which app actually executed the action

**Prevention:**
1. **Session token in action payload** — Each action includes `{ actionId, clientSessionId, command, ... }` where clientSessionId must match current Electron session
2. **Electron session ID on startup** — Electron generates a UUID on launch, includes it in first API call (`POST /api/chat` includes header `X-Client-Session: <uuid>`)
3. **Backend route actions to client session** — Backend stores sessionId → SSE connection mapping; on action emit, send only to the specific session's connection

**Detection:**
- Multiple Electron windows executing the same action
- File opened in unexpected working directory
- Audit logs show action executed on "wrong" JARVIS instance

---

## v2.3: LLM Providers & System Actions Pitfalls

**Domain:** Google Gemini integration, LM Studio streaming events, embedding queue priority, file action permissions, media controls

**Researched:** 2026-05-06

---

### Pitfall 1: Gemini Safety Filters Silently Blocking Responses

**Severity:** HIGH

**What goes wrong:** Google Gemini API has strict safety filters that block content. When violated, API returns empty response (HTTP 200 but content is null). This breaks downstream JSON parsing.

**Consequences:**
- Voice responses say nothing (TTS receives null, streams silence)
- Text chat shows blank response — confuses user
- No audit trail indicating why response was empty
- Feature appears broken intermittently

**Prevention:**
1. Always check response.content is not null/empty before TTS or JSON parsing
2. Explicit safety settings override: set safetySettings to MEDIUM threshold
3. Log empty responses with context
4. Add fallback in factory: if Gemini response empty, retry with Claude
5. Inform user: add toast message instead of silent empty response
6. Test with content: send prompts known to trigger safety filters

**Phase to address:** LLM-PROV-01 (Gemini integration)

---

### Pitfall 2: LM Studio Streaming Events API Detection Fails Silently

**Severity:** HIGH

**What goes wrong:** LM Studio streaming events API not supported by all models. JARVIS will attempt to use for lower latency. If model doesn't support it, code expecting event types will fail to parse response, hanging voice pipeline.

**Consequences:**
- Voice pipeline freezes waiting for expected event type
- Response never completes, user hears silence
- No error logged — request succeeds but response parser times out
- Chat via HTTP works but voice doesn't

**Prevention:**
1. Graceful degradation: wrap streaming events parsing in try/catch
2. Model detection at startup: query LM Studio /api/status endpoint
3. Feature flag: add ENABLE_LM_STUDIO_STREAMING_EVENTS config flag
4. Version check: check minimum LM Studio version 0.3.0+
5. Timeout + fallback: if no event within 500ms, switch to standard streaming
6. Explicit error handling: catch malformed JSON in event stream

**Phase to address:** LLM-PROV-02 (LM Studio streaming)

---

### Pitfall 3: Gemini API Rate Limits Lower Than OpenAI/Claude

**Severity:** MEDIUM

**What goes wrong:** Google Gemini has lower rate limits (15 requests/minute free). When rate limited, Retry-After header ignored by Google SDK. Fixed exponential backoff used instead.

**Consequences:**
- Voice pipeline pauses 3-5s instead of 100ms
- Gemini becomes unreliable for fast interaction
- Soak test may fail if rate limit hit during long session

**Prevention:**
1. Monitor Gemini rate limits during testing
2. Disable Gemini by default, require explicit selection
3. Add Gemini quota documentation in Settings UI
4. Implement request queuing with p-queue
5. Use LM Studio as primary fallback if Gemini rate-limited
6. Cache embedding model separately

**Phase to address:** LLM-PROV-01 and LLM-PRIO-01

---

### Pitfall 4: AbortController Memory Leak When Canceling Embedding Queue

**Severity:** MEDIUM

**What goes wrong:** Fire-and-forget embeddings with AbortController have documented Node.js memory leak. AbortSignal event listeners never automatically removed. After 100+ chats, MaxListenersExceededWarning fires, memory grows unbounded.

**Consequences:**
- After 1-2 hours: MaxListenersExceededWarning appears
- Memory grows 10-20MB per hour
- Soak test QA-01 fails (heap <100MB, RSS <200MB requirement)
- App may crash with OOM on 4GB RAM after 8h soak

**Prevention:**
1. Explicit listener cleanup: call removeEventListener manually after embed request
2. Abort controller pool: reuse AbortController instances
3. Monitor listener count: add periodic log checking
4. Embed queue abstraction: dedicated EmbeddingQueue class with cleanup
5. Test with memory profiler: run soak test monitoring heap snapshot
6. Fire-and-forget discipline: use explicit .catch()

**Phase to address:** LLM-PRIO-01 (embedding priority)

---

### Pitfall 5: Electron shell.openPath() Path Traversal Risk

**Severity:** HIGH

**What goes wrong:** shell.openPath() dangerous if path not fully validated. Attack: user sends ../../../etc/passwd to LLM, backend validates but miscalculates relative path, Electron opens sensitive file. shell.openPath can execute symlinks, escaping whitelist.

**Consequences:**
- Attacker crafts LLM prompt generating malicious open action
- JARVIS opens sensitive file in system viewer
- Windows: expose user credentials via .txt files
- macOS: read .plist files with secrets
- Audit log only records validation, not actual path

**Prevention:**
1. Canonicalize all paths using path.resolve()
2. Symlink detection: check if resolved path differs from original
3. Separate read vs write validation
4. Re-validate before shell.openPath()
5. Fallback only for known extensions: reject .exe, .sh, .plist, .conf
6. Never pass raw user input: ensure full resolved path from backend

**Phase to address:** FACT-12 (fallback opener)

---

### Pitfall 6: Electron globalShortcut Media Keys Don't Work on macOS 11+

**Severity:** MEDIUM

**What goes wrong:** Electron globalShortcut.register(MediaPlayPause) doesn't work on macOS 11+ without Accessibility permissions. macOS uses MPRemoteCommandCenter requiring either active audio or Accessibility permission.

**Consequences:**
- User says "pause music" to JARVIS
- Handler receives no event (OS filtered it)
- Nothing happens, user thinks feature broken
- Only works after JARVIS plays TTS response

**Prevention:**
1. Detect macOS and prompt for Accessibility at startup
2. Reuse v1.9 Phase 44 pattern for permission gating
3. Fallback to synthetic audio session when needed
4. Document workaround in Settings UI
5. Test on macOS 11, 12, 13, 14

**Phase to address:** SYSCTRL-02 (media controls)

---

### Pitfall 7: LLM Provider Fallback Breaks Mid-Stream

**Severity:** MEDIUM

**What goes wrong:** Fallbacks only work during stream initialization. If stream starts successfully but fails mid-way (Gemini safety filter on chunk 2), fallback NOT triggered. User gets incomplete response.

**Consequences:**
- Voice response stops mid-sentence (incomplete TTS)
- Chat shows partial response
- No automatic retry with fallback provider
- User sees broken response

**Prevention:**
1. Wrap streaming in try/catch at chunk level, not just initialization
2. Validate response completeness: check if ends properly
3. Per-token safety validation for Gemini
4. Explicit fallback configuration: implement manually
5. Test with forced failures: inject artificial mid-stream errors

**Phase to address:** LLM-PROV-01 (Gemini)

---

### Pitfall 8: Read vs Write Action Distinction Not Enforced in Zod Schema

**Severity:** MEDIUM

**What goes wrong:** Existing Zod schema validates path, not action type. If refactoring applies read-action-skip-confirmation to delete action, Zod validation passes but user loses protection.

**Consequences:**
- Accidental unconfirmed delete of important file
- User's files deleted by LLM instruction without warning
- Audit log records delete without confirmation status
- Feature regression in security posture

**Prevention:**
1. Extend Zod schema to include action type enum
2. Map action to confirmation requirement: lookup table
3. Validate action-confirmation pairing: runtime check
4. Test matrix: test cases for each action × confirmation state
5. Code review gate: require verification of action-confirmation consistency

**Phase to address:** FACT-10 (read without confirmation)

---

### Pitfall 9: Gemini Model Naming Differences Cause Provider Errors

**Severity:** MEDIUM

**What goes wrong:** Each LLM provider has different model naming. Gemini uses gemini-1.5-flash, but Google might deprecate it. If user selects Gemini, code picks gemini-1.5-flash, Google returns HTTP 404 model not found.

**Consequences:**
- Voice pipeline crashes with model not found error
- User selected Gemini but JARVIS can't use it
- Fallback chain might not be wired
- Unclear error message

**Prevention:**
1. Hardcode known-good models by provider
2. Validate model availability at startup: test API call
3. Store version info in settings
4. Graceful degradation: if Gemini init fails, fallback to LM Studio
5. Test against multiple Google models
6. Document provider-specific model selection in Settings UI

**Phase to address:** LLM-PROV-01 (Gemini integration)

---

## Sources & References

- [LangChain Fallbacks](https://js.langchain.com/v0.1/docs/guides/fallbacks/)
- [LM Studio Streaming Events](https://lmstudio.ai/docs/developer/rest/streaming-events)
- [Gemini API Safety Settings](https://ai.google.dev/gemini-api/docs/safety-settings)
- [Electron shell.openPath Security](https://www.electronjs.org/docs/latest/api/shell)
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron globalShortcut Issue #24052](https://github.com/electron/electron/issues/24052)
- [Node.js AbortSignal Memory Leak #46525](https://github.com/nodejs/node/issues/46525)
- [ChatGoogleGenerativeAI LangChain](https://docs.langchain.com/oss/javascript/integrations/chat/google_generative_ai)
- [Better Stack: AbortController in Node.js](https://betterstack.com/community/guides/scaling-nodejs/understanding-abortcontroller/)
- [LogRocket: AbortController Complete Guide](https://blog.logrocket.com/complete-guide-abortcontroller-node-js/)
- [Medium: Priority Queue with Concurrency Control](https://medium.com/@amankrr/building-an-efficient-priority-task-execution-queue-with-javascript-typescript-2bf756f598d4)

---

*Last updated: 2026-05-06 — Research for v2.3 milestone feature pitfalls.*
