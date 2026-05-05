# Phase 52: Settings Extras — Research

**Researched:** 2026-05-05
**Domain:** Electron Settings UI + LLM configuration + voice parameter runtime application
**Confidence:** HIGH

## Summary

Phase 52 extends the existing Settings UI to expose three user-configurable features currently locked to environment variables or hardcoded values:

1. **LM Studio URL customization** — Users can change `LM_STUDIO_URL` without restarting (SEXT-01)
2. **LLM provider switching** — Users can switch between Claude/OpenAI/LM Studio with token-count validation (SEXT-02)
3. **Wake word sensitivity adjustment** — Users can tune the classifier threshold 0.0–1.0 in real-time (SEXT-03)

All three settings must persist via `electron-store` and apply immediately via IPC without restart, following the pattern established in Phase 49 (VAD threshold slider) and Phase 34 (TTS provider switching).

**Primary recommendation:** Add three new UI controls to the Settings layout (LM Provider section with URL + provider dropdown + context token warning modal), reuse existing WakeWordEngine threshold pattern for sensitivity slider, leverage existing electron-store accessors, and implement IPC apply-without-restart for all three.

---

## User Constraints

(No CONTEXT.md exists for this phase; all research driven by phase requirements and v2.2 architecture from STATE.md)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEXT-01 | User can configure LM Studio URL in Settings UI; applied via IPC without restart | LM_STUDIO_URL currently hard-wired to env; backend `loadConfig()` uses Zod to parse from process.env; need Electron → main IPC handler to update runtime config |
| SEXT-02 | User can switch LLM provider (Claude/OpenAI/LM Studio); context overflow warning before confirm | LLM_PROVIDER env var controls choice; need token-count revalidation on provider switch; warning modal pattern exists in Phase 50 (Whisper download error handling) |
| SEXT-03 | User can adjust wake word sensitivity (0.0–1.0 slider) applied in real-time | WakeWordEngine accepts `threshold` option (line 49); need store accessor + IPC handler similar to VAD threshold (Phase 40 pattern) |

---

## Standard Stack

### Core Settings Pattern (Electron → Main → Renderer)

| Component | Version | Purpose | How It Works |
|-----------|---------|---------|--------------|
| `electron-store` | 9.x | Persistent key-value store on disk | Single source of truth for all user prefs; accessed via store.get/set in main |
| Preload Bridge | TypeScript | Exposes safe IPC API to renderer | window.settings.* calls ipcRenderer.invoke/send to main handlers |
| Main IPC Handlers | Electron 27+ | Validates and applies settings | ipcMain.handle() registers async handlers; main → renderer broadcast via webContents.send() |
| React state (renderer) | 18.3+ | Local form state, dirty tracking, loading states | useState for pttHotkey, ttsProvider, etc.; useEffect to load on mount |
| Radix/shadcn UI | Latest | Accessible form primitives | Select for LLM provider, Input for URL, Slider for wake word threshold |

### LLM Configuration (Backend)

| Component | Location | Purpose | Current State |
|-----------|----------|---------|---|
| `envSchema` | `apps/backend-ts/src/llm/config.ts` | Zod validation schema | `LLM_PROVIDER` enum, `LM_STUDIO_URL` url type, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` |
| `loadConfig()` | `apps/backend-ts/src/llm/config.ts` | Loads env at startup | Exits with code 1 if validation fails; no runtime reconfiguration |
| LLM Factory | (inferred from architecture) | Creates ChatModel by provider | Expected to read config and instantiate langchain-openai, langchain-anthropic, or openai directly |

### Wake Word Engine

| Component | Location | Current State |
|-----------|----------|---|
| `WakeWordEngine` | `apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts` | Constructor accepts `threshold: number` (0..1); default likely 0.5 (WAKE-01 research gap) |
| `WakeWordSessions` (ONNX models) | renderer voice pipeline | 4 models loaded at start; threshold passed to classifier scoring |
| Storage | Not found in current codebase | **Gap identified:** Wake word threshold not persisted; VAD threshold (Phase 40) is persisted but separate |

### Validation & Warning Modals

| Pattern | Location | Current Implementation |
|---------|----------|---|
| Context token recount | Not yet implemented | Need: tokenizer import (js-tiktoken or similar) to validate token count on provider switch |
| Warning modal | Phase 50 (Whisper error) | Toast-based; may need dialog for provider switch confirmation |
| Dirty tracking | SettingsLayout.tsx line 148 | Uses JSON.stringify to detect form changes; works for form-level dirty flag |

---

## Architecture Patterns

### Phase 49 + Phase 40 Precedent: Settings with Real-Time Apply

**What:** Settings that apply without Save button click or restart.

**When to use:** Any setting where user expects immediate feedback (VAD threshold slider, now wake word sensitivity).

**Example (VAD Threshold Pattern — Phase 40):**

```typescript
// SettingsLayout.tsx
async function handleVadThresholdChange(ms: number): Promise<void> {
  setVadThresholdMs(ms);
  try {
    await window.settings.setVadThreshold(ms);  // IPC invoke
  } catch (err) {
    showToast('error', `Failed to apply VAD threshold: ${err.message}`);
  }
}

