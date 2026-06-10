# Phase 92: OpenRouter Provider - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Add OpenRouter as the 6th LLM provider in the TypeScript backend (`factory.ts` + `config.ts`). Provider is configured via `.env` (same pattern as all other providers). The Python desktop `/config` LLM menu remains a placeholder — no UI changes in this phase.

Scope: backend TS only — new `openrouter` case in factory, Zod schema extension, rate-limit retry with user notification, `.env.example` update.

</domain>

<decisions>
## Implementation Decisions

### Provider configuration
- **D-01:** Provider selected via `LLM_PROVIDER=openrouter` in `.env` — identical pattern to existing providers
- **D-02:** `OPENROUTER_API_KEY` optional in `.env` — provider works with free-tier models (`:free` suffix) without a key; paid models require the key
- **D-03:** `baseURL: 'https://openrouter.ai/api/v1'` using existing `ChatOpenAI` from `langchain-openai` (same pattern as `lmstudio` case)

### Model selection
- **D-04:** No hardcoded default model — `LLM_MODEL` in `.env` is always required when `LLM_PROVIDER=openrouter`. If `LLM_MODEL` is empty, throw a clear config error (use `LLMConfigError` pattern from `errors.ts`) instructing the user to set `LLM_MODEL` (e.g., `meta-llama/llama-3.1-8b-instruct:free`)
- **D-05:** Any OpenRouter model name is valid — free (`:free` suffix) and paid models treated identically by the factory

### Rate limit handling (429)
- **D-06:** Implement exponential backoff + jitter, 3 retries on 429 responses
- **D-07:** When all 3 retries are exhausted, JARVIS surfaces the failure as a chat response (not a crash or silent stall) — the message should clearly indicate the rate limit was hit and suggest retrying in a few minutes
- **D-08:** During retries, log internally (no user-visible output per retry attempt)

### Claude's Discretion
- Where exactly to place the retry/backoff logic (factory wrapper, middleware, or LangGraph node) — planner decides based on LangChain patterns
- Exact wording of the rate-limit chat message
- Whether to add OpenRouter to `capabilities.ts` and what capabilities to report (streaming: true, vision: depends on model, functionCalling: true)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend TS LLM layer
- `apps/backend-ts/src/llm/factory.ts` — LLM factory with existing provider cases (lmstudio, openai, anthropic, gemini); OpenRouter is a new case following the same pattern
- `apps/backend-ts/src/llm/config.ts` — Zod schema for env vars; `LLM_PROVIDER` enum must be extended with `'openrouter'`; new `OPENROUTER_API_KEY` field needed
- `apps/backend-ts/src/llm/errors.ts` — `LLMConfigError` class for missing API key / config errors
- `apps/backend-ts/src/llm/capabilities.ts` — Provider capability matrix; needs OpenRouter entry

### Config and documentation
- `.env.example` (repo root) — Document `OPENROUTER_API_KEY`, `LLM_PROVIDER=openrouter` and `LLM_MODEL` examples for free-tier models
- `apps/backend-ts/.env.example` — Backend-specific env docs (check if separate update needed)

### No external specs
Requirements are fully captured in decisions above and `REQUIREMENTS.md` (OPENR-01 through OPENR-04).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatOpenAI` with `configuration: { baseURL }` pattern (lmstudio case in factory.ts:53-60): OpenRouter reuses this exactly, just with a different baseURL
- `LLMConfigError` from `errors.ts`: reuse for missing `LLM_MODEL` when provider is openrouter
- `envSchema` in `config.ts`: extend the `LLM_PROVIDER` enum and add `OPENROUTER_API_KEY` field

### Established Patterns
- All providers follow: `case 'provider': return new ChatXxx({ apiKey, model, streaming: true })`
- API key is optional for lmstudio (dummy `'lm-studio'` string) — same approach for OpenRouter free tier
- `loadConfig()` in config.ts validates at startup and exits with code 1 on failure

### Integration Points
- `apps/backend-ts/src/index.ts` imports `createLLM()` — no changes needed there if factory handles new case
- `apps/backend-ts/src/agent/graph.ts` uses the returned `BaseChatModel` — no changes needed if factory returns same interface

</code_context>

<specifics>
## Specific Ideas

- "Quero da mesma forma que estão os outros LLM" — OpenRouter should feel identical to existing providers from a config perspective, just with a different `LLM_PROVIDER` value
- OPENR-01 (Python `/config` menu showing OpenRouter) is explicitly deferred — it's noted in the ROADMAP but the user chose not to implement the UI in this phase. Add to backlog.

</specifics>

<deferred>
## Deferred Ideas

- OPENR-01 partial: Python desktop `/config` LLM menu showing OpenRouter alongside other providers — deferred to a future phase when the full LLM provider-switching UI is implemented for all 5 providers
- Quota display in `/config` (from Pitfall P-5 notes) — deferred with the UI work above

</deferred>

---

*Phase: 92-openrouter-provider*
*Context gathered: 2026-06-10*
