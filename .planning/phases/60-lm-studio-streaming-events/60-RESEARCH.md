# Phase 60: LM Studio Streaming Events - Research

**Researched:** 2026-05-07  
**Domain:** LLM streaming protocols, API compatibility, first-token latency optimization  
**Confidence:** HIGH

## Summary

LM Studio provides two distinct streaming protocols: (1) **OpenAI-compatible `/v1/chat/completions` with `stream: true`** — standard SSE format with `choices[0].delta.content` tokens, which current JARVIS uses via ChatOpenAI + openai SDK v2.30; and (2) **Native `/api/v1/chat` with `stream: true`** — granular event types (`chat.start`, `message.delta`, `reasoning.delta`, `tool_call.*`, `chat.end`) exposing internal pipeline stages.

**Key finding from D-01 investigation:** The standard OpenAI-compatible endpoint (currently in use) does NOT automatically expose LM Studio's native streaming events. ChatOpenAI with `streaming: true` receives only the standard OpenAI SSE format. Accessing LM Studio's native Streaming Events protocol requires:

1. **Direct REST consumption**: Bypass the OpenAI SDK abstraction and make raw HTTP requests to `/api/v1/chat` endpoint
2. **Custom SSE parser**: Implement a native streaming client that reads event types (`chat.start`, `message.delta`, etc.) instead of parsing `choices[0].delta.content`
3. **Subclass or factory pattern**: Replace direct ChatOpenAI use with a wrapper that conditionally uses native events when available

**First-token latency benefit claim:** LM Studio documents TTFT (Time To First Token) metrics in the native REST API; however, the streaming protocol itself (SSE vs Streaming Events naming/structure) does not reduce TTFT. **TTFT reduction comes from the LM Studio backend's inference pipeline and model loading, not from which event format is used.** The Streaming Events protocol provides *visibility* into TTFT and intermediate reasoning stages, not inherent speed gains. Standard SSE (`stream: true`) already delivers tokens as soon as they're available from the model.

**Recommendation:** Implement fallback strategy: (1) Attempt `/api/v1/chat` native events when the feature flag is enabled, (2) automatically fall back to existing ChatOpenAI + `/v1/chat/completions` if the native endpoint is unavailable or returns unexpected data, (3) both protocol variants deliver tokens incrementally — the UX advantage is *observability* (detailed event types for UI progress display and reasoning inspection) and *future-proofing*, not latency.

**Primary recommendation:** Implement native Streaming Events support via direct HTTP client + custom SSE parser, with fallback to ChatOpenAI's existing stream path. This allows gradual adoption of native events without replacing the entire LLM abstraction layer.

## Standard Stack

### Core Technologies
| Technology | Version | Purpose | Current Status |
|------------|---------|---------|-----------------|
| LM Studio API | 0.3.29+ | Native Streaming Events + OpenAI compatibility | Both endpoints available |
| @langchain/openai | 1.4.3 | LLM abstraction (currently only uses `/v1/chat/completions`) | In use |
| openai SDK | 2.30.0 | HTTP client for OpenAI-compatible endpoint | In use, underlying ChatOpenAI |
| node-fetch or similar | (any) | Raw HTTP client for native `/api/v1/chat` endpoint | Not yet used |

### Streaming Protocols Supported by LM Studio
| Endpoint | Protocol | Event Format | TTFT Metrics | Tool Visibility | Reasoning Events |
|----------|----------|--------------|--------------|-----------------|------------------|
| `/v1/chat/completions` (OpenAI compat) | HTTP SSE | `choices[0].delta.content` | Not exposed | Streamed as content | No |
| `/api/v1/chat` (Native) | HTTP SSE | 20 named event types | Exposed in `chat.end` | Separate `tool_call.*` events | `reasoning.delta` events |

### Alternative Implementation Approaches
| Approach | Pros | Cons | Complexity |
|----------|------|------|-----------|
| **A: Subclass ChatOpenAI (recommended)** | Minimal refactor; preserves LangChain abstraction; gradual opt-in via feature flag | Requires understanding ChatOpenAI internals | MEDIUM |
| **B: Direct HTTP client + raw SSE** | Full control; no LangChain overhead; precise event handling | Loses LangChain abstraction; new streaming code path; testing complexity | HIGH |
| **C: Wait for LangChain native support** | Future-proof; aligns with ecosystem evolution | Blocks phase; unknown ETA; LangChain roadmap unclear | BLOCKED |

