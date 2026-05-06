# Phase 57: Google Gemini Provider — Research

**Researched:** 2026-05-06  
**Domain:** Multi-LLM provider integration, API key management, live reload without restart  
**Confidence:** HIGH (Context7 + official docs verified, CONTEXT.md decisions locked)

## Summary

Phase 57 adds Google Gemini as a 4th LLM provider to JARVIS, enabling users to select it via Settings UI and chat immediately without restart. The implementation spans three layers: (1) backend LLM factory with @langchain/google-genai integration, (2) Settings UI with conditional API key inputs for all cloud providers, (3) live reload via POST /internal/reload-llm endpoint that preserves conversation history. The phase includes safety filter handling (null content → toast), context window awareness (1M tokens), and graceful degradation to LM Studio on invalid credentials.

**Primary recommendation:** Implement in 6 focused tasks: (1) Backend factory + config schema, (2) ChatSession.swapLLM() method + /internal/reload-llm endpoint, (3) LM Studio model detection via GET /v1/models, (4) Electron store + IPC getters/setters for API keys, (5) Settings UI conditional API key inputs, (6) Error handling + safety filter toasts.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Backend-ts exposes POST /internal/reload-llm. After saving settings, Electron calls this endpoint with new provider and API keys. Endpoint re-creates only the LLM and calls ChatSession.swapLLM() — history and memory preserved.
- **D-02:** Endpoint re-executes capability detection to update console log. For LM Studio, uses GET /v1/models to detect loaded model.
- **D-03:** Capability detection re-executed after reload (non-fatal if fails).
- **D-04:** GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY stored in electron-store (not .env). User enters via Settings UI. Electron passes keys in body of POST /internal/reload-llm.
- **D-05:** Keys in process.env continue working as fallback. Priority: electron-store > process.env.
- **D-06:** Keys from electron-store are passed to backend in POST body, not as env vars. Backend uses them directly in createLLM().
- **D-07:** API key input rendered conditionally — only selected provider's field shown. LM Studio shows no key field.
- **D-08:** Gemini label in dropdown: "Google Gemini" (matches current pattern: "LM Studio (Local)", "OpenAI", "Anthropic (Claude)").
- **D-09:** This phase adds API key inputs for ALL cloud providers (Gemini, OpenAI, Anthropic) — not just Gemini.
- **D-10:** LangChain package: @langchain/google-genai (Google AI Studio API, no Vertex AI overhead). Default model: gemini-2.0-flash.
- **D-11:** Provider added as "gemini" in union type LLMProvider (types.ts, config.ts, ipc-types.ts, store.ts).
- **D-12:** GEMINI_API_KEY absent/invalid → backend degrades to LM Studio AND shows actionable error toast: "GEMINI_API_KEY inválida — usando LM Studio".
- **D-13:** Safety filter null content → toast: "JARVIS não pôde responder" (no crash, no blank response).
- **D-14:** Add gemini entry to tokenizer CONTEXT_WINDOWS: gemini: 1000000 (Gemini 2.0 Flash has 1M context).
- **D-15:** After LM Studio reload, backend calls GET {LM_STUDIO_URL}/models to detect loaded model and log. Errors silent (non-fatal).
- **D-16:** Schema of POST /internal/reload-llm body, ChatSession.swapLLM() internal implementation (mutex/lock), exact electron-store key names for API keys — Claude's Discretion.
- **D-17:** CONTEXT_WINDOWS lmstudio should also be updated (currently without value in code read).

### Claude's Discretion
- Schema exact body of POST /internal/reload-llm (which fields, Zod validation).
- How ChatSession.swapLLM() implemented internally (mutex to avoid race with in-flight request).
- Name exact of keys in electron-store for cloud provider API keys.
- If lmstudio CONTEXT_WINDOWS should be updated (currently no value defined in code).

### Deferred Ideas (OUT OF SCOPE)
- Model selector per provider (dropdown to choose gemini-2.0-flash vs gemini-1.5-pro) — Phase 58+.
- OpenAI and Anthropic API key inputs were NOT deferred — included in Phase 57 scope (D-09).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LLM-PROV-01 | User can select Google Gemini as LLM provider via dropdown in Settings, enter GEMINI_API_KEY, and save — no restart required. JARVIS responds using Gemini immediately. | @langchain/google-genai ChatGoogleGenerativeAI integration, POST /internal/reload-llm endpoint + ChatSession.swapLLM(), electron-store API key persistence, conditional Settings UI. |

</phase_requirements>

---

## Standard Stack

### Core LLM Integration
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @langchain/google-genai | 2.1.15 | LangChain integration for Gemini API | Stable, actively maintained (Feb 2026), same abstraction layer as existing openai/anthropic integrations. Handles streaming, tool binding, structured output, multimodal. |
| @google/genai | 1.52.0 | Official Gemini SDK (replaces deprecated @google/generative-ai) | Current official SDK (as of Feb 2026). LangChain's google-genai package depends on this. |