// preload/settings.ts
const settings: SettingsApi = {
  setVadThreshold: (ms: number) => ipcRenderer.invoke('always-listening:vad-threshold', ms),
};

// main/ipc/settings.ts — Phase 40
ipcMain.handle(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD, async (_event, ms: number) => {
  const clamped = Math.max(300, Math.min(800, ms));
  setVadSilenceThresholdMs(clamped);  // store.set in store.ts
  
  // Broadcast to renderer for live reconfig
  mainWindow.webContents.send('vad:threshold-changed', clamped);
  return { success: true, clampedMs: clamped };
});
```

**Adaptation for Phase 52:**
- Wake word sensitivity (0.0–1.0) follows same pattern: onChange → IPC invoke → store.set → renderer reconfig
- LM Studio URL: onChange + onBlur (URL validation); apply via IPC invoke
- LLM provider: onChange (dropdown) + confirmation modal; apply via IPC invoke after modal confirm

### SettingsSectionProps Pattern (Phase 49)

**What:** Interface contracts what props each section component receives.

**When to use:** Add new settings to SettingsSectionProps; sections only destructure what they need via Pick<>.

**Example:** 

```typescript
export interface SettingsSectionProps {
  pttHotkey: string;
  onPttHotkeyChange: (v: string) => void;
  // ... existing fields
  
  // Phase 52 additions
  lmStudioUrl: string;
  onLmStudioUrlChange: (url: string) => void;
  lmProvider: 'lmstudio' | 'openai' | 'anthropic';
  onLmProviderChange: (provider: string) => Promise<void>;
  lmProviderContextWarning?: string | null;
  
  wakeWordThreshold: number;
  onWakeWordThresholdChange: (threshold: number) => Promise<void>;
}

// New section component
type Props = Pick<
  SettingsSectionProps,
  'lmStudioUrl' | 'onLmStudioUrlChange' | 'lmProvider' | 'onLmProviderChange' | 'lmProviderContextWarning'
>;

export function LlmSettingsSection(props: Props) { /* ... */ }
```

### LLM Provider Switch Confirmation Modal

**What:** Warn user before switching providers if context window differs significantly.

**When to use:** LLM provider selection, when token count revalidation shows risk of overflow.

**Pattern (inferred from Phase 50 error modal):**

```typescript
const [providerWarning, setProviderWarning] = useState<string | null>(null);
const [providerPending, setProviderPending] = useState(false);

async function handleProviderChange(newProvider: string): Promise<void> {
  setProviderPending(true);
  try {
    // Estimate token count with new provider's tokenizer
    const tokenCount = await estimateContextTokens(newProvider);
    if (tokenCount > WARNING_THRESHOLD) {
      setProviderWarning(`Provider switch to ${newProvider} may cause context overflow (est. ${tokenCount} tokens). Proceed?`);
      return;
    }
    // Auto-confirm if no warning
    await applyProvider(newProvider);
  } finally {
    setProviderPending(false);
  }
}

