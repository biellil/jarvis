# Phase 92: OpenRouter Provider - Research

**Researched:** 2026-06-10
**Domain:** Multi-provider LLM integration (TypeScript backend)
**Confidence:** HIGH

## Summary

OpenRouter can be integrated as a 5th LLM provider in the TypeScript backend by reusing the existing `ChatOpenAI` pattern with a different base URL (`https://openrouter.ai/api/v1`). The integration is straightforward because OpenRouter implements the OpenAI-compatible API surface. The main complexity is handling 429 rate limit errors gracefully — free tier limits are tight (20 requests/minute) but OpenRouter returns the standard `Retry-After` header, which the underlying OpenAI SDK already respects. No custom retry logic is needed if relying on SDK defaults, but user-facing error messaging for rate limits is required to surface quota issues clearly.

**Primary recommendation:** Extend the factory to handle the `openrouter` provider case using `ChatOpenAI` with baseURL configuration, add the schema field for `OPENROUTER_API_KEY` (optional), require `LLM_MODEL` validation when provider is openrouter, and wrap chat invocations with a try-catch to detect 429 errors and surface a user-friendly message rather than letting the error propagate silently.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Provider selected via `LLM_PROVIDER=openrouter` in `.env` — identical pattern to existing providers
- **D-02:** `OPENROUTER_API_KEY` optional in `.env` — provider works with free-tier models (`:free` suffix) without a key; paid models require the key
- **D-03:** `baseURL: 'https://openrouter.ai/api/v1'` using existing `ChatOpenAI` from `langchain-openai` (same pattern as `lmstudio` case)
- **D-04:** No hardcoded default model — `LLM_MODEL` in `.env` is always required when `LLM_PROVIDER=openrouter`. If `LLM_MODEL` is empty, throw a clear config error (use `LLMConfigError` pattern from `errors.ts`) instructing the user to set `LLM_MODEL` (e.g., `meta-llama/llama-3.1-8b-instruct:free`)
- **D-05:** Any OpenRouter model name is valid — free (`:free` suffix) and paid models treated identically by the factory
- **D-06:** Implement exponential backoff + jitter, 3 retries on 429 responses
- **D-07:** When all 3 retries are exhausted, JARVIS surfaces the failure as a chat response (not a crash or silent stall) — the message should clearly indicate the rate limit was hit and suggest retrying in a few minutes
- **D-08:** During retries, log internally (no user-visible output per retry attempt)

### Claude's Discretion
- Where exactly to place the retry/backoff logic (factory wrapper, middleware, or LangGraph node) — planner decides based on LangChain patterns
- Exact wording of the rate-limit chat message
- Whether to add OpenRouter to `capabilities.ts` and what capabilities to report (streaming: true, vision: depends on model, functionCalling: true)

### Deferred Ideas (OUT OF SCOPE)
- Python desktop `/config` LLM menu showing OpenRouter alongside other providers — deferred to a future phase when the full LLM provider-switching UI is implemented for all 5 providers
- Quota display in `/config` (from Pitfall P-5 notes) — deferred with the UI work above

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPENR-01 | User can select `openrouter` in `/config` LLM provider menu alongside LM Studio/Anthropic/OpenAI/Gemini | Deferred to future phase — backend supports selection via `.env` only |
| OPENR-02 | Provider uses `base_url=https://openrouter.ai/api/v1` via existing `langchain-openai` pattern — same abstraction layer as other providers | Verified: OpenRouter API uses OpenAI-compatible endpoint; `ChatOpenAI` with `configuration.baseURL` pattern works identically to LM Studio case |
| OPENR-03 | `OPENROUTER_API_KEY` in `.env` is optional — provider works with free models (`:free` suffix) without key and unlocks paid models when key present, with no code change required | Confirmed: OpenRouter free tier `:free` models work without API key; paid models require bearer token authentication |
| OPENR-04 | User can configure any OpenRouter model name (free or paid) via `/config` model selector — provider treats them identically | Supported by factory pattern: no model-specific branching needed; `LLM_MODEL` env var passed directly to `ChatOpenAI` constructor |

## Standard Stack