### Gemini Model
| Model | Context Window | Purpose | Why Recommended |
|-------|-----------------|---------|-----------------|
| gemini-2.0-flash | 1,000,000 tokens | Fast, general-purpose chat (Phase 57 default) | Released Feb 5, 2025. Best latency/quality tradeoff for conversational UX. 1M context handles long conversations. Knowledge cutoff: Aug 31, 2024. Max output: 8,192 tokens. |

### API Key Storage (Unchanged Pattern, Extended)
| Technology | Purpose | Scope |
|------------|---------|-------|
| electron-store | Persistent config for all cloud provider API keys | GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY (Phase 57 adds full support) |
| process.env | Fallback for API keys (environment variables) | Priority override: electron-store > process.env |

**Installation:**
```bash
npm install @langchain/google-genai @google/genai
# Already in deps: @langchain/core, @langchain/openai, @langchain/anthropic
```

**Version verification:**
- @langchain/google-genai 2.1.15 (Feb 6, 2026) — verified via npm registry
- @google/genai 1.52.0 (upstream dependency) — verified via npm registry
- Gemini 2.0 Flash model (Feb 5, 2025 release) — verified via Google AI Studio + official docs

---

## Architecture Patterns

### 1. Factory Pattern Extension (Existing + Gemini)

**Pattern:** LLM factory switch statement extended with gemini case

**Current state** (`apps/backend-ts/src/llm/factory.ts`):
- Switch on `selectedProvider` (lmstudio, openai, anthropic)
- Each case returns BaseChatModel with streaming=true
- LLMConfigError thrown if required API key missing

**Phase 57 extension:**
```typescript
case 'gemini':
  if (!cfg.GEMINI_API_KEY) {
    throw new LLMConfigError('gemini', 'GEMINI_API_KEY');
  }
  return new ChatGoogleGenerativeAI({
    apiKey: cfg.GEMINI_API_KEY,
    model: cfg.LLM_MODEL || 'gemini-2.0-flash',
    streaming: true,
    // Optional: safetySettings can be configured here (Phase 58+)
  });
```

**Why this works:**
- Same abstraction (BaseChatModel) — no caller changes needed
- Streaming enabled by default (D-01 parity with openai/anthropic)
- LangChain handles safety filters, token counting, streaming chunks

### 2. Config Schema Extension (Zod)

**Current state** (`apps/backend-ts/src/llm/config.ts`):
```typescript
LLM_PROVIDER: z.enum(['lmstudio', 'openai', 'anthropic']).default('lmstudio'),
OPENAI_API_KEY: z.string().optional().default(''),
ANTHROPIC_API_KEY: z.string().optional().default(''),
```

**Phase 57 addition:**
```typescript
LLM_PROVIDER: z.enum(['lmstudio', 'openai', 'anthropic', 'gemini']).default('lmstudio'),
GEMINI_API_KEY: z.string().optional().default(''),
```

**Why:** Consistent with existing pattern. Zod validates at startup, provides clear error messages.

### 3. Live Reload Endpoint (POST /internal/reload-llm)

**Pattern:** New internal endpoint (NOT proxied by gateway) that:
1. Validates new config
2. Creates new LLM via factory
3. Calls ChatSession.swapLLM(newLlm) to replace LLM while preserving history
4. Re-detects capabilities (non-fatal if fails)
5. Returns 200 with capability info or error detail

**Request body schema (Zod):**
```typescript
{
  provider: z.enum(['lmstudio', 'openai', 'anthropic', 'gemini']),
  lmStudioUrl?: z.string().optional(),
  openaiApiKey?: z.string().optional(),
  anthropicApiKey?: z.string().optional(),
  geminiApiKey?: z.string().optional(),
  llmModel?: z.string().optional(),
}
```

**Implementation location:** `apps/backend-ts/src/routes/reload-llm.ts` (new file)  
**Registration in app.ts:** `app.use("/internal", reloadLlmRouter);` (alongside actionsLogRouter)

**Pattern precedent:** Phase 54 `POST /internal/actions-log` — internal audit endpoint, follows same structure (Zod validation, Router, registered at `/internal` prefix).

### 4. ChatSession.swapLLM() Method

**Purpose:** Replace LLM mid-conversation without losing history

**Signature:**
```typescript
swapLLM(newLlm: BaseChatModel): void
```

**Implementation (HIGH confidence from code inspection):**
- Store newLlm in `this.llm` private field
- Recreate `this._agent` via createReactAgent() with new LLM
- Leave `this.history` untouched — all messages preserved
- Re-register tools with new agent