async function confirmProviderSwitch(): Promise<void> {
  await applyProvider(lmProvider); // state already updated; IPC applies
  setProviderWarning(null);
}
```

### Navigation Structure for New LLM Settings Section

**Current SettingsLayout nav items (Phase 49):**
```typescript
const NAV_ITEMS = [
  { key: 'ptt', label: 'Push-to-Talk', Icon: Keyboard },
  { key: 'always-listening', label: 'Always-Listening', Icon: Mic },
  { key: 'tts', label: 'Text-to-Speech', Icon: Volume2 },
  { key: 'whisper', label: 'Whisper Model', Icon: Languages },
];
```

**Phase 52 addition:** Insert LLM settings section (before or after TTS, grouped logically). Icon: `Settings` or `Zap` from lucide-react.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL validation on input blur | Regex patterns | Zod (existing in backend) or native `new URL()` | Native URL constructor throws on invalid; Zod available in backend for provider validation |
| Token counting on provider switch | Write tokenizer from scratch | `js-tiktoken` (OpenAI's official lib) or LangChain's tokenizer | Tokenizer changes per provider; js-tiktoken is <50KB and handles GPT-3.5/GPT-4/Claude variants |
| Real-time apply without restart | Event polling loop | Electron IPC invoke + store.set (Phase 40 pattern) | Already proven in VAD threshold; no custom event system needed |
| Confirmation modal on risky action | Custom confirm() | Radix Dialog or shadcn/ui Dialog primitive | Already using shadcn in Phase 48; consistent with design system |
| LLM provider factory reconfiguration | Hot-reload runtime provider | Lazy import + re-require on IPC apply | Backend loads config once at startup; Phase 52 should NOT change that; instead, Electron → backend sends user's chosen provider on each API call |

**Key insight:** Phase 52 stores settings in Electron and reads them on each request → backend LLM factory, not hot-reload in place.

---

## Common Pitfalls

### Pitfall 1: LM Studio URL validation too strict

**What goes wrong:** User enters `localhost:1234/v1` (common format) but Zod `url()` rejects it.

**Why it happens:** `url()` requires full schema (`http://`); users assume port is enough.

**How to avoid:** Accept both `http://host:port` and `host:port`; prepend `http://` if schema missing before URL validation.

**Warning signs:** User complaint "URL field says invalid but it works in terminal"; grep for `new URL()` without try-catch.

### Pitfall 2: Wake word sensitivity not persisted or reapplied on startup

**What goes wrong:** User sets threshold to 0.8, closes JARVIS, reopens; threshold resets to default 0.5.

**Why it happens:** WakeWordEngine threshold not exposed to electron-store; VAD threshold (Phase 40) IS persisted but separate storage key.

**How to avoid:** Add `wakeWordThreshold` to StoreSchema; load in SettingsLayout on mount; pass to WakeWordEngine on initialization.

**Warning signs:** VAD threshold persists but wake word threshold doesn't; search for "WAKE-01" or threshold initialization without store.get.

### Pitfall 3: Token count validation uses wrong provider's tokenizer

**What goes wrong:** User switches from OpenAI (8k context) to Claude (100k context); token count estimate uses GPT-3.5 tokenizer, shows false warning.

**Why it happens:** Tokenizer library imported once at module level; not switched per provider.

**How to avoid:** Lazy-import tokenizer at validation time; use `js-tiktoken.encoding_for_model(modelName)` or equivalent that reads the provider enum.

**Warning signs:** Warning modal shows same token count regardless of provider switch; token count off by 10-40% (tokenizer drift).

### Pitfall 4: IPC handler doesn't broadcast to all windows

**What goes wrong:** Settings window applies LM Studio URL, but main chat window still uses old URL.

**Why it happens:** `mainWindow.webContents.send()` in handler only targets one BrowserWindow instance.

**How to avoid:** Use `BrowserWindow.getAllWindows().forEach(win => win.webContents.send())` pattern (used in Phase 40 `broadcastPauseToggle`).

**Warning signs:** Grepping for webContents.send finds only single-window calls; settings apply locally but other windows don't update.