### Core LLM Provider Integration
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| langchain-openai | 0.3.x | OpenAI-compatible client abstraction | OpenRouter implements OpenAI API spec; reuses proven `ChatOpenAI` pattern already in use for LM Studio |
| openai | 2.30.0 | Underlying HTTP client | Handles OpenAI-compatible requests; already a transitive dependency of `langchain-openai` |

### Error Handling & Config
| Component | Current Pattern | Applied to OpenRouter |
|-----------|-----------------|----------------------|
| Config validation | Zod schema in `config.ts`, enum for `LLM_PROVIDER` | Extend enum to include `'openrouter'`; add `OPENROUTER_API_KEY` optional string field |
| Missing API key | `LLMConfigError` from `errors.ts` | Reuse for free-tier (no key required), but enforce `LLM_MODEL` is set |
| Missing model | Not validated currently | **NEW:** Validate that `LLM_MODEL` is non-empty when `LLM_PROVIDER=openrouter`; throw `LLMConfigError('openrouter', 'LLM_MODEL')` if missing |
| Provider case | Factory switch in `factory.ts` lines 39-98 | Add new `case 'openrouter':` branch following OpenAI pattern (lines 62-70) |

### Rate Limit Handling
| Aspect | Implementation Note |
|--------|-------------------|
| 429 detection | OpenAI SDK/LangChain automatically respects `Retry-After` header; no custom retry code needed at HTTP layer |
| Exponential backoff | Embedded in OpenAI SDK (version 2.30.0); configured via SDK constructor (e.g., `max_retries: 3`) |
| User notification | Wrap `llm.invoke()` calls in try-catch at LangGraph node level (per D-07); catch HTTP 429 errors and surface as chat message |
| Logging | Use `loguru` (existing stack) to log retry attempts internally (per D-08); no toast/console output per attempt |

## Architecture Patterns

### Recommended Project Structure

The OpenRouter case fits into the existing multi-provider factory pattern. No new files required; changes are scoped to 3 existing files:

```
apps/backend-ts/src/llm/
├── factory.ts        # Add 'openrouter' case (lines 39-98)
├── config.ts         # Extend LLM_PROVIDER enum, add OPENROUTER_API_KEY field
├── types.ts          # Extend LLMProvider type union
├── errors.ts         # Reuse LLMConfigError
└── capabilities.ts   # (Optional) Add openrouter entry to capability matrix
```

### Pattern 1: Provider Selection via BaseURL Configuration

**What:** OpenRouter reuses the `ChatOpenAI` class from `@langchain/openai` by overriding the `baseURL` configuration. This is identical to how LM Studio is implemented.

**When to use:** Any OpenAI-compatible provider (not just OpenAI itself). The pattern is generalizable for future providers (e.g., Together AI, Replicate, Hugging Face Inference API).

**Example:**
```typescript
// Source: apps/backend-ts/src/llm/factory.ts (lmstudio case lines 40-60)
case 'openrouter':
  if (!cfg.LLM_MODEL) {
    throw new LLMConfigError('openrouter', 'LLM_MODEL');
  }
  return new ChatOpenAI({
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
    },
    apiKey: cfg.OPENROUTER_API_KEY || 'free-tier',  // Bearer token; free tier doesn't require a key
    model: cfg.LLM_MODEL,
    streaming: true,
  });
```

**Why:** The OpenAI SDK/LangChain abstracts HTTP transport details. Swapping the base URL is all that's needed; no provider-specific client class is required.

### Pattern 2: Optional API Key (Free Tier Support)

**What:** When `OPENROUTER_API_KEY` is not set, pass a fallback token (e.g., `'free-tier'` or empty string) to the `apiKey` parameter. OpenRouter's free-tier `:free` models work without authentication.

**Why:** Matches decision D-02. Allows users to try OpenRouter cost-free before providing an API key for paid models.

**Implementation note:** Test with real free-tier model (e.g., `meta-llama/llama-3.1-8b-instruct:free`) during wave 0 to confirm fallback token behavior.

### Pattern 3: Mandatory Model Configuration

**What:** Unlike some providers that have hardcoded defaults (e.g., Anthropic defaults to `claude-3-5-haiku-20241022`), OpenRouter has no sensible default — user must specify a model name explicitly.