**Why this works:**
- Agent is stateless (only tool definitions + history matter)
- History already in conversation format (HumanMessage, AIMessage, SystemMessage)
- Next send() call uses new LLM with old history → seamless transition

**Race condition guard (per D-16):**
- Use mutex/lock (SessionLock already exists in backend) to prevent:
  - swapLLM() called while send() in-flight
  - send() called while swapLLM() in-flight
- Electron must wait for 200 response before sending next message

### 5. LM Studio Model Detection (GET /v1/models)

**Pattern:** After LM Studio reload, call GET {LM_STUDIO_URL}/v1/models to detect model

**LM Studio OpenAI-compatible response:**
```json
{
  "object": "list",
  "data": [
    { "id": "model-id", "object": "model", ... }
  ]
}
```

**Implementation in reload-llm endpoint:**
```typescript
if (newProvider === 'lmstudio') {
  try {
    const response = await fetch(`${cfg.LM_STUDIO_URL}/models`);
    if (response.ok) {
      const data = await response.json();
      const modelId = data.data?.[0]?.id ?? 'unknown';
      console.log(`[LM Studio] Detected model: ${modelId}`);
    }
  } catch (err) {
    console.warn(`[LM Studio] Model detection failed (non-fatal): ${err}`);
  }
}
```

**Why non-fatal:** LM Studio may be offline or restarting. Reload succeeds anyway; logging is best-effort.

### 6. Electron Store API Key Getters/Setters

**Pattern:** Extend existing TTS API key pattern to cloud LLM providers

**Existing pattern** (`apps/desktop/src/main/store.ts`):
```typescript
export function getTtsApiKey(): string {
  return store.get('ttsApiKey')?.key ?? '';
}

export function setTtsApiKey(key: string): void {
  store.set('ttsApiKey', { key });
}
```

**Phase 57 extension (similar pattern):**
```typescript
export function getOpenaiApiKey(): string {
  return store.get('openaiApiKey')?.key ?? '';
}

export function setOpenaiApiKey(key: string): void {
  store.set('openaiApiKey', { key });
}

// Repeat for anthropicApiKey, geminiApiKey
```

**Storage in StoreSchema:**
```typescript
interface StoreSchema {
  // ... existing fields
  openaiApiKey?: { key: string };
  anthropicApiKey?: { key: string };
  geminiApiKey?: { key: string };
}
```

### 7. Settings UI Conditional Rendering

**Pattern:** Only show API key input for selected provider

**Component logic** (`apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx`):
```tsx
// Existing provider dropdown
const PROVIDER_LABELS: Record<LlmProvider, string> = {
  lmstudio: 'LM Studio (Local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini',  // NEW
};

// NEW: Conditional API key inputs (one at a time)
{llmProvider === 'openai' && (
  <Field>
    <Field.Label>OpenAI API Key</Field.Label>
    <Field.Control>
      <Input
        type="text"
        value={openaiApiKey}
        onChange={(e) => setOpenaiApiKey(e.target.value)}
        placeholder="sk-proj-…"
        aria-label="OpenAI API Key"
      />
    </Field.Control>
    <Field.Helper>Found at https://platform.openai.com/account/api-keys</Field.Helper>
    <Field.Error>{openaiKeyError ?? ''}</Field.Error>
  </Field>
)}

{llmProvider === 'anthropic' && (
  <Field>
    <Field.Label>Anthropic API Key</Field.Label>
    <Field.Control>
      <Input
        type="text"
        value={anthropicApiKey}
        onChange={(e) => setAnthropicApiKey(e.target.value)}
        placeholder="sk-ant-…"
        aria-label="Anthropic API Key"
      />
    </Field.Control>
    <Field.Helper>Found at https://console.anthropic.com/account/keys</Field.Helper>
    <Field.Error>{anthropicKeyError ?? ''}</Field.Error>
  </Field>
)}

{llmProvider === 'gemini' && (
  <Field>
    <Field.Label>Google Gemini API Key</Field.Label>
    <Field.Control>
      <Input
        type="text"
        value={geminiApiKey}
        onChange={(e) => setGeminiApiKey(e.target.value)}
        placeholder="AIzaSy…"
        aria-label="Google Gemini API Key"
      />
    </Field.Control>
    <Field.Helper>Get free API key at https://aistudio.google.com/apikey</Field.Helper>
    <Field.Error>{geminiKeyError ?? ''}</Field.Error>
  </Field>
)}
```

**Why this pattern:**
- Avoids overwhelming user with 3 API key fields at once
- Matches existing LM Studio URL conditional logic
- DOM insertion/removal only (no animation needed)

### 8. Error Handling: Invalid API Key → Degrade to LM Studio

**Pattern:** Backend factory throws LLMConfigError on missing key. Electron catches, shows toast, falls back.