### Pitfall 5: Dirty tracking breaks when adding new settings

**What goes wrong:** Add lmStudioUrl to form state; dirty tracking via JSON.stringify still marks unchanged settings as dirty.

**Why it happens:** initialSettings snapshot doesn't include new field; comparison always differs.

**How to avoid:** Update the dirty tracking logic when adding fields: `const dirty = JSON.stringify(formValues) !== JSON.stringify(initialSettings);` must include all settable fields in both formValues and initialSettings.

**Warning signs:** Save button is always enabled; diffs show only new field as changed.

---

## Code Examples

### Wake Word Threshold — Store Accessors (Pattern)

```typescript
// main/store.ts — add after VAD threshold accessors (Phase 40)

const WAKE_WORD_THRESHOLD_DEFAULT = 0.5;
const WAKE_WORD_THRESHOLD_MIN = 0.0;
const WAKE_WORD_THRESHOLD_MAX = 1.0;

export function getWakeWordThreshold(): number {
  return store.get('wakeWordThreshold') ?? WAKE_WORD_THRESHOLD_DEFAULT;
}

export function setWakeWordThreshold(threshold: number): void {
  const clamped = Math.max(
    WAKE_WORD_THRESHOLD_MIN,
    Math.min(WAKE_WORD_THRESHOLD_MAX, threshold),
  );
  store.set('wakeWordThreshold', clamped);
}
```

**Source:** Derived from Phase 40 VAD threshold pattern (apps/desktop/src/main/store.ts lines 133-149)

### LM Studio URL Configuration — Main IPC Handler

```typescript
// main/ipc/settings.ts — add new handler

ipcMain.handle('lm-studio:set-url', async (_event, url: string) => {
  try {
    // Validate URL format
    const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
    const normalized = urlObj.toString().replace(/\/$/, ''); // remove trailing slash

    // Store in electron-store for persistence
    store.set('lmStudioUrl', { url: normalized });

    // TODO: Validate connection to LM Studio (optional ping)
    // TODO: Notify backend of URL change on next API call

    return { success: true, appliedUrl: normalized };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
});
```

**Source:** Pattern adapted from Phase 34 `settings:save` handler (apps/desktop/src/main/ipc/settings.ts lines 63-121)

### LLM Provider Switch with Context Warning

```typescript
// renderer/src/settings/sections/LlmSection.tsx (new)

async function handleProviderChange(newProvider: 'lmstudio' | 'openai' | 'anthropic') {
  setProviderChanging(true);
  try {
    // Estimate tokens with new provider's context window
    const estimation = await estimateContextTokens(newProvider);
    if (estimation.exceedsLimit) {
      setProviderWarning(
        `Switching to ${newProvider} (${estimation.contextWindow}k tokens) may cause context overflow. ` +
        `Current conversation uses ~${estimation.estimatedTokens} tokens. Proceed?`
      );
      setPendingProvider(newProvider);
      return;
    }
    // No warning needed, apply directly
    await applyProvider(newProvider);
  } finally {
    setProviderChanging(false);
  }
}

async function applyProvider(provider: string): Promise<void> {
  try {
    await window.settings.setLlmProvider(provider);
    showToast('info', `LLM provider switched to ${provider}`);
  } catch (err) {
    showToast('error', `Failed to apply provider: ${err.message}`);
  }
}
```

**Source:** Pattern synthesized from Phase 50 (Whisper download error modal) and Phase 34 (settings apply); confirmation modal follows Phase 50 precedent.

---

## State of the Art

| Old Approach | Current Approach (v2.2) | When Changed | Impact |
|--------------|--------------------------|--------------|--------|
| LM_STUDIO_URL fixed in .env | User-configurable URL in Settings UI | Phase 52 | Eliminates need to restart after port/host change |
| LLM_PROVIDER env-only | User-selectable provider in Settings UI | Phase 52 | Users can experiment without code/env edit |
| Wake word threshold hardcoded in WakeWordEngine | User slider 0.0–1.0 in Settings UI | Phase 52 | Users tune sensitivity without code change |
| VAD threshold not persisted | VAD threshold persisted + applied real-time (Phase 40) | v2.0 | Pattern reused for wake word sensitivity |
| Settings require app restart to apply | Real-time apply via IPC (Phases 34, 40, 49) | v2.1 | Zero-restart settings UX |