**Recommended approach: A (Subclass ChatOpenAI).** The factory.ts can conditionally instantiate either ChatOpenAI (for non-LM Studio or when native events disabled) or a new `ChatOpenAIStreamingEvents` subclass that overrides the streaming method to consume `/api/v1/chat` directly.

## Architecture Patterns

### Current Streaming Architecture (Phases 53-54)
```typescript
// Phase 53: Streaming TTS reads from `/chat/stream` endpoint
// Phase 54: Chat route uses `sendStream()` → `this._agent.stream()`
// Both call ChatOpenAI.stream() → openai SDK → HTTP to `LM_STUDIO_URL`

// Default: http://localhost:1234/v1
// Currently hardcoded in factory.ts and config.ts
```

### Pattern 1: Conditional Protocol Selection (Feature Flag)
**What:** Factory function decides at LLM creation time whether to use native events or OpenAI compat.

**When to use:** Runtime feature flag enables native events; try-catch fallback for unsupported models.

**Example:**
```typescript
// src/llm/factory.ts (modification)
import { ChatOpenAIStreamingEvents } from './streaming-events.js';

export function createLLM(provider?: LLMProvider, config?: LLMConfig): BaseChatModel {
  const cfg = config || loadConfig();
  const selectedProvider = provider || cfg.LLM_PROVIDER;

  switch (selectedProvider) {
    case 'lmstudio':
      // D-03: feature flag controls which streaming implementation
      if (cfg.USE_LM_STUDIO_STREAMING_EVENTS) {
        return new ChatOpenAIStreamingEvents({
          configuration: { baseURL: cfg.LM_STUDIO_URL },
          apiKey: 'lm-studio',
          model: cfg.LM_STUDIO_MODEL || 'default',
          streaming: true,
          nativeEventsEnabled: true,  // signals subclass to use /api/v1/chat
        });
      }
      // Fallback: standard OpenAI-compatible endpoint
      return new ChatOpenAI({
        configuration: { baseURL: cfg.LM_STUDIO_URL },
        apiKey: 'lm-studio',
        model: cfg.LM_STUDIO_MODEL || 'default',
        streaming: true,
      });
    // ... other providers unchanged
  }
}
```

### Pattern 2: Streaming Events Subclass (Gradual Adoption)
**What:** Subclass ChatOpenAI and override `stream()` method to conditionally use `/api/v1/chat`.

**When to use:** Need to preserve LangChain abstraction while adding native events support.