**Backend behavior (factory.ts):**
```typescript
case 'gemini':
  if (!cfg.GEMINI_API_KEY) {
    throw new LLMConfigError('gemini', 'GEMINI_API_KEY');
  }
  // May also throw at runtime if key is invalid (LangChain auth failure)
```

**Electron IPC handler (ipc/settings.ts):**
```typescript
ipcMain.handle(IPC_CHANNELS.RELOAD_LLM, async (_event, request: ReloadLlmRequest) => {
  try {
    const response = await fetch('http://localhost:8001/internal/reload-llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: request.provider,
        geminiApiKey: request.geminiApiKey,
        // ... other keys
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      // Show actionable error toast
      mainWindow.webContents.send('toast', {
        type: 'error',
        message: 'GEMINI_API_KEY inválida — usando LM Studio',
      });
      // Fallback: reload with LM Studio provider instead
      return { success: false, fallbackToLmStudio: true };
    }
    return { success: true };
  } catch (err) {
    mainWindow.webContents.send('toast', {
      type: 'error',
      message: `LLM reload failed: ${err.message}`,
    });
    return { success: false };
  }
});
```

### 9. Safety Filter Handling: Null Content → Toast

**Pattern:** LangChain ChatGoogleGenerativeAI may return empty content if safety filter blocks. Session/agent level must detect and toast.

**Gemini safety architecture (verified via official docs):**
- When finishReason=SAFETY, response.content is null/empty
- No exception thrown — silent HTTP 200 with empty content
- Safety filters are configurable (BLOCK_NONE, BLOCK_LOW, etc.) but not disableable at core level

**Implementation in ChatSession.send() or agent wrapper:**
```typescript
// After agent.invoke() returns:
const lastMessage = result.messages[result.messages.length - 1];
if (lastMessage.type === 'ai' && (!lastMessage.content || lastMessage.content === '')) {
  // Safety filter blocked content — notify user
  this._listenerBox.current?.({
    action: 'safety_filter_blocked',
    details: { provider: 'gemini' },
  });
  return {
    text: '', // Will be handled by renderer to show "JARVIS não pôde responder" toast
    sources: [],
  };
}
```