**Deprecated/outdated:**
- Hard-coded `base_url="http://localhost:1234/v1"` in openai SDK calls — now reads from electron-store (future phase, not Phase 52)
- Token counting via LLM API calls — js-tiktoken client-side is faster and private (Phase 52 approach)

---

## Open Questions

1. **Wake word threshold initialization timing**
   - What we know: WakeWordEngine is created in renderer voice pipeline; constructor accepts threshold option
   - What's unclear: Where WakeWordEngine is instantiated; how to pass store value at creation vs. runtime reconfig
   - Recommendation: Treat like VAD threshold — broadcast `wakeWord:threshold-changed` from main to renderer; engine listens and adapts threshold dynamically (may require engine API extension)

2. **LLM provider token counting accuracy**
   - What we know: js-tiktoken exists; LangChain has token counters per provider
   - What's unclear: Should we recount on every keystroke (performance cost) or on-demand on provider switch only?
   - Recommendation: Count only on provider-change event, not real-time; show warning if est. tokens exceed new provider's 80% threshold

3. **Backend configuration hot-reload**
   - What we know: Backend loads config once via `loadConfig()` at startup; validates with Zod; exits if invalid
   - What's unclear: Does backend accept provider/URL overrides per request, or only via startup env?
   - Recommendation: Out of Phase 52 scope — keep backend stateless; Electron sends chosen provider + URL headers on each API call; backend trusts Electron's choice (security caveat: no validation of headers)

4. **Wake word engine reconfiguration API**
   - What we know: WakeWordEngine constructor accepts threshold; no public API to update after construction
   - What's unclear: Should we add `setThreshold(newThreshold)` public method, or restart the engine?
   - Recommendation: Add public method to update threshold without restart (similar to VAD threshold live reconfig); prevents audio stream interruption

---

## Environment Availability

**No external dependencies identified.** Phase 52 is UI + IPC + electron-store; all dependencies (electron, React, Zod, js-tiktoken) already in monorepo or will be npm-installed. No system tools, databases, or services required.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react (Phase 48 baseline) |
| Config file | `apps/desktop/vitest.config.ts` (mirrors electron.vite.config.ts aliases) |
| Quick run command | `npm run test:ui -- settings` |
| Full suite command | `npm run test:ui` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEXT-01 | User types LM Studio URL, clicks out, value persists + applied immediately | Integration | `npm run test:ui -- LlmSettingsSection.test.tsx -t "apply-lm-url"` | ❌ Wave 0 |
| SEXT-01 | URL validation rejects invalid formats (no schema, invalid host) | Unit | `npm run test:ui -- settings.test.ts -t "lm-url-validation"` | ❌ Wave 0 |
| SEXT-02 | User selects provider dropdown, confirmation modal shows token warning if needed | Integration | `npm run test:ui -- LlmSettingsSection.test.tsx -t "provider-switch-warning"` | ❌ Wave 0 |
| SEXT-02 | Token recount uses correct tokenizer per provider | Unit | `npm run test:ui -- tokenizer.test.ts -t "estimate-context-tokens"` | ❌ Wave 0 |
| SEXT-03 | User moves slider, wake word sensitivity updates in real-time without restart | Integration | `npm run test:ui -- WakeWordSettingsSection.test.tsx -t "threshold-apply"` | ❌ Wave 0 |
| SEXT-03 | Wake word threshold persists after close/reopen JARVIS | E2E (manual) | Manual: set threshold 0.8 → close app → reopen → verify slider at 0.8 | N/A |

### Wave 0 Gaps