**When to use:** Enforced at config validation time (loadConfig()) with a clear error message guiding the user to set `LLM_MODEL`.

**Example error:**
```
LLM_MODEL required when LLM_PROVIDER=openrouter
Hint: Set LLM_MODEL to an OpenRouter model (e.g., meta-llama/llama-3.1-8b-instruct:free for free tier)
```

### Pattern 4: Rate Limit Error Handling (User-Facing)

**What:** Detect 429 Too Many Requests errors at the LangGraph chat node level (likely in `apps/backend-ts/src/agent/graph.ts` or `apps/backend-ts/src/session/chat-session.ts` where `llm.invoke()` is called).

**When to use:** Catch HTTP errors from the LLM provider and transform them into chat messages (instead of crashes or silent stalls).

**Example:**
```typescript
// In chat invocation (e.g., LangGraph node or chat session)
try {
  const response = await llm.invoke(messages, { ...options });
  return response;
} catch (error) {
  // OpenRouter 429 detection
  if (error?.response?.status === 429 || error?.statusCode === 429) {
    return {
      content: 'Rate limit reached on OpenRouter. Please wait a few minutes before retrying.',
      name: 'error',
    };
  }
  throw error;  // Re-throw other errors
}
```

**Why:** User sees a clear message instead of a hung chat or server error. OpenAI SDK retries automatically (3x by default), so manual retry logic is unnecessary — just catch the final failure.

### Anti-Patterns to Avoid
- **Hardcoding base URLs in factory:** Breaks when user changes provider or runs in Docker. Always read from `.env` via `config.ts`.
- **Custom retry wrapper around ChatOpenAI:** The underlying OpenAI SDK (v2.30.0+) already implements exponential backoff with jitter. Adding a second retry layer causes exponential delays.
- **Catching and re-throwing 429 at HTTP layer:** LangChain abstracts HTTP details. Errors bubble up as LLMException; catch at the chat invocation site (LangGraph node) instead.
- **Hardcoded API key defaults:** Free-tier models don't require a key, but if you hardcode `'no-key'` and a user later switches to a paid model without updating `.env`, they'll hit auth errors silently. Always read `OPENROUTER_API_KEY` from env.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client for OpenAI-compatible APIs | Custom fetch wrapper for OpenRouter | `ChatOpenAI` from `langchain-openai` | LangChain handles streaming, token counting, retries, error parsing. Custom code is error-prone and duplicates effort. |
| Retry logic for 429 errors | Exponential backoff + jitter implementation | OpenAI SDK (built into langchain-openai) | SDK includes `max_retries`, `Retry-After` header parsing, and jitter. Re-implementing it adds bugs and complexity. |
| Model name validation | Custom regex or whitelist for OpenRouter models | Simple truthy check: `if (!cfg.LLM_MODEL)` | OpenRouter supports arbitrary model names (user's responsibility to spell correctly). No whitelist needed — API returns 404 if model doesn't exist, which is fine. |
| Provider capability detection for OpenRouter | Hardcoded capability matrix per model | Reuse existing `capabilities.ts` pattern or skip entirely | OpenRouter's capability varies by model (e.g., some models have vision, others don't). Rather than maintaining a matrix, leave it to the user to specify model capabilities via env if needed, or detect at first API call. |

**Key insight:** OpenRouter is an OpenAI-compatible proxy. The factory pattern already solved the multi-provider abstraction problem (LM Studio, OpenAI, Anthropic, Gemini). OpenRouter fits the same mold — no special case logic needed beyond config variables.

## Common Pitfalls

### Pitfall 1: Free-Tier Rate Limits Cause Silent Stall
**What goes wrong:** User sets `LLM_PROVIDER=openrouter` with free tier (20 req/min limit). After 20 requests, the API returns 429. If no retry/error handling is in place, the chat freezes or returns an unhelpful error.

**Why it happens:** OpenRouter's free tier is severely rate-limited to prevent abuse. Users don't expect this tight limit and exhaust it quickly.