**Renderer side (chat component):**
```tsx
if (!reply || reply.text === '') {
  dispatch(
    showToast({
      type: 'error',
      message: 'JARVIS não pôde responder',
      description: 'Gemini safety filters blocked the response.',
    })
  );
  return;
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gemini API integration | Custom REST client + auth | @langchain/google-genai (ChatGoogleGenerativeAI) | LangChain handles streaming, safety filter detection, token counting, tool binding. Custom code adds 200+ LOC with hidden gotchas (auth refresh, error retry, incomplete stream handling). |
| Live LLM reload | Custom session replacement logic | ChatSession.swapLLM() + SessionLock | Naive swap loses agent state, in-flight requests race, history corruption. Mutex prevents these. |
| API key storage | Custom encrypted KV store | electron-store (existing pattern) | electron-store handles serialization, defaults, type safety. Custom encryption adds complexity (key rotation, KMS integration) not needed for dev-machine-only passwords. |
| Settings UI conditional rendering | Manual visibility toggle with show/hide | DOM insertion/removal (conditional JSX) | Conditional JSX is simpler, avoids layout thrashing, no CSS visibility hacks. |
| Model detection for LM Studio | Parse model name from config | GET /v1/models endpoint | LM Studio may load different model after reload. Fetching from /v1/models ensures accurate detection (non-fatal, logging only). |

**Key insight:** Gemini integration through LangChain is a 20-30 line factory case. Rolling custom REST client risks incomplete streaming, missing retry logic, and safety filter blind spots.

---

## Common Pitfalls

### Pitfall 1: Hardcoded "gemini-pro" Model Instead of "gemini-2.0-flash"

**What goes wrong:** Code specifies outdated model. User gets low-quality responses, slow latency.  
**Why it happens:** Older tutorials reference gemini-pro (2024 era). Training data or copy-paste from StackOverflow.  
**How to avoid:** Default to gemini-2.0-flash (D-10). Use LLM_MODEL env var override. Document in code comments.  
**Warning signs:** Model not in official list, release date before Feb 2025.

**Verification:** Check [Google AI Studio supported models](https://aistudio.google.com/app/apikey) and official [Gemini API docs](https://ai.google.dev/gemini-api/docs/models).

### Pitfall 2: Swapping LLM While Request In-Flight → History Corruption

**What goes wrong:** User switches provider mid-message. New agent uses old history but new LLM. Race condition → malformed conversation state.  
**Why it happens:** No mutex/lock protecting ChatSession.swapLLM() from concurrent send().  
**How to avoid:** Use SessionLock (already exists) to guard both send() and swapLLM(). Wait for 200 response before next message.  
**Warning signs:** Occasional "Cannot read property 'invoke' of undefined" or history gaps in logs.

**Prevention:** In ChatSession, wrap swapLLM():
```typescript
async swapLLM(newLlm: BaseChatModel): Promise<void> {
  // MUST acquire lock before modifying this._agent
  // Lock.acquire() waits for any in-flight send() to complete
}
```

### Pitfall 3: Safety Filter Null Content Treated as Network Error

**What goes wrong:** Gemini blocks response (finishReason=SAFETY). Code treats empty content as timeout/error. Retries endlessly.  
**Why it happens:** Other APIs throw exceptions on blocked content. Gemini returns 200 OK with empty response — silent failure.  
**How to avoid:** Check finishReason and lastMessage.content explicitly. Handle empty content as expected (not error).  
**Warning signs:** Logs show "retrying request" in loop; user sees timeout toast instead of "JARVIS não pôde responder".

**Verification:** Review Gemini safety docs: [Safety settings | Gemini API](https://ai.google.dev/gemini-api/docs/safety-settings)

### Pitfall 4: Missing GEMINI_API_KEY Causes Silent Fallback, No Toast

**What goes wrong:** User forgets to enter API key. LLMConfigError thrown in factory but no UI notification. JARVIS silently uses LM Studio.  
**Why it happens:** Error caught at backend, not propagated to Electron. No IPC channel for fallback toast.  
**How to avoid:** Electron reload handler MUST catch error and dispatch toast before falling back. Return explicit { fallbackToLmStudio: true }.  
**Warning signs:** Settings saves silently. Chat still works but uses wrong model.

**Prevention:** In ipc/settings.ts, explicit error handling:
```typescript
if (!response.ok) {
  const { error } = await response.json();
  mainWindow.webContents.send('toast', {
    type: 'error',
    message: error.includes('GEMINI_API_KEY') 
      ? 'GEMINI_API_KEY inválida — usando LM Studio'
      : `LLM reload failed: ${error}`,
  });
}
```

### Pitfall 5: Token Count for Gemini Underestimated (Uses Old Context Window)

**What goes wrong:** User switches to Gemini. Context overflow warning says "20K tokens max" but Gemini has 1M. No warning shown, then truncation happens.  
**Why it happens:** tokenizer.ts CONTEXT_WINDOWS not updated. Stale data from Phase 52 (only lmstudio/openai/anthropic).  
**How to avoid:** Add gemini: 1000000 to CONTEXT_WINDOWS (D-14). Verify against official Gemini API docs.  
**Warning signs:** Switching to Gemini shows overflow warning for 2K tokens in 4096-token window (old lmstudio value).

**Verification:** [Long context | Gemini API](https://ai.google.dev/gemini-api/docs/long-context) confirms 1M tokens.

### Pitfall 6: LM Studio Model Detection Call Blocks Reload Endpoint

**What goes wrong:** GET /v1/models hangs (LM Studio crashed or slow). User reload times out. Gemini not loaded.  
**Why it happens:** Model detection fetch has no timeout. Implementation waits indefinitely.  
**How to avoid:** Wrap fetch in Promise.race() with 5s timeout. Make detection non-fatal (log only, don't return error).  
**Warning signs:** Reload endpoint hangs for >10s when LM Studio offline. No model detection in console.

**Prevention:** In reload-llm endpoint:
```typescript
const modelDetectionPromise = Promise.race([
  fetch(`${cfg.LM_STUDIO_URL}/models`),
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
]);
try {
  await modelDetectionPromise;
} catch (err) {
  console.warn(`[LM Studio] Model detection timeout or offline: ${err.message}`);
  // Continue — detection is non-fatal
}
```

---

## Code Examples

### Example 1: Factory Case for Gemini

**Source:** Extrapolated from existing factory.ts (HIGH confidence — same pattern)

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

// In createLLM() switch statement:
case 'gemini':
  if (!cfg.GEMINI_API_KEY) {
    throw new LLMConfigError('gemini', 'GEMINI_API_KEY');
  }
  return new ChatGoogleGenerativeAI({
    apiKey: cfg.GEMINI_API_KEY,
    model: cfg.LLM_MODEL || 'gemini-2.0-flash',
    streaming: true,
    // Optional: maxRetries, temperature can be added here (Phase 58+)
  });
```

**Why this works:**
- Same BaseChatModel interface returned
- Streaming enabled (required by chat router)
- LangChain handles auth, retries, safety filters internally

### Example 2: Zod Schema Extension for Gemini

**Source:** Extrapolated from existing config.ts (HIGH confidence — same pattern)