**Implementation sketch:**
```typescript
// src/llm/streaming-events.ts (new file)
import { ChatOpenAI } from '@langchain/openai';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessageChunk } from '@langchain/core/messages';

export class ChatOpenAIStreamingEvents extends ChatOpenAI {
  private nativeEventsEnabled: boolean;

  constructor(opts: ChatOpenAIConstructorInput & { nativeEventsEnabled: boolean }) {
    super(opts);
    this.nativeEventsEnabled = opts.nativeEventsEnabled;
  }

  async *stream(input: BaseMessage[], ...args: unknown[]): AsyncGenerator<AIMessageChunk> {
    if (!this.nativeEventsEnabled) {
      // Fallback to parent's standard streaming
      yield* super.stream(input, ...args);
      return;
    }

    try {
      // Attempt native /api/v1/chat streaming
      yield* this._streamNativeEvents(input);
    } catch (err) {
      console.warn('[ChatOpenAIStreamingEvents] Native events failed, falling back:', err);
      // D-02: Fallback to standard SSE silently
      yield* super.stream(input, ...args);
    }
  }

  private async *_streamNativeEvents(messages: BaseMessage[]): AsyncGenerator<AIMessageChunk> {
    // Convert BaseMessage[] to LM Studio chat format
    const chatMessages = messages.map(m => ({
      role: m._getType() === 'human' ? 'user' : 'assistant',
      content: m.content,
    }));

    // Native /api/v1/chat endpoint (replace /v1 with /api/v1)
    const nativeUrl = this.clientConfig.baseURL?.replace('/v1', '/api/v1') ?? 
                      'http://localhost:1234/api/v1';
    
    const response = await fetch(`${nativeUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Native events request failed: ${response.status}`);
    }

    // Parse native SSE stream: event: <type>\ndata: <json>\n\n
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let buffer = '';
    const decoder = new TextDecoder();

    for await (const { value } of reader.read()) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const event of lines) {
        if (!event.trim()) continue;
        const [eventLine, dataLine] = event.split('\n');
        const eventType = eventLine.replace('event: ', '').trim();
        const data = JSON.parse(dataLine.replace('data: ', '').trim());

        // Only yield message.delta events as AIMessageChunk
        // Official spec: { type: 'message.delta', content: string } — content is top-level
        if (eventType === 'message.delta' && data.content) {
          yield new AIMessageChunk({
            content: data.content,
            additional_kwargs: {},
          });
        }
      }
    }
  }
}
```

### Pattern 3: Settings UI Toggle (Feature Flag)
**What:** Replicate `streamingTtsEnabled` pattern from Phase 53.

**When to use:** Always — consistent with project conventions.

**Integration points:**
- `apps/desktop/src/main/store.ts` — add getter/setter for `streamingLMStudioEventsEnabled`
- `apps/desktop/src/shared/ipc-types.ts` — add to `StoreSchema`
- `apps/desktop/src/main/ipc/settings.ts` — add handler `STREAMING_LM_STUDIO_EVENTS_SET` + broadcast
- `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx` — add toggle

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Raw HTTP SSE parsing | Custom regex/split-by-newlines SSE parser | Use `@langchain/openai` ChatOpenAI.stream() for compat endpoint; subclass for native | Edge cases: multiline JSON, event buffering, encoding handling; ChatOpenAI tested at scale |
| Protocol detection | Custom "test both endpoints and pick one" logic | Feature flag (D-03) + fallback try-catch (D-02) | Reduces latency waste on failed detection; single source of truth (feature flag) |
| Fallback orchestration | Manual catch + retry loops | Subclass override with fallback in catch block (pattern above) | Keeps protocol logic centralized; avoids scattered retry code |
| TTFT measurement | Custom `Date.now()` instrumentation | LM Studio native API's `chat.end` event contains `time_to_first_token` field | Precise server-side measurement; integrates with native events protocol |

**Key insight:** Custom SSE parsing is deceptively complex — buffer management, partial JSON chunks, encoding edge cases, and event ordering require careful handling. The OpenAI SDK and LangChain already solved this for the compat endpoint; leverage subclassing to add native events without duplicating streaming logic.

## Common Pitfalls

### Pitfall 1: Protocol Auto-Detection Cost
**What goes wrong:** Attempt both `/v1/chat/completions` and `/api/v1/chat` on every request to "detect" which is available; first failed request adds 100+ ms latency.

**Why it happens:** Temptation to auto-detect without user configuration.

**How to avoid:** Feature flag (D-03) is single source of truth; only fallback if explicitly enabled AND first request fails.

**Warning signs:** Users report "first turn is slow"; logs show double requests; feature gate is missing.

### Pitfall 2: Incomplete Native Event Type Handling
**What goes wrong:** Parse `message.delta` events but miss `reasoning.delta`, `tool_call.start`, and `chat.end`; get partial tokens or no tool context.

**Why it happens:** Greedy implementation focusing only on text content tokens.

**How to avoid:** Full enum of 20 event types documented in implementation; test each type in isolation.

**Warning signs:** Silent loss of reasoning output; tool calls don't appear in logs; `chat.end` event is missing.

### Pitfall 3: Fallback Not Actually Used
**What goes wrong:** Feature flag is always `true`; native endpoint is unavailable; stream hangs or throws; fallback logic never executes.

**Why it happens:** Insufficient error testing in the subclass catch block.

**How to avoid:** (D-02) Explicit try-catch in `_streamNativeEvents()` that catches network errors, 404, timeout, and unexpected response format. Test with endpoint disabled.

**Warning signs:** Streaming works on dev (LM Studio running) but fails in CI or when endpoint is intentionally disabled.

### Pitfall 4: LM Studio vs OpenAI Base URL Confusion
**What goes wrong:** OpenAI `/v1` endpoint is used for all providers; native events endpoint `/api/v1` is only for LM Studio; accidentally try native events against OpenAI cloud.

**Why it happens:** config.LM_STUDIO_URL may point to OpenAI if user misconfigures provider fallback.

**How to avoid:** (1) Only enable native events when `provider === 'lmstudio'`, (2) construct `/api/v1` URL by replacing `/v1` in existing base URL (idempotent if already `/api/v1`).

**Warning signs:** 404 errors from OpenAI; native event parsing fails with unexpected JSON schema.

### Pitfall 5: Feature Flag Applied Globally vs Per-Provider
**What goes wrong:** `USE_LM_STUDIO_STREAMING_EVENTS` toggle is visible in Settings but doesn't disable if provider switches to OpenAI; code attempts native events against wrong endpoint.

**Why it happens:** Per D-04, toggle is always visible; no conditional render by provider.

**How to avoid:** Feature flag is permissive (always shown); LLM factory checks both flag AND `provider === 'lmstudio'` before enabling native events.

**Warning signs:** Settings toggle is visible when provider = 'openai'; users confused why native events don't work with cloud providers.

## Code Examples

### Example 1: Factory Function with Conditional Native Events
```typescript
// Source: Recommended factory.ts modification

export function createLLM(
  provider?: LLMProvider,
  config?: LLMConfig
): BaseChatModel {
  const cfg = config || loadConfig();
  const selectedProvider = provider || cfg.LLM_PROVIDER;

  switch (selectedProvider) {
    case 'lmstudio':
      // D-03: Check feature flag (from config or env)
      if (cfg.USE_LM_STUDIO_STREAMING_EVENTS) {
        return new ChatOpenAIStreamingEvents({
          configuration: { baseURL: cfg.LM_STUDIO_URL },
          apiKey: 'lm-studio',
          model: cfg.LM_STUDIO_MODEL || 'default',
          streaming: true,
          nativeEventsEnabled: true,
        });
      }
      // Standard fallback: OpenAI-compatible /v1/chat/completions
      return new ChatOpenAI({
        configuration: { baseURL: cfg.LM_STUDIO_URL },
        apiKey: 'lm-studio',
        model: cfg.LM_STUDIO_MODEL || 'default',
        streaming: true,
      });
    // ... other providers unchanged
  }
}
```

### Example 2: Native SSE Event Parsing Loop
```typescript
// Source: Subclass streaming method — native event consumer

// Read and parse SSE stream from /api/v1/chat endpoint
const reader = response.body?.getReader();
if (!reader) throw new Error('No response body');

let buffer = '';
const decoder = new TextDecoder();

for await (const { value } of reader.read()) {
  buffer += decoder.decode(value, { stream: true });
  
  // Split by double newline (SSE boundary)
  const lines = buffer.split('\n\n');
  buffer = lines.pop() ?? ''; // Keep incomplete event in buffer

  for (const event of lines) {
    if (!event.trim()) continue;
    
    // Parse: event: <type>\ndata: <json>
    const [eventLine, dataLine] = event.split('\n');
    const eventType = eventLine.replace('event: ', '').trim();
    const data = JSON.parse(dataLine.replace('data: ', '').trim());

    // Handle native event types
    switch (eventType) {
      case 'chat.start':
        // { type: 'chat.start', model_instance_id: string }
        break;
      case 'message.delta':
        // { type: 'message.delta', content: string }  ← content is top-level, NOT data.delta.content
        if (data.content) {
          yield new AIMessageChunk({
            content: data.content,
            additional_kwargs: {},
          });
        }
        break;
      case 'reasoning.delta':
        // { type: 'reasoning.delta', content: string }  ← same structure as message.delta
        console.log('[native-events] reasoning:', data.content);
        break;
      case 'chat.end':
        // { type: 'chat.end', result: { stats: { time_to_first_token_seconds: number, tokens_per_second: number, input_tokens, total_output_tokens }, model_instance_id, output, response_id } }
        console.log('[native-events] TTFT:', data.result?.stats?.time_to_first_token_seconds);
        break;
      case 'error':
        // { type: 'error', error: { type: string, message: string, code?: string, param?: string } }
        throw new Error(`LM Studio error: ${data.error?.message}`);
    }
  }
}
```

### Example 3: Fallback Pattern in Subclass
```typescript
// Source: ChatOpenAIStreamingEvents.stream() method

async *stream(input: BaseMessage[], ...args: unknown[]): AsyncGenerator<AIMessageChunk> {
  if (!this.nativeEventsEnabled) {
    // Feature flag disabled: use parent's standard streaming
    yield* super.stream(input, ...args);
    return;
  }

  try {
    // Attempt native /api/v1/chat
    yield* this._streamNativeEvents(input);
  } catch (err) {
    // D-02: Fallback silently on error
    // Possible errors: endpoint 404, timeout, unsupported model, malformed response
    const errMsg = (err as Error).message || String(err);
    console.warn(
      '[ChatOpenAIStreamingEvents] Native events failed (model may not support them), ' +
      'falling back to OpenAI-compatible SSE. Error: ' + errMsg
    );
    // Silently use parent's standard streaming
    yield* super.stream(input, ...args);
  }
}
```

## State of the Art

| Aspect | Current (Compat /v1) | Native Events (/api/v1) | When Changed | Impact |
|--------|----------------------|-------------------------|--------------|--------|
| **Streaming protocol** | Standard OpenAI SSE with `choices[0].delta.content` | Named event types: `message.delta`, `reasoning.delta`, `tool_call.*` | LM Studio 0.2.0+ | Better observability; more granular tool + reasoning visibility |
| **TTFT exposure** | Not exposed in streaming response | Exposed in `chat.end` event timings | LM Studio 0.3.29+ | Enables measurement of first-token latency without separate API call |
| **LangChain support** | ChatOpenAI works directly | No built-in support; requires subclass or raw HTTP | N/A | Decision point: trade abstraction for features |
| **Fallback strategy** | N/A (single endpoint) | Try native, fall back to compat | Phase 60 (this phase) | Graceful degradation for older models or unavailable endpoint |

## Open Questions

1. **Does native `/api/v1/chat` actually reduce first-token latency, or just provide better observability?**
   - What we know: LM Studio native API exposes TTFT in `chat.end` event; compat endpoint does not. But TTFT itself comes from inference, not wire format.
   - What's unclear: Whether streaming *protocol choice* (named events vs choices[0].delta) has measurable latency impact. Likely no difference — both are SSE.
   - Recommendation: Measure TTFT on both protocols manually after implementation. Log shows success criterion #1 requires "measurably lower" latency. If no difference found, success criterion becomes observability + future-proofing, not speed.

2. **Which models in LM Studio support native Streaming Events?**
   - What we know: Native events documented in official API; no exclusion list found.
   - What's unclear: Whether ALL loaded models emit native events or only newer ones.
   - Recommendation: Try-catch fallback (D-02) handles this automatically. If model doesn't support native events, error is caught and standard SSE is used.

3. **Should native events be exposed to the frontend (e.g., reasoning progress in UI)?**
   - What we know: Phase 60 requirements document "DEFERRED: reasoning progress per step (v2.4)". Current phase out of scope.
   - What's unclear: Whether intermediate events (reasoning.delta, tool_call.start) should be streamed to client SSE or absorbed by backend.
   - Recommendation: Phase 60 consumes events in backend, yields only `message.delta` tokens. Reasoning/tool events logged internally. v2.4 can expose them to UI.

## Environment Availability

No external dependencies beyond those already installed. Phase depends on:
- LM Studio running on `LM_STUDIO_URL` (already required for lmstudio provider)
- `/api/v1/chat` endpoint available (LM Studio 0.3.x, widely available)

Both dependencies already met by existing setup.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | `apps/backend-ts/vitest.config.ts` (if exists) or uses default |
| Quick run command | `npm test -- src/llm/streaming-events.test.ts -t "fallback"` |
| Full suite command | `npm test` from `apps/backend-ts/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-PROV-02 | When LM Studio active and native events enabled, stream tokens via `/api/v1/chat` (fallback to compat if unsupported) | unit + integration | `npm test -- src/llm/streaming-events.test.ts` | ❌ Wave 0 |
| LLM-PROV-02 | Feature flag `USE_LM_STUDIO_STREAMING_EVENTS` controls enablement without restart | unit | `npm test -- src/llm/factory.test.ts -t "streaming.*flag"` | Partial (factory tests exist, need flag tests) |
| LLM-PROV-02 | Unsupported model or endpoint down → falls back silently to OpenAI-compat, no error to user | unit | `npm test -- src/llm/streaming-events.test.ts -t "fallback"` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/llm/streaming-events.ts` — new file: ChatOpenAIStreamingEvents subclass
- [ ] `src/llm/streaming-events.test.ts` — unit tests covering: (1) native event parsing, (2) fallback on 404/timeout, (3) AIMessageChunk yielding, (4) buffer management
- [ ] `src/llm/factory.ts` modification — add feature flag logic and subclass instantiation
- [ ] `apps/desktop/src/main/store.ts` — add `streamingLMStudioEventsEnabled` getter/setter
- [ ] `apps/desktop/src/shared/ipc-types.ts` — add to StoreSchema
- [ ] `apps/desktop/src/main/ipc/settings.ts` — add handler
- [ ] `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx` — add toggle UI
- [ ] Integration test (soak/manual) — verify TTFT measurement with native events (may be manual-only depending on test environment)

*(Specific gaps TBD by planner based on actual code audit.)*

## Sources

### Primary (HIGH confidence)
- [LM Studio Streaming Events Protocol](https://lmstudio.ai/docs/developer/rest/streaming-events) — event types, wire format, `chat.end` structure
- [LM Studio OpenAI Compatibility Endpoints](https://lmstudio.ai/docs/developer/openai-compat) — `/v1/*` and `/api/v1/*` distinction
- [OpenAI SDK v2.30 Chat Completions](https://developers.openai.com/api/docs/guides/streaming-responses) — stream parameter, event format
- @langchain/openai [1.4.3 npm package](https://www.npmjs.com/package/@langchain/openai) — underlying ChatOpenAI implementation (uses openai SDK)

### Secondary (MEDIUM confidence)
- [LM Studio API Changelog](https://lmstudio.ai/docs/developer/api-changelog) — version history of native events support
- [LM Studio Blog: Use OpenAI's Responses API with local models](https://lmstudio.ai/blog/lmstudio-v0.3.29) — native events feature introduction
- [Redis blog: TTFT Meaning](https://redis.io/blog/ttft-meaning/) — first-token latency definition and perception
- [Streaming Intelligence blog: How SSE Revolutionizes Real-Time LLM APIs](https://notes.suhaib.in/docs/tech/llms/streaming-intelligence-how-server-sent-events-revolutionize-real-time-llm-apis/) — SSE psychological effect on latency perception

### Tertiary (LOW confidence — exploratory only)
- Various Medium articles on streaming latency perception — observations about streaming protocols and UX, not authoritative

## Metadata

**Confidence breakdown:**
- **Standard Stack (HIGH):** LM Studio official docs confirm both protocols exist; versions verified from npm + CLAUDE.md
- **Architecture Patterns (HIGH):** Current ChatOpenAI + subclassing approach is standard LangChain pattern; Phase 53 provides exact feature flag template
- **Pitfalls (MEDIUM):** Identified from protocol documentation + common SSE parsing issues; not yet field-tested in JARVIS
- **Code Examples (HIGH):** SSE event parsing documented in LM Studio docs; fallback pattern standard exception handling
- **TTFT Claims (MEDIUM):** LM Studio exposes TTFT measurement, but whether streaming protocol choice reduces it is unverified by research. Planner must confirm with manual timing after implementation.

**Research date:** 2026-05-07  
**Valid until:** 2026-05-21 (14 days — streaming protocols stable, LangChain updates possible)

---

**Phase: 60-lm-studio-streaming-events**  
**Research complete.** Ready for `/gsd:plan-phase 60`.