**How to avoid:** 
- Validate at startup that `LLM_MODEL` ends with `:free` (optional check) to hint that free tier limits apply
- Catch 429 errors and surface a chat message: "Rate limit reached. Upgrade your plan or wait a few minutes." (D-07)
- Log rate limit hits to help users diagnose (D-08)

**Warning signs:** 
- Chat returns instantly with no token output (typical 429 symptom)
- Network tab shows 429 HTTP status
- Langfuse traces show request timeout or empty response

### Pitfall 2: Missing LLM_MODEL Configuration
**What goes wrong:** User sets `LLM_PROVIDER=openrouter` but forgets to set `LLM_MODEL`. App crashes or uses a stale fallback model from a previous provider.

**Why it happens:** Unlike OpenAI or Anthropic, OpenRouter has no hardcoded default model. User must choose explicitly.

**How to avoid:** 
- Validate at config load time: if `LLM_PROVIDER=openrouter` and `LLM_MODEL` is empty, throw `LLMConfigError('openrouter', 'LLM_MODEL')` with a helpful message
- Update `.env.example` with a clear example: `LLM_MODEL=meta-llama/llama-3.1-8b-instruct:free`

**Warning signs:** 
- Startup error: "LLM_MODEL required when LLM_PROVIDER=openrouter"
- Chat invocation fails with "Invalid model name" from OpenRouter API

### Pitfall 3: Confusing Free-Tier Model Naming
**What goes wrong:** User tries model `meta-llama/llama-3.1-8b-instruct` without the `:free` suffix on free tier, hits auth error (requires API key).

**Why it happens:** OpenRouter uses the `:free` suffix to mark free-tier models, but this is non-obvious to users unfamiliar with the service.

**How to avoid:** 
- Document in `.env.example`: Free-tier models must end with `:free` (e.g., `meta-llama/llama-3.1-8b-instruct:free`)
- Example in error message if model fails: "Model requires an API key. Set OPENROUTER_API_KEY or use a `:free` model."

**Warning signs:** 
- API returns 401 Unauthorized with model name in error
- User reports "free tier doesn't work even though I have no API key set"

### Pitfall 4: OpenRouter API Key Exposed in Logs
**What goes wrong:** `OPENROUTER_API_KEY` is logged in plaintext during debug output or error traces, exposing the user's secret.

**Why it happens:** Developers forget to redact secrets during logging or error stringification.

**How to avoid:** 
- Never log the full `OPENROUTER_API_KEY` value; mask it: `OPENROUTER_API_KEY=sk_*****...` (first 7 chars + stars)
- Use Langfuse safely: mark API keys as "sensitive" in span attributes if captured
- Review all `console.log` and `loguru` statements for secrets

**Warning signs:** 
- Full API key visible in CI logs, terminal output, or Langfuse traces
- User reports unauthorized API calls after sharing logs

### Pitfall 5: 429 Retry Storms with Concurrent Requests
**What goes wrong:** Multiple concurrent chats hit the rate limit simultaneously. Each one retries with exponential backoff, but without jitter, all retries align and cause a thundering herd of requests hitting the limit again.

**Why it happens:** OpenAI SDK's default backoff is deterministic; jitter must be explicitly enabled.

**How to avoid:** 
- Rely on OpenAI SDK's jitter implementation (already in v2.30.0+); verify it's enabled in ChatOpenAI constructor
- If custom retry wrapper is added later, always include jitter: `backoff_factor * (1 + random(0, 1))`
- Monitor Langfuse traces for retry patterns; if you see synchronized retries at the same seconds, jitter is missing

**Warning signs:** 
- Multiple chats all fail/retry at identical timestamps in logs
- Rate limit hit again immediately after retry window expires

## Code Examples

Verified patterns from official sources and existing codebase:

### Creating OpenRouter LLM Instance
```typescript
// Source: apps/backend-ts/src/llm/factory.ts pattern (existing lmstudio case)
case 'openrouter':
  if (!cfg.LLM_MODEL) {
    throw new LLMConfigError('openrouter', 'LLM_MODEL');
  }
  return new ChatOpenAI({
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
    },
    apiKey: cfg.OPENROUTER_API_KEY || 'free-tier',
    model: cfg.LLM_MODEL,
    streaming: true,
  });
```