```typescript
import { z } from 'zod';

export const envSchema = z.object({
  LLM_PROVIDER: z.enum(['lmstudio', 'openai', 'anthropic', 'gemini']).default('lmstudio'),
  LLM_MODEL: z.string().optional().default(''),
  LM_STUDIO_URL: z.string().url().default('http://localhost:1234/v1'),
  LM_STUDIO_MODEL: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),  // NEW
  BACKEND_TS_PORT: z.coerce.number().default(8001),
});
```

### Example 3: POST /internal/reload-llm Handler

**Source:** Adapted from Phase 54 /internal/actions-log pattern (HIGH confidence)

```typescript
// apps/backend-ts/src/routes/reload-llm.ts
import { Router } from 'express';
import { z } from 'zod';
import { createLLM } from '../llm/factory.js';
import { detectCapabilities } from '../llm/capabilities.js';

const ReloadLlmBodySchema = z.object({
  provider: z.enum(['lmstudio', 'openai', 'anthropic', 'gemini']),
  lmStudioUrl: z.string().optional(),
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  llmModel: z.string().optional(),
});

export const reloadLlmRouter = Router();

reloadLlmRouter.post('/reload-llm', async (req, res) => {
  const parsed = ReloadLlmBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid reload payload', details: parsed.error.issues });
    return;
  }

  const { provider, geminiApiKey, openaiApiKey, anthropicApiKey, llmModel } = parsed.data;

  try {
    // Override config for factory
    const overrideConfig = {
      LLM_PROVIDER: provider,
      GEMINI_API_KEY: geminiApiKey || process.env.GEMINI_API_KEY || '',
      OPENAI_API_KEY: openaiApiKey || process.env.OPENAI_API_KEY || '',
      ANTHROPIC_API_KEY: anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
      LLM_MODEL: llmModel || process.env.LLM_MODEL || '',
    };

    // Create new LLM (throws LLMConfigError if key missing)
    const newLlm = createLLM(provider, overrideConfig);

    // Swap LLM in session (preserves history)
    // CRITICAL: Use lock to prevent race with in-flight send()
    await sessionLock.acquire(async () => {
      chatSession.swapLLM(newLlm);
    });

    // Re-detect capabilities (non-fatal if fails)
    let capabilityInfo = '';
    try {
      const caps = await detectCapabilities({ ...overrideConfig, LLM_PROVIDER: provider });
      capabilityInfo = formatCapabilities(caps);
    } catch (capErr) {
      console.warn('[reload-llm] Capability detection failed:', capErr);
    }

    // For LM Studio, detect model (non-fatal)
    if (provider === 'lmstudio' && overrideConfig.LM_STUDIO_URL) {
      try {
        const modelResponse = await Promise.race([
          fetch(`${overrideConfig.LM_STUDIO_URL}/models`),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        if (modelResponse instanceof Response && modelResponse.ok) {
          const data = await modelResponse.json();
          const modelId = data.data?.[0]?.id ?? 'unknown';
          console.log(`[LM Studio] Detected model: ${modelId}`);
        }
      } catch (err) {
        console.warn(`[LM Studio] Model detection failed: ${err}`);
      }
    }

    res.json({ success: true, capabilities: capabilityInfo });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[reload-llm] Error:', message);
    res.status(400).json({ error: message });
  }
});
```

### Example 4: ChatSession.swapLLM() Method

**Source:** Extrapolated from existing ChatSession structure (HIGH confidence — follows agent recreation pattern)

```typescript
// In apps/backend-ts/src/session/chat-session.ts

/**
 * Swap the LLM while preserving conversation history.
 * Must be called under a lock to prevent race with in-flight send().
 *
 * Updates this.llm and recreates this._agent with the new LLM.
 * All messages in this.history are preserved.
 */
public swapLLM(newLlm: BaseChatModel): void {
  console.log('[ChatSession] Swapping LLM');
  
  // Update the stored LLM
  this.llm = newLlm;

  // Recreate agent with new LLM, old tools, old history preserved
  this._agent = createReactAgent({
    llm: newLlm,
    tools: [
      createRecallMemoryTool(this.memory),
      ...this._pcToolsWrapped,
      createRequestFileActionTool(this._clientIdRef),
    ],
    prompt: SYSTEM_PROMPT,
  }) as unknown as ReactAgentLike;

  console.log('[ChatSession] LLM swapped, agent recreated');
}
```

### Example 5: Electron Store Getters/Setters for API Keys

**Source:** Extrapolated from existing store.ts TTS pattern (HIGH confidence)