- [ ] `apps/desktop/src/renderer/src/settings/sections/LlmSettingsSection.tsx` — main LLM settings UI (provider + URL + token warning modal)
- [ ] `apps/desktop/src/renderer/src/settings/sections/__tests__/LlmSettingsSection.test.tsx` — LLM section unit + integration tests
- [ ] `apps/desktop/src/renderer/src/settings/sections/WakeWordSettingsSection.tsx` — wake word sensitivity slider (reuses AlwaysListeningSection pattern)
- [ ] `apps/desktop/src/renderer/src/settings/sections/__tests__/WakeWordSettingsSection.test.tsx` — wake word threshold tests
- [ ] `apps/desktop/src/lib/tokenizer.ts` — token count estimation helper (imports js-tiktoken)
- [ ] `apps/desktop/src/lib/__tests__/tokenizer.test.ts` — tokenizer tests (mocked js-tiktoken)
- [ ] `apps/desktop/src/main/ipc/llm-settings.ts` — IPC handlers for LM URL + provider apply
- [ ] `apps/desktop/src/main/ipc/__tests__/llm-settings.test.ts` — main IPC handler tests
- [ ] `apps/desktop/src/main/store.ts` additions — `lmStudioUrl` and `wakeWordThreshold` accessors
- [ ] `apps/desktop/src/preload/settings.ts` additions — `setLlmStudioUrl`, `setLlmProvider`, `setWakeWordThreshold` bridge methods
- [ ] `apps/desktop/src/shared/ipc-types.ts` additions — new IPC channel names and handler signatures

**Framework install:** None needed (Vitest + React Testing Library already in place from Phase 48).

---

## Sources

### Primary (HIGH confidence)
- **Electron Store:** Official docs + Phase 34 usage pattern (apps/desktop/src/main/store.ts)
- **VAD Threshold IPC Pattern:** Phase 40 implementation (apps/desktop/src/main/ipc/settings.ts, Phase 40 section VLISTEN-04)
- **WakeWordEngine API:** apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts lines 47–60 (threshold in constructor options)
- **LLM Config Schema:** apps/backend-ts/src/llm/config.ts (Zod schema for LLM_PROVIDER, LM_STUDIO_URL, API keys)
- **Settings UI Pattern:** Phase 49 SettingsSectionProps (apps/desktop/src/renderer/src/settings/SettingsLayout.tsx lines 29–44)

### Secondary (MEDIUM confidence)
- **Token Counting Approach:** js-tiktoken GitHub repo (verified as OpenAI's official library; also LangChain's tokenizer uses same lib under the hood)
- **Radix Dialog for Confirmation:** Phase 48 design system foundation (shadcn/ui primitives proven in SettingsLayout)
- **IPC Broadcast Pattern:** Phase 40 `broadcastPauseToggle()` (apps/desktop/src/main/ipc/settings.ts lines 154–158) — shows pattern for multi-window sync

---

## Metadata

**Confidence breakdown:**
- Standard Stack: **HIGH** — electron-store, Electron IPC, React patterns all proven in existing codebase; no new libraries needed
- Architecture: **HIGH** — Phase 40 VAD threshold and Phase 49 SettingsSectionProps provide exact precedent; minimal design ambiguity
- Pitfalls: **MEDIUM** — URL validation and tokenizer selection are standard problems; no project-specific gotchas identified beyond dirty tracking (already addressed in Phase 49)
- Open questions: **LOW** — 3 gaps remain around WakeWordEngine runtime reconfig API and backend hot-reload scope; recommend resolving in plan phase

**Research date:** 2026-05-05
**Valid until:** 2026-05-12 (7 days; Phase 52 depends on stable tech; no rapid changes expected in electron, LangChain, or js-tiktoken)

---

## Next Steps for Planner

1. **SettingsSectionProps expansion:** Add lmStudioUrl, lmProvider, wakeWordThreshold + change handlers
2. **New section components:** LlmSettingsSection (provider dropdown + URL input + token warning modal), WakeWordSettingsSection (threshold slider)
3. **Store + IPC layer:** Add handlers for URL validation + apply, provider switch + token recount + confirmation, threshold apply
4. **Token estimation helper:** Lazy-import js-tiktoken; estimate context usage per provider on demand
5. **Test coverage:** Unit tests for URL validation, token estimation; integration tests for IPC apply; E2E manual test for persistence