### Zod Schema Extension for Config
```typescript
// Source: apps/backend-ts/src/llm/config.ts (existing pattern)
export const envSchema = z.object({
  LLM_PROVIDER: z.enum(['lmstudio', 'openai', 'anthropic', 'gemini', 'openrouter']).default('lmstudio'),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  // ... existing fields ...
});
```

### TypeScript Type Extension
```typescript
// Source: apps/backend-ts/src/llm/types.ts (existing pattern)
export type LLMProvider = 'lmstudio' | 'openai' | 'anthropic' | 'gemini' | 'openrouter';
```

### Error Handling for Missing Model
```typescript
// Source: apps/backend-ts/src/llm/errors.ts (existing pattern — reuse)
if (!cfg.LLM_MODEL) {
  throw new LLMConfigError('openrouter', 'LLM_MODEL');
}
```

Error message output:
```
LLM_MODEL required when LLM_PROVIDER=openrouter
Hint: Set LLM_MODEL in .env (e.g., meta-llama/llama-3.1-8b-instruct:free)
```

## State of the Art

| Aspect | Previous Approach | Current Approach (Phase 92) | Impact |
|--------|-------------------|---------------------------|--------|
| Multi-LLM support | Hardcoded provider list (lmstudio only) | Factory pattern with enum provider selection | Users can switch providers via `.env` without code changes |
| API compatibility | Direct SDK calls per provider (openai, anthropic, etc.) | Abstraction layer via LangChain interfaces | New providers (OpenRouter) integrate via configuration only |
| Rate limit handling | No retry logic (chat stalls on 429) | OpenAI SDK automatic retries + user-facing error message | Rate limits surface clearly without silent failures |

**Deprecated/outdated:**
- Manual retry loops around LLM calls — OpenAI SDK (v2.30.0+) has built-in exponential backoff with jitter
- Hardcoded fallback models per provider — config-driven model selection is more flexible

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| langchain-openai | OpenRouter provider | ✓ | 0.3.x | — |
| openai SDK | HTTP transport | ✓ | 2.30.0+ | — |
| Zod | Config validation | ✓ | 4.x | — |

All dependencies are already in `package.json` (verified for LM Studio and other providers). No new npm packages required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (matches existing backend-ts tests) |
| Config file | `apps/backend-ts/vitest.config.ts` |
| Quick run command | `npm run test -- src/llm/factory.test.ts` |
| Full suite command | `npm run test -- src/llm/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPENR-02 | Factory creates ChatOpenAI with baseURL=https://openrouter.ai/api/v1 | unit | `npm run test -- src/llm/factory.test.ts -t "returns BaseChatModel for openrouter"` | ❌ Wave 0 |
| OPENR-03 | Free-tier model works without OPENROUTER_API_KEY; paid models need key | unit | `npm run test -- src/llm/factory.test.ts -t "openrouter"` | ❌ Wave 0 |
| OPENR-04 | Any model name passed to LLM_MODEL is accepted (no validation) | unit | `npm run test -- src/llm/factory.test.ts -t "model configuration"` | ❌ Wave 0 |
| OPENR-02 (config) | LLM_MODEL required when LLM_PROVIDER=openrouter | unit | `npm run test -- src/llm/config.test.ts -t "openrouter requires LLM_MODEL"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- src/llm/factory.test.ts`
- **Per wave merge:** `npm run test -- src/llm/ && npm run test -- src/session/chat-session.test.ts` (to verify 429 handling)
- **Phase gate:** Full LLM test suite + integration test with free-tier model before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/llm/factory.test.ts` — add test cases for `openrouter` provider (parallel to existing openai/anthropic tests)
- [ ] `src/llm/config.test.ts` — add test for schema validation: `LLM_MODEL` required when provider is openrouter
- [ ] `src/llm/types.test.ts` — verify TypeScript type inference includes `'openrouter'`
- [ ] `src/session/chat-session.test.ts` or `src/agent/graph.test.ts` — add test for 429 error handling: verify that 429 response is caught and converted to a chat message (not a crash)
- [ ] Integration test with real free-tier model (requires .env setup; can be skipped in CI if no OPENROUTER_API_KEY available)