```typescript
// In apps/desktop/src/main/store.ts

// Gemini API key accessors
export function getGeminiApiKey(): string {
  return store.get('geminiApiKey')?.key ?? '';
}

export function setGeminiApiKey(key: string): void {
  store.set('geminiApiKey', { key });
}

// OpenAI API key accessors (D-09: also added in Phase 57)
export function getOpenaiApiKey(): string {
  return store.get('openaiApiKey')?.key ?? '';
}

export function setOpenaiApiKey(key: string): void {
  store.set('openaiApiKey', { key });
}

// Anthropic API key accessors (D-09: also added in Phase 57)
export function getAnthropicApiKey(): string {
  return store.get('anthropicApiKey')?.key ?? '';
}

export function setAnthropicApiKey(key: string): void {
  store.set('anthropicApiKey', { key });
}

// Update StoreSchema to include new fields:
// geminiApiKey?: { key: string };
// openaiApiKey?: { key: string };
// anthropicApiKey?: { key: string };
```

### Example 6: Token Window for Gemini

**Source:** Official Gemini docs (HIGH confidence)

```typescript
// In apps/desktop/src/renderer/src/lib/tokenizer.ts

const CONTEXT_WINDOWS: Record<LlmProvider, number> = {
  lmstudio: 4096,    // Conservative default
  openai: 8192,      // GPT-3.5-turbo typical
  anthropic: 100000, // Claude 3
  gemini: 1000000,   // Gemini 2.0 Flash (verified Feb 2025)
};
```

---

## Runtime State Inventory

> Not applicable for Phase 57. This phase introduces new provider support with no existing state to migrate. No databases store "gemini", no Task Scheduler tasks reference it, no live services have Gemini config.

**Explicitly verified:** None — greenfield addition.

---

## Environment Availability

> Phase 57 depends on external service (Google Gemini API via internet). No local tools required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Internet connection | Chat with Gemini | ✓ (assumed user has) | — | Degrade to LM Studio on network error |
| Google API key | Gemini authentication | Optional (user configures) | — | LM Studio (same as missing key) |
| LM Studio | Fallback provider | ✓ (shipped with JARVIS) | Configurable | — (required for Phase 57 success criterion SC-3) |

**Missing dependencies with no fallback:**
- Internet (chat with cloud LLM requires internet) — user assumes cloud provider usage

**Missing dependencies with fallback:**
- GEMINI_API_KEY — falls back to LM Studio with error toast

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing, Phase 48+) |
| Config file | `apps/backend-ts/vitest.config.ts` + `apps/desktop/vitest.config.ts` |
| Quick run command | `npm run test -- --run` (in each workspace) |
| Full suite command | `npm run test` (CI default) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-PROV-01 | factory.createLLM('gemini', config) returns ChatGoogleGenerativeAI with correct model | unit | `npm run test -- factory.test.ts` | ❌ Wave 0 |
| LLM-PROV-01 | POST /internal/reload-llm swaps LLM and preserves history | integration | `npm run test -- reload-llm.test.ts` | ❌ Wave 0 |
| LLM-PROV-01 | ChatSession.swapLLM() recreates agent without clearing history | unit | `npm run test -- chat-session.test.ts -t "swapLLM"` | ❌ Wave 0 |
| LLM-PROV-01 | Settings UI shows Gemini option in dropdown + conditional API key field | component | `npm run test -- LlmSection.test.tsx` | ✅ exists (extends existing) |
| LLM-PROV-01 | IPC settings handler saves Gemini API key to electron-store | unit | `npm run test -- ipc-settings.test.ts` | ❌ Wave 0 |
| LLM-PROV-01 | Missing GEMINI_API_KEY shows error toast, degrades to LM Studio | integration | `npm run test -- settings-save.test.ts` | ❌ Wave 0 |
| LLM-PROV-01 | Safety filter null content triggers "JARVIS não pôde responder" toast | integration | `npm run test -- safety-filter.test.ts` | ❌ Wave 0 |
| LLM-PROV-01 | CONTEXT_WINDOWS tokenizer includes gemini: 1000000 | unit | `npm run test -- tokenizer.test.ts` | ✅ exists (extends existing) |

### Sampling Rate
- **Per task commit:** `npm run test -- --run` in affected workspace
- **Per wave merge:** Full `npm test` across all workspaces
- **Phase gate:** Full suite green + manual smoke test: Settings → select Gemini → chat → verify response

### Wave 0 Gaps
- [ ] `apps/backend-ts/src/__tests__/llm/factory.test.ts` — unit tests for createLLM('gemini', ...) with mocked ChatGoogleGenerativeAI
- [ ] `apps/backend-ts/src/__tests__/routes/reload-llm.test.ts` — integration test for POST /internal/reload-llm: happy path, invalid key, LM Studio detection timeout
- [ ] `apps/backend-ts/src/__tests__/session/chat-session-swap-llm.test.ts` — unit test for swapLLM() preserving history + recreating agent
- [ ] `apps/desktop/src/__tests__/main/ipc/settings-reload-llm.test.ts` — IPC handler test: save Gemini key, call fetch mock, dispatch toast on error
- [ ] `apps/desktop/src/__tests__/renderer/settings/LlmSection.test.tsx` — extend existing: add test for llmProvider='gemini' shows Gemini API key input
- [ ] `apps/desktop/src/__tests__/renderer/lib/tokenizer.test.ts` — extend existing: add test for CONTEXT_WINDOWS['gemini'] === 1000000

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single LLM provider per session (hardcoded at startup) | Multi-provider factory + live reload (Phase 52+) | Phase 52 (openai/anthropic added) | Users can now switch providers without restart; memory preserved. |
| API keys in .env only | electron-store + process.env fallback (Phase 57) | Phase 57 (Gemini + OpenAI/Anthropic keys) | Users can configure API keys via UI; dev experience improved (no .env file editing). |
| No safety filter handling | Explicit null content detection → user-facing toast (Phase 57) | Phase 57 (Gemini-specific) | Gemini's safety filters no longer appear as crashes or blank responses. |
| LM Studio model name hardcoded in config | Runtime detection via GET /v1/models (Phase 57) | Phase 57 (Gemini reload) | Accurate model name logged; easier to debug user setup issues. |

**Deprecated/outdated:**
- _Nothing deprecated in Phase 57_ — purely additive (factory case, config field, UI component).

---

## Open Questions

1. **Should CONTEXT_WINDOWS['lmstudio'] have a default value or remain unset?**
   - What we know: Code currently `lmstudio: 4096` (conservative estimate from Phase 52)
   - What's unclear: Whether to make it configurable per loaded model or keep static
   - Recommendation: Keep 4096 for now (Phase 52 decision holds). Phase 58+ can refine via model detection.

2. **Should Gemini safety settings be configurable via Settings UI or hardcoded?**
   - What we know: ChatGoogleGenerativeAI accepts safetySettings param (verified via LangChain docs)
   - What's unclear: Whether users need per-harm-category thresholds or basic block-all/block-none toggle
   - Recommendation: Hardcode safe defaults (no overrides) for Phase 57. Phase 58+ can add safety settings UI if needed.

3. **Should POST /internal/reload-llm accept full LLMConfig or just the override fields?**
   - What we know: Electron has all fields (from electron-store)
   - What's unclear: Whether to send all fields or only changed ones to reduce payload
   - Recommendation: Accept only provider + API keys + optional URL/model (minimal schema). Backend merges with process.env defaults.

---

## Sources

### Primary (HIGH confidence)
- [LangChain Reference: ChatGoogleGenerativeAI](https://reference.langchain.com/javascript/langchain-google-genai/ChatGoogleGenerativeAI) — constructor parameters, streaming, tool binding
- [Google Gemini API: Long context documentation](https://ai.google.dev/gemini-api/docs/long-context) — 1M token context window confirmed for Gemini 2.0 Flash
- [Google Gemini API: Safety settings](https://ai.google.dev/gemini-api/docs/safety-settings) — safety filter architecture, finish_reason SAFETY handling
- [Google Developers Blog: Gemini 2.0 Flash release](https://developers.googleblog.com/en/start-building-with-the-gemini-2-0-flash-family/) — model release date (Feb 5, 2025), specs
- Existing JARVIS codebase: factory.ts, config.ts, ChatSession, store.ts, ipc/settings.ts (code inspection, verified pattern)

### Secondary (MEDIUM confidence)
- [LangChain Docs: ChatGoogleGenerativeAI integration](https://docs.langchain.com/oss/javascript/integrations/chat/google_generative_ai) — setup, basic usage
- [Gemini API: Safety and content filters](https://ai.google.dev/gemini-api/docs/safety-guidance) — safety filter recommendations, block strategies
- Phase 54 RESEARCH.md: /internal/actions-log pattern (POST endpoint, Zod validation, Router registration)

### Tertiary (LOW confidence — training data, flagged for validation)
- LangChain Google Generative AI integration version compatibility (no official compatibility matrix found; using latest npm version 2.1.15)

---

## Metadata

**Confidence breakdown:**
- Standard stack (versions, libraries): HIGH — @langchain/google-genai v2.1.15 verified via npm, Gemini 2.0 Flash verified via official Google docs (Feb 2025)
- Architecture (factory, config, endpoint patterns): HIGH — all patterns replicate existing Phase 52+ code (openai/anthropic factory cases, LM Studio URL pattern, electron-store API key pattern)
- Pitfalls (safety filters, token counting, race conditions): MEDIUM-HIGH — documented in Gemini API docs and LangChain issues; some require code inspection (ChatSession race condition guard is architecture decision, not library-documented)
- Error handling (invalid key, safety filter): MEDIUM — Gemini API docs confirm null content on SAFETY, but exact LangChain integration behavior requires verification during implementation

**Research date:** 2026-05-06  
**Valid until:** 2026-05-20 (15 days — Gemini API stable but watch for model deprecations)