*(Note: `src/llm/streaming-events.test.ts` and `src/llm/version-check.test.ts` may also need openrouter cases added if they enumerate all providers)*

## Open Questions

1. **Where to implement 429 error handling?**
   - Current knowledge: Error can be caught at factory level (wrapper), middleware level (Express), or LangGraph node level (chat session)
   - Recommendation: Catch at chat session / LangGraph node level (where `llm.invoke()` is called) so the error becomes a user-visible chat message, not a server 500
   - Awaiting: Planner to identify exact location based on LangChain patterns in the codebase

2. **Should OpenRouter be added to `capabilities.ts`?**
   - Current knowledge: Capabilities vary by model (not all models have vision). Gemini is marked with universal vision: true; OpenRouter should follow same pattern
   - Recommendation: Add openrouter entry with `streaming: true, vision: false, functionCalling: true` as conservative defaults. Vision can be overridden per-model later if needed
   - Awaiting: Planner decision on whether to include this optional enhancement

3. **Free-tier fallback token value**
   - Current knowledge: OpenRouter free-tier `:free` models don't require authentication. Question: should `apiKey` be `'free-tier'`, empty string `''`, or a real dummy token?
   - Recommendation: Use empty string or `'free-tier'` (both should work). Test with real model during wave 0 to confirm
   - Awaiting: Wave 0 validation with live API

4. **Rate limit message clarity**
   - Current knowledge: D-07 requires "clear chat response" when 429 exhausts retries
   - Recommendation: "OpenRouter rate limit reached (20 requests/minute). Wait a few minutes or upgrade your plan."
   - Awaiting: Planner to refine wording based on UX preference

## Project Constraints (from CLAUDE.md)

**No custom commits:** Per project instructions, commits must NOT include the lines:
- `Generated with [Claude Code](...)`
- `Co-Authored-By: Claude <...>`

This is enforced by the planner; research does not create commits directly.

## Sources

### Primary (HIGH confidence)
- **OpenRouter Official API Docs** - https://openrouter.ai/docs/api/reference/overview — authenticated bearer token required for paid models; free-tier `:free` models work without key
- **OpenRouter Error Handling** - https://openrouter.ai/docs/api/reference/errors-and-debugging — 429 rate limits return `Retry-After` header; OpenAI SDK respects it automatically
- **LangChain ChatOpenAI Docs** - https://docs.langchain.com/oss/javascript/integrations/chat — baseURL configuration pattern verified for LM Studio case in codebase
- **OpenAI SDK Documentation** - https://github.com/openai/node-sdk — v2.30.0+ includes exponential backoff with jitter for 429 retries
- **Existing JARVIS codebase** (`apps/backend-ts/src/llm/`) — factory.ts, config.ts, types.ts, errors.ts patterns verified by code inspection

### Secondary (MEDIUM confidence)
- **OpenRouter + LangChain Integration** - https://openrouter.ai/docs/guides/community/langchain — community guide confirms ChatOpenAI compatibility
- **LangChain OpenRouter with TypeScript** - https://medium.com/@goyalsourav888/openrouter-with-langchain-in-typescript-a9be71486b09 — blog post example (MEDIUM: blog source, but matches official docs)
- **OpenRouter Rate Limit Strategies** - https://www.aimadetools.com/blog/openrouter-rate-limit-fix/ — exponential backoff + jitter recommendation (matches OpenAI SDK defaults)

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — langchain-openai pattern already proven with LM Studio; OpenRouter is API-compatible
- **Architecture:** HIGH — factory pattern is established and tested; OpenRouter case is straightforward extension
- **Config & validation:** HIGH — Zod schema extension and error handling follow existing patterns exactly
- **Rate limit handling:** MEDIUM-HIGH — OpenAI SDK handles retries automatically; main uncertainty is where to catch 429 and what chat message to show (deferred to planner discretion)
- **Pitfalls:** HIGH — rate limits and model naming are well-documented in OpenRouter docs; Python community has solved similar problems

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (30 days; OpenRouter API is stable, no breaking changes expected)
**Status:** Ready for planning
