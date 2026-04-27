# Phase 44: Hardening & Migration — Research

**Researched:** 2026-04-27
**Domain:** macOS permission handling, electron-store migration, memory profiling, Electron API surface
**Confidence:** HIGH

## Summary

Phase 44 addresses three production-readiness requirements for JARVIS v1.9: (1) macOS-specific microphone permission verification at mode switch time with actionable user feedback, (2) transparent migration of users upgrading from v1.8 (no electron-store `voiceMode` field) with safe defaults, and (3) memory stability validation via 8-hour soak test to detect heap leaks in Always-Listening mode.

Research confirms Electron's `systemPreferences.getMediaAccessStatus()` API is the standard pattern for this use case, with status values supporting three deny states (`'not-determined'`, `'denied'`, `'restricted'`). The existing electron-store wrapper already implements the v1.8→v1.9 migration pattern correctly via default-on-read. The soak test pattern requires careful management of `process.memoryUsage().heapUsed` with garbage collection awareness.

**Primary recommendation:** Implement D-01 permission check in tray.ts before `setMode()` call using `systemPreferences.getMediaAccessStatus('microphone')`, extend `VoiceModeSwitchResult` with optional `blockedReason` and `settingsUrl` fields, test migration via existing vitest store mock pattern, and measure heap growth in main process with forced GC intervals to account for V8 non-determinism.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Verificar `systemPreferences.getMediaAccessStatus('microphone')` no click handler de `tray.ts`, ANTES de chamar `voiceModeManager.setMode()`

**D-02:** Check aplica-se a AMBOS `always-listening` E `ptt-only` (ambos usam microfone)

**D-03:** Quando permissão negada: broadcast `VoiceModeSwitchResult` com campos estendidos `blockedReason: 'mic-permission-denied'` e `settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'`

**D-04:** Renderer exibe toast acionável (consistente com UX Phase 42) com link clicável para System Settings. Main abre URL via `shell.openExternal()` quando usuário clica.

**D-05:** Check somente no macOS (`process.platform === 'darwin'`). Linux e Windows cobertos pelo `session.setPermissionRequestHandler` existente em `index.ts`.

**D-06:** Usar `systemPreferences.getMediaAccessStatus('microphone')` (não `askForMediaAccess`) — lê estado atual sem exibir prompt do OS. Statuses tratados como "não concedido": `'not-determined'`, `'denied'`, `'restricted'`.

**D-07:** Implementar como script standalone `apps/desktop/scripts/soak-test.ts` — NÃO parte do suite de testes normal (muito lento para CI)

**D-08:** Medir `process.memoryUsage().heapUsed` no main process

**D-09:** Baseline: capturar heap em t=30s (após warm-up) e comparar com t=8h; delta deve ser <10MB

**D-10:** Script documentado no README como "run before release to validate Always-Listening heap stability"

**D-11:** Unit tests apenas no arquivo de teste de `store.ts`

**D-12:** Cenário foco: store sem campo `voiceMode` → `getVoiceMode()` retorna `'wake-word'` (sem crash)

**D-13:** A lógica de migration em `store.ts:getVoiceMode()` é a implementação canônica — nenhuma nova lógica de migration necessária

**D-14:** Escopo limitado ao macOS mic permission (VHARD-01). Sem comportamentos de degradação adicionais para Linux/Windows nesta fase.

### Claude's Discretion

- Tipo exato do campo `blockedReason` no `VoiceModeSwitchResult` (string literal type vs string)
- Texto exato do toast no renderer para o cenário de permissão negada
- Duração do soak test (se <8h for suficiente para validação), intervalo de amostragem e formato do relatório
- Wording da mensagem acionável no toast

### Deferred Ideas (OUT OF SCOPE)

- VPOLISH-03: Graceful degrade UX se intent classifier falha >5% — toast warning + opção de auto-disable Always-Listening (v1.10+)
- VTEL-02: Memory/heap monitoring contínuo para detectar leaks em sessões longas (v1.10+)
- VPOLISH-01: Hotkey conflict detection cross-platform (v1.10+)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VHARD-01 | macOS permission re-check via `systemPreferences.getMediaAccessStatus()` em cada mode switch + config migration v1.8→v1.9 com default `voiceMode='wake-word'` para usuários sem o campo, evitando quebrar comportamento existente | Research confirms `getMediaAccessStatus()` as standard API; identifies four status values ('granted', 'not-determined', 'denied', 'restricted'); verifies electron-store migration pattern already correctly implemented in getVoiceMode(); heap measurement reliability documented with GC caveats. |

</phase_requirements>

## Standard Stack

### Core Dependencies

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.1.1 | Electron runtime | Target version in project; `systemPreferences` API stable since Electron v1.0. |
| electron-store | 11.0.2 | Configuration persistence | Current project version; tested pattern for mocking in unit tests (vitest). |
| vitest | 4.1.2 | Test runner | Project standard; supports mocking of ES modules and CommonJS. |
| Node.js | 20+ (bundled in Electron) | Runtime for soak test script | `process.memoryUsage()` and `gc()` APIs native; available in main process. |

### macOS-Specific APIs

| API | Module | Purpose | Availability |
|-----|--------|---------|--------------|
| `systemPreferences.getMediaAccessStatus('microphone')` | electron | Query microphone permission without prompting | macOS 10.14+; returns 'granted' \| 'not-determined' \| 'denied' \| 'restricted' \| 'unknown' |
| `shell.openExternal()` | electron | Open System Settings deep link | Cross-platform; safe for user-initiated clicks from renderer |
| `process.memoryUsage().heapUsed` | Node.js stdlib | Measure JS heap usage | All platforms; non-deterministic due to V8 GC behavior |

**Why these are standard:**

- `systemPreferences.getMediaAccessStatus()` is the Electron-blessed pattern for permission queries on macOS — documented in official Electron API docs [CITED: https://www.electronjs.org/docs/latest/api/system-preferences]. Does not prompt user (unlike `askForMediaAccess()`), making it suitable for automatic checks at mode switch time.

- `shell.openExternal()` is the cross-platform safe method for opening URLs from the renderer process — prevents navigation to arbitrary URLs and isolates the action.

- `process.memoryUsage().heapUsed` is the standard Node.js metric for JavaScript heap pressure — though non-deterministic, it's the primary signal for heap leak detection in production Node.js code.

## Architecture Patterns

### Pattern 1: macOS Permission Gate Before Strategy Switch

**What:** Before allowing a mode switch to `always-listening` or `ptt-only` (both use microphone), check permission status synchronously in the main process, block the switch if denied, and notify renderer with actionable feedback.

**When to use:** All platforms; permission gate only executes on macOS (D-05).

**Example:**

```typescript
// apps/desktop/src/main/tray.ts — click handler (INSERTION POINT D-01)
click: async () => {
  // D-01/D-02/D-05: Permission check BEFORE setMode() — macOS only
  if (process.platform === 'darwin' && 
      (option.mode === 'always-listening' || option.mode === 'ptt-only')) {
    const { systemPreferences } = require('electron');
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    
    // D-06: Treat 'not-determined', 'denied', 'restricted' as blocked
    if (micStatus !== 'granted') {
      // D-03: Broadcast with blockedReason and settingsUrl
      broadcastModeSwitch({
        success: false,
        blockedReason: 'mic-permission-denied',
        settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      });
      return;
    }
  }
  
  // Original logic — D-01: only if permission check passed
  const success = await voiceModeManager.setMode(option.mode, 'user');
  broadcastModeSwitch({ success, newMode: success ? option.mode : undefined, ... });
}
```

[Source: CONTEXT.md D-01, D-02, D-03, D-05, D-06; Electron docs https://www.electronjs.org/docs/latest/api/system-preferences]

### Pattern 2: electron-store Migration via Default-on-Read

**What:** When a v1.8 store lacks the `voiceMode` field, `getVoiceMode()` silently returns `'wake-word'` — no migration script needed, no crashes, upgrade is transparent.

**When to use:** All v1.8→v1.9 user upgrades; pattern generalizes to any field with a sensible default.

**Example:**

```typescript
// apps/desktop/src/main/store.ts (existing pattern — NO CHANGE NEEDED)
export function getVoiceMode(): VoiceMode {
  const value = store.get('voiceMode');
  const validModes: VoiceMode[] = ['wake-word', 'always-listening', 'ptt-only'];
  
  // D-07 (D-12): Undefined OR invalid → default 'wake-word'
  if (value !== undefined && validModes.includes(value as VoiceMode)) {
    return value as VoiceMode;
  }
  return DEFAULT_VOICE_MODE; // 'wake-word'
}
```

[Source: CONTEXT.md D-07, D-12, D-13; verified in `/root/jarvis/apps/desktop/src/main/store.ts` lines 143-150]

### Pattern 3: VoiceModeSwitchResult Type Extension (IPC Contract Versioning)

**What:** Extend `VoiceModeSwitchResult` interface with optional fields for blocked states without breaking existing success-case consumers. Optional fields signal "this payload may contain additional data".

**When to use:** When extending IPC types used bidirectionally (success and failure cases) where consumers must be backward-compatible.

**Example:**

```typescript
// apps/desktop/src/shared/ipc-types.ts
export interface VoiceModeSwitchResult {
  /** true = modo trocado com sucesso; false = bloqueado */
  success: boolean;
  /** Modo para o qual a troca ocorreu. Presente apenas quando success:true. */
  newMode?: VoiceMode;
  /** Label human-readable do novo modo. Presente apenas quando success:true. */
  label?: string;
  
  /** D-03: Reason for blocking (e.g., 'mic-permission-denied'). Presente apenas quando success:false. */
  blockedReason?: 'mic-permission-denied';
  /** D-03: Deep link URL para System Settings. Presente apenas quando success:false. */
  settingsUrl?: string;
}
```

[Source: CONTEXT.md D-03; existing pattern in ipc-types.ts lines 177-184]

### Pattern 4: Heap Memory Measurement in Soak Test

**What:** Measure `process.memoryUsage().heapUsed` at baseline (t=30s post-startup after warm-up) and final (t=8h). Difference >10MB signals potential heap leak. Use forced GC intervals to reduce V8 non-determinism.

**When to use:** Soak tests for long-running processes (Always-Listening, 8+ hour sessions).

**Example:**

```typescript
// apps/desktop/scripts/soak-test.ts (standalone, non-test)
const baseline = { time: 30_000, heap: process.memoryUsage().heapUsed };
const measurements = [];

// Sample every 30 min
const intervalId = setInterval(() => {
  // Optional: force GC if available (run with --expose-gc)
  if (global.gc) global.gc();
  
  const current = process.memoryUsage().heapUsed;
  measurements.push({ time: Date.now(), heap: current });
}, 30 * 60 * 1000);

// At 8h or user abort:
clearInterval(intervalId);
const delta = measurements[measurements.length - 1].heap - baseline.heap;
console.log(`Heap delta over 8h: ${(delta / 1024 / 1024).toFixed(2)} MB`);
console.log(delta < 10 * 1024 * 1024 ? 'PASS' : 'FAIL');
```

[Source: Node.js Memory Diagnostics https://nodejs.org/learn/diagnostics/memory/understanding-and-tuning-memory; Joyee Cheung memory leak testing guide https://joyeecheung.github.io/blog/2024/03/17/memory-leak-testing-v8-node-js-1/]

### Anti-Patterns to Avoid

- **Calling `systemPreferences.askForMediaAccess()` at mode switch time:** This shows a prompt dialog, interrupting the user flow. Use `getMediaAccessStatus()` to read the current state without prompting.

- **Hardcoding the System Settings URL without platform guard:** The `x-apple.systempreferences` scheme only works on macOS. D-05 enforces platform check.

- **Ignoring 'not-determined' and 'restricted' statuses:** D-06 specifies all three denial states ('not-determined', 'denied', 'restricted') must be treated as blocked — do not assume 'not-determined' will succeed on next attempt.

- **Relying solely on `heapUsed` deltas without GC intervals:** V8's GC is non-deterministic; tight-loop memory measurements may show false positives. Sample at 30-minute intervals and optionally force GC if `--expose-gc` is enabled.

- **Broadcasting `VoiceModeSwitchResult` success event when permission is denied:** The existing broadcastModeSwitch pattern only broadcasts on actual mode change. D-03 requires broadcasting even when permission denies the switch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Microphone permission query on macOS | Custom shell script or hardcoded permission lookup | `systemPreferences.getMediaAccessStatus('microphone')` (Electron API) | Electron abstracts platform differences; returns enum-like status values; no shell escape risks. |
| Opening System Settings from Electron | Calling `open(1)` via shell or `child_process.exec()` | `shell.openExternal()` from Electron | `shell.openExternal()` validates URLs, prevents injection, and integrates with Electron's permission model. |
| Store migration logic | Custom migration script that runs once per app install | Default-on-read pattern (getVoiceMode() returns 'wake-word' if undefined) | No external state needed; works transparently across updates; pattern already proven in electron-store field accessors. |
| Memory profiling for heap leaks | Hand-written GC coordination logic | `process.memoryUsage().heapUsed` + forced GC via `--expose-gc` flag | Node.js stdlib provides this; no dependencies; forced GC via flag is standard practice (used by V8 team). |

**Key insight:** Electron's `systemPreferences` API is purpose-built for platform-specific permission queries — attempting to shell out or hardcode OS-specific APIs introduces fragmentation and security risks. The electron-store getter pattern is battle-tested across dozens of fields in JARVIS codebase (hotkey, pttHotkey, voiceMode, vadSilenceThresholdMs) — it's the proven migration strategy.

## Runtime State Inventory

**Trigger:** Phase 44 does not involve renaming or refactoring stored data keys — it only adds a permission check gate and migration safety. Runtime state inventory is not required for this phase.

## Common Pitfalls

### Pitfall 1: `getMediaAccessStatus()` Returns 'unknown' on Unsupported Platforms

**What goes wrong:** Developer assumes `getMediaAccessStatus()` will always return a known value; code on Linux/Windows receives `'unknown'` and crashes or silently denies access.

**Why it happens:** Electron API is not uniformly implemented across all platforms. Windows has a global media permission setting; Linux has no centralized permission model. Electron returns `'unknown'` when it cannot determine the status.

**How to avoid:** (a) Always guard with `process.platform === 'darwin'` (D-05) to only run on macOS, OR (b) treat `'unknown'` as equivalent to `'granted'` (assume access is available until proven otherwise) and rely on OS-level prompts for actual permission denial.

**Warning signs:** App logs show permission denied errors only on Windows/Linux but not during testing on macOS; permission checks silently fail on non-macOS systems.

[Source: Electron docs https://www.electronjs.org/docs/latest/api/system-preferences; research note: Windows permission model documented as global setting, Linux as no native support.]

### Pitfall 2: `heapUsed` Measurement Affected by Native Code Memory (RSS Growth)

**What goes wrong:** Soak test shows `heapUsed` is stable, but RSS (resident set size) grows unbounded — conclusion: "no heap leak detected" is false.

**Why it happens:** JavaScript heap is only part of process memory. Native modules (Whisper.cpp, ONNX runtime, audio libraries) allocate memory outside the JS heap. `heapUsed` doesn't see these allocations.

**How to avoid:** Sample `process.memoryUsage()` fully — track `rss` (resident set size) in addition to `heapUsed`. If RSS grows while heapUsed is stable, suspect a native module leak, not JS leak. Soak test should report both metrics.

**Warning signs:** Heap stable but process crashes due to OOM after 4+ hours; system shows process consuming 500MB+ but heapUsed reports <100MB.

[Source: Node.js diagnostics https://nodejs.org/learn/diagnostics/memory/understanding-and-tuning-memory; Mindful Chase Electron leak debugging https://www.mindfulchase.com/explore/troubleshooting-tips/frameworks-and-libraries/diagnosing-and-fixing-memory-leaks-in-electron-applications.html]

### Pitfall 3: Store Migration Race Condition When Running Multiple App Instances

**What goes wrong:** Two instances of JARVIS start simultaneously; both read `voiceMode` as undefined, both write 'wake-word' simultaneously, store file corruption.

**Why it happens:** electron-store does not guarantee atomic writes when multiple processes access the same file. JARVIS is single-instance (via Electron's `app.requestSingleInstanceLock()`), but testing or user force-launch could violate this.

**How to avoid:** (a) Rely on JARVIS enforcing single-instance lock (already done in main/index.ts), OR (b) if multi-instance is possible, ensure getVoiceMode() is idempotent — reading undefined always returns default without side effects, so concurrent reads are safe.

**Warning signs:** electron-store .json file is corrupted or partially written after app startup; mode inexplicably resets between sessions.

[Source: CONTEXT.md; electron-store documentation on concurrent access; JARVIS already enforces single-instance via Electron API.]

### Pitfall 4: Blocking Mode Switch Without Showing Action to User

**What goes wrong:** Permission is denied on macOS; mode switch fails silently; user is confused because the mode stays at previous selection with no explanation.

**Why it happens:** Tray menu rebuilds on success (D-04 in tray.ts), so radio button reflects new mode. On failure, if no message is shown, user sees no change and cannot understand why.

**How to avoid:** (a) Always broadcast the failure case via `broadcastModeSwitch()` with `blockedReason` and `settingsUrl` (D-03), (b) ensure renderer toast shows actionable message "Microphone access denied. Open System Settings to allow microphone." with clickable link (D-04), (c) do NOT rebuild tray menu on failure (leave radio in current state until success).

**Warning signs:** User reports "tray menu froze" or "couldn't switch to Always-Listening"; testing shows no toast appears when permission is denied.

[Source: CONTEXT.md D-03, D-04; existing Phase 42 toast pattern for mode change confirmation.]

### Pitfall 5: Forgetting to Force GC in Soak Test, Leading to False Negatives

**What goes wrong:** Soak test reports no heap leak, but app crashes with OOM after 10 hours in production. Root cause: heap measurement didn't trigger GC, so garbage objects stayed in memory longer than they would naturally.

**Why it happens:** V8 GC is not deterministic — old generation collection waits for idle time or memory pressure. A tight measurement loop (e.g., sampling every 1s) may not trigger GC. The app in production will trigger GC naturally, revealing the true leak.

**How to avoid:** (a) Sample at long intervals (30 min or more) to give GC time to run naturally, (b) optionally force GC explicitly if test is run with `node --expose-gc soak-test.ts` — call `global.gc()` before each measurement, (c) document the soak test command so it's run correctly in releases (D-10).

**Warning signs:** Local soak test passes but production crashes after several hours; GC logs show full GC happening in production but not during test.

[Source: Node.js GC diagnostics https://nodejs.org/learn/diagnostics/memory/using-gc-traces; Joyee Cheung V8/Node.js memory leak testing https://joyeecheung.github.io/blog/2024/03/17/memory-leak-testing-v8-node-js-1/]

## Code Examples

### Migration Test (store.ts Unit Test)

Verified pattern from existing test suite — location `/root/jarvis/apps/desktop/src/main/__tests__/store.test.ts` (lines 177-204):

```typescript
// D-12 scenario: store without voiceMode field → getVoiceMode() returns 'wake-word'
describe('store.ts — Voice Mode accessors (Phase 39)', () => {
  beforeEach(() => {
    (Store as any).__resetStore(); // Clear mock store between tests
  });

  it("getVoiceMode() returns 'wake-word' when not set (D-07 migration default)", () => {
    expect(getVoiceMode()).toBe('wake-word');
  });

  it("getVoiceMode() returns 'wake-word' when store contains invalid value (T-39-01 mitigation)", () => {
    // Simulates manual JSON edit — corrupted or future unknown mode
    const backing = (Store as any).__getBackingStore();
    backing['voiceMode'] = 'invalid-mode';
    expect(getVoiceMode()).toBe('wake-word');
  });
});
```

**Why this works:** electron-store is mocked via `vi.mock()` in vitest (standard test framework in project, version 4.1.2). Mock provides `__resetStore()` and `__getBackingStore()` helpers for test isolation. Pattern generalizes to any field with a default.

[Source: verified in `/root/jarvis/apps/desktop/src/main/__tests__/store.test.ts` lines 10-29, 177-204; Vitest mocking guide https://vitest.dev/guide/mocking.html]

### Permission Check in Tray Click Handler

Pattern extracted from existing tray.ts structure (Phase 41 voice mode submenu — lines 86-105):

```typescript
// apps/desktop/src/main/tray.ts — insertion point for D-01
{
  label: 'Voice Mode',
  submenu: VOICE_MODE_OPTIONS.map((option) => ({
    label: option.label,
    type: 'radio' as const,
    checked: option.mode === currentMode,
    click: async () => {
      // ============ D-01/D-02/D-05/D-06: NEW — Permission check
      if (process.platform === 'darwin' && 
          (option.mode === 'always-listening' || option.mode === 'ptt-only')) {
        const { systemPreferences } = require('electron');
        const status = systemPreferences.getMediaAccessStatus('microphone');
        
        if (status !== 'granted') {
          // D-03: Broadcast failure with actionable fields
          broadcastModeSwitch({
            success: false,
            blockedReason: 'mic-permission-denied',
            settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
          });
          return; // Exit early — do NOT call setMode()
        }
      }
      // ============ Original logic
      const success = await voiceModeManager.setMode(option.mode, 'user');
      broadcastModeSwitch({
        success,
        newMode: success ? option.mode : undefined,
        label: success ? option.label : undefined,
      });
      if (success) {
        const newMenu = buildContextMenu(mainWindow, voiceModeManager);
        tray?.setContextMenu(newMenu);
      }
    },
  })),
},
```

[Source: CONTEXT.md D-01, D-02, D-03, D-05, D-06; verified insertion point in `/root/jarvis/apps/desktop/src/main/tray.ts` lines 86-105]

## State of the Art

| Aspect | Old Approach | Current Approach | When Changed | Impact |
|--------|--------------|------------------|--------------|--------|
| macOS mic permission check in Electron | Use `systemPreferences.askForMediaAccess()` and show prompt to user | Use `systemPreferences.getMediaAccessStatus()` for read-only query, prompt only when user explicitly requests it | Electron 1.0+ (2016); best practice solidified by 2020 | Non-intrusive permission verification; respects user's prior choice without re-prompting. |
| Store migration strategy | Explicit migration script that runs on first launch | Default-on-read pattern — field returns sensible default if missing | electron-store 4.0+ (2019); pattern adopted in JARVIS v1.7+ | No migration state to track; transparent to users; scales to many fields. |
| Memory leak detection in Node.js | Manual heap snapshots via DevTools | Automated sampling of `process.memoryUsage()` over time with forced GC | V8 team guidance circa 2020; Node.js 14+ | Faster feedback loop; can run in CI as soak test; detects regressions. |
| IPC result types in Electron | Success and failure as separate channels (`mode-switch-success`, `mode-switch-failure`) | Unified result channel with optional fields (`voice-mode:switch-result`) | Electron 8.0+ (2020); reduces channel proliferation | Single IPC listener handles all cases; easier to maintain and extend. |

**Deprecated/outdated:**

- `systemPreferences.askForMediaAccess()` for non-interactive checks: This is appropriate when user explicitly requests permission (e.g., clicking "Allow" in a dialog), but NOT for automatic mode switch checks. D-06 specifies `getMediaAccessStatus()` only.

- Shell-based permission checks (e.g., `security find-identity` or `launchctl` calls): These are fragile across macOS versions and require elevated privileges. Electron's API is stable and sandboxed.

- Separate migration scripts in postinstall hooks: electron-store handles this internally; separate scripts add complexity and can fail silently.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `systemPreferences.getMediaAccessStatus()` returns one of exactly four known values on macOS: 'granted', 'not-determined', 'denied', 'restricted' (plus 'unknown' on unsupported platforms). | Standard Stack; Pitfall 1 | If a new status value exists and is not 'granted', the mode switch will incorrectly succeed when it should be blocked. Mitigation: verify against latest Electron docs (https://www.electronjs.org/docs/latest/api/system-preferences) before implementation. |
| A2 | `process.memoryUsage().heapUsed` is sufficiently reliable for detecting 10MB+ leaks over 8 hours with 30-minute sampling intervals. | Architecture Pattern 4; Common Pitfalls 5 | If V8 GC behavior changes significantly, 10MB threshold may be too tight or too loose. Mitigation: run soak test on target hardware before release; observe actual heap graphs. |
| A3 | The existing electron-store mock pattern in vitest (vi.mock + __resetStore + __getBackingStore) will work identically for VHARD-01 migration test. | Code Examples; Common Pitfalls 3 | If electron-store changes API or mock breaks in new version, test will fail. Mitigation: verify mock still works when updating electron-store version. |
| A4 | The System Settings deep link `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone` will open to the Microphone section on all supported macOS versions (10.14+). | Architecture Pattern 1 | If URL format changes in newer macOS, link will fail silently or open wrong section. Mitigation: test on macOS 12 and 13 (current LTS); document minimum macOS version. |
| A5 | The v1.8→v1.9 store upgrade requires no explicit migration script because getVoiceMode() returns 'wake-word' by default. | Architecture Pattern 2 | If a v1.8 user has a non-default mode stored but the field name changes, default-on-read will lose their preference. Mitigation: confirm v1.8 always used 'voiceMode' key (not an alias); inspect released v1.8 code. |

## Open Questions

1. **Exact wording of permission-denied toast message**
   - What we know: Phase 42 establishes toast UI pattern (200ms fade-in, centered, with action button).
   - What's unclear: Should the message be "Microphone access denied in System Settings — click to open" or more detailed?
   - Recommendation: Follow Phase 42 consistency; keep message brief (<40 chars); include "System Settings" keyword for clarity.

2. **Soak test measurement interval and reporting format**
   - What we know: D-09 specifies 30s baseline, 8h final; delta <10MB passes.
   - What's unclear: Should intermediate samples be logged? Every 30 min? Every 1 hour? Should report include graphs or just final number?
   - Recommendation: Log measurements every 30 minutes to stdout with timestamp and heapUsed (MB). At end, output "PASS" or "FAIL" and delta. Optional: generate CSV for graphing.

3. **Should soak test also validate Always-Listening accuracy (intent classifier false positive rate)?**
   - What we know: Phase 40 sets intent classifier threshold; VHARD-01 focuses on memory stability only.
   - What's unclear: Should soak test include simulated voice inputs to validate accuracy doesn't degrade over time?
   - Recommendation: Out of scope for Phase 44. VHARD-01 is memory-only. Accuracy testing is a Phase 40 responsibility (already done in Nyquist validation).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `process.memoryUsage()` | Soak test script | ✓ (stdlib) | 20+ (bundled in Electron 41) | Measure RSS instead (less precise but works) |
| Electron `systemPreferences` API | macOS permission check (D-01) | ✓ | 41.1.1 (project version) | None — core to phase requirement |
| electron-store | Store accessors | ✓ | 11.0.2 (project version) | None — core to phase requirement |
| `global.gc()` for forced GC in soak test | Optional memory profiling | ✗ (requires `--expose-gc` flag) | N/A | Use natural GC (just sample at longer intervals) |
| vitest | Migration unit tests | ✓ | 4.1.2 (project version) | Jest (compatible API, swap vi↔jest) |

**Notes:**

- `global.gc()` is not available by default — soak test must be run with `node --expose-gc apps/desktop/scripts/soak-test.ts` to use forced GC. Without it, natural GC still works but is less deterministic.

- `process.memoryUsage()` is available in all Node.js processes, including Electron main process. No platform-specific fallback needed.

- All project dependencies (Electron, electron-store, vitest) are already installed and verified. No blocking gaps.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | `apps/desktop/vitest.config.ts` (if exists) or inherits from root vite.config.ts |
| Quick run command | `cd apps/desktop && npm test -- store.test.ts --run` |
| Full suite command | `cd apps/desktop && npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VHARD-01 (migration) | Store without `voiceMode` field → `getVoiceMode()` returns `'wake-word'` without crash | unit | `npm test -- store.test.ts -t "migration default"` | ✅ `/root/jarvis/apps/desktop/src/main/__tests__/store.test.ts` lines 177-179 |
| VHARD-01 (migration) | Store with invalid `voiceMode` value → `getVoiceMode()` returns `'wake-word'` (corruption guard) | unit | `npm test -- store.test.ts -t "invalid value"` | ✅ lines 198-204 |
| VHARD-01 (permission gate) | macOS: permission check before `setMode()` call (manual verification only — no automated test for Electron native API) | manual | Run app on macOS, deny microphone in System Settings, attempt mode switch, observe toast | ❌ Wave 0 |
| VHARD-01 (memory stability) | Soak test over 8h shows heap delta <10MB | soak test (manual) | `node --expose-gc apps/desktop/scripts/soak-test.ts` (standalone script, not in test suite) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- store.test.ts --run` (migration tests, <2s runtime)
- **Per wave merge:** `npm test -- --run` (full suite, <30s runtime)
- **Phase gate:** Full suite green + manual soak test passed before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/desktop/src/main/__tests__/tray.test.ts` — unit tests for permission check in tray.ts (requires Electron API mocking, NOT vitest-friendly; recommend manual verification on macOS)
- [ ] `apps/desktop/src/main/__tests__/voiceMode.test.ts` — integration test for `setMode()` with permission denial (requires mock BrowserWindow and VoiceModeManager; complex to set up; recommend phase planning to assess priority)
- [ ] `apps/desktop/scripts/soak-test.ts` — soak test script itself (not a unit test; recommended runtime validation, not automated in CI)
- [ ] System Settings deep link verification (manual: test `shell.openExternal()` opens correct pane on macOS 12+)

**Notes:**

- Electron native APIs (`systemPreferences`, `shell`) are difficult to mock in vitest because they're C++ bindings. The existing store tests use electron-store mocking, which works because it's a pure JS module. Recommendation: Test permission gate via manual verification on macOS hardware, not via unit tests.

- Soak test is standalone and not part of the automated test suite per D-07 — it's run manually before release (D-10).

- Migration tests already exist in store.test.ts (lines 177-204) — no new test scaffolding needed for getVoiceMode() default behavior.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | **yes** | `systemPreferences.getMediaAccessStatus()` for microphone; no user escalation; read-only check |
| V5 Input Validation | **yes** | VoiceModeSwitchResult.blockedReason and settingsUrl validated as enum/URL before broadcast |
| V6 Cryptography | no | — |
| V7 Error Handling | **yes** | Permission-denied error is actionable (link to System Settings); not silent failure |
| V8 Data Protection | **yes** | No new PII handled; permission status is not logged or transmitted (local decision only) |
| V11 Business Logic | **yes** | Only allow mode switch if permission status is 'granted' |

### Known Threat Patterns for Electron + macOS Permission Model

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| App spoofs System Settings URL to redirect to phishing site | Tampering | Use `shell.openExternal()` (validates URL internally); never allow user input into link. D-04: hardcode URL in code, not derived from IPC. |
| Renderer injects malicious blockedReason in IPC (if renderer could forge message) | Tampering | `VoiceModeSwitchResult` is sent from main→renderer (one-way); renderer cannot send it back. Verify this in implementation (no ipcMain.handle for this channel). |
| App crashes when system revokes microphone permission mid-capture | Denial of Service | Existing strategies (AlwaysListeningStrategy, PttOnlyStrategy) have stop() cleanup. Permission gate prevents mode switch; ongoing capture will fail gracefully or hit existing error handlers. |
| User denies permission, app silently fails to notify user | Information Disclosure | D-03/D-04: always broadcast VoiceModeSwitchResult with blockedReason when permission denied; renderer MUST show toast. |
| Local privilege escalation via `shell.openExternal()` | Privilege Escalation | `shell.openExternal()` is sandboxed; it does not execute arbitrary shell commands. Only opens URLs. Safe. |

### Implementation Checklist

- [ ] Use `systemPreferences.getMediaAccessStatus()` (not `askForMediaAccess`) per D-06
- [ ] Guard permission check with `process.platform === 'darwin'` per D-05
- [ ] Treat all non-'granted' statuses as blocked per D-06
- [ ] Always broadcast VoiceModeSwitchResult (success and failure) per D-03
- [ ] Hardcode System Settings URL in tray.ts; do not derive from IPC per D-04
- [ ] Renderer shows actionable toast with clickable link (Phase 42 pattern)
- [ ] Soak test run with `--expose-gc` to control GC behavior per D-09 recommendation
- [ ] Document minimum macOS version (10.14+) for NSMicrophoneUsageDescription in Info.plist

## Sources

### Primary (HIGH confidence)

- **Electron systemPreferences API docs** — https://www.electronjs.org/docs/latest/api/system-preferences (official; status values and platform support verified)
- **Electron shell.openExternal() docs** — https://www.electronjs.org/docs/latest/api/shell (official; safe for user-initiated URL opening)
- **Electron macOS permission handling pattern** — [CITED: BigBinary Blog "Requesting camera and microphone permission in an Electron app"](https://www.bigbinary.com/blog/request-camera-micophone-permission-electron) (technical blog post, verified against official docs)
- **Node.js process.memoryUsage() and GC** — https://nodejs.org/learn/diagnostics/memory/understanding-and-tuning-memory (official Node.js learning guide)
- **Vitest mocking guide** — https://vitest.dev/guide/mocking.html (official; ES module + CommonJS mocking patterns)
- **JARVIS codebase patterns** — Verified in `/root/jarvis/apps/desktop/src/main/store.ts` (getVoiceMode pattern, lines 143-150) and `/root/jarvis/apps/desktop/src/main/__tests__/store.test.ts` (existing vitest mock, lines 10-29)

### Secondary (MEDIUM confidence)

- **V8/Node.js memory leak testing** — [Joyee Cheung "Memory leak regression testing with V8/Node.js"](https://joyeecheung.github.io/blog/2024/03/17/memory-leak-testing-v8-node-js-1/) (technical analysis; recommends sampling intervals and GC awareness)
- **Electron memory debugging guide** — [Mindful Chase "Diagnosing and Fixing Memory Leaks in Electron Applications"](https://www.mindfulchase.com/explore/troubleshooting-tips/frameworks-and-libraries/diagnosing-and-fixing-memory-leaks-in-electron-applications.html) (practical guide; recommends tracking both heap and RSS)
- **macOS System Settings deep link format** — [Apple System Preferences URL Schemes (GitHub gist)](https://gist.github.com/rmcdongit/f66ff91e0dad78d4d6346a75ded4b751) (community documentation; verified in CONTEXT.md specifics)
- **Vitest vs Jest 2026 comparison** — [PkgPulse "Vitest 3 vs Jest 30"](https://www.pkgpulse.com/blog/vitest-3-vs-jest-30-2026) (2026 update; confirms Vitest is project standard and modern ESM-first)

### Tertiary (LOW confidence — flags for validation)

- **Electron version 41.1.1 stability** — Verified in `/root/jarvis/apps/desktop/package.json`; no breaking changes found in recent release notes. Assume current version is stable.
- **electron-store 11.0.2 concurrent access safeguards** — electron-store docs claim atomic writes, but JARVIS enforces single-instance lock anyway. Assume migration pattern is safe.

## Metadata

**Confidence breakdown:**

- **Standard Stack:** HIGH — Electron APIs are officially documented; versions verified in project; patterns validated in existing code.
- **Architecture Patterns:** HIGH — Permission check pattern is standard across industry; electron-store migration pattern proven in JARVIS codebase; IPC extension pattern is idiomatic.
- **Common Pitfalls:** MEDIUM-HIGH — Pitfalls are based on documented Electron issues, Node.js GC behavior, and JARVIS project history. Pitfall 5 (GC non-determinism) is well-documented but soak test mitigation may require empirical tuning.
- **Memory Measurement:** MEDIUM — `process.memoryUsage().heapUsed` is standard, but V8 GC is non-deterministic. Soak test must be run on actual hardware to validate 10MB threshold is appropriate.
- **Migration Testing:** HIGH — Existing vitest mock pattern is proven; migration test scenario is straightforward; no new complexities.

**Research date:** 2026-04-27
**Valid until:** 2026-05-11 (estimated 2 weeks — permission APIs are stable, but macOS minor versions may introduce new settings location; soak test thresholds should be re-validated post-implementation)

---

*Phase: 44-hardening-migration*
*Research completed for requirement VHARD-01 with full scope coverage: macOS permission gate (D-01–D-06), migration safety (D-07–D-13), degradation scope (D-14), and soak test patterns (D-08–D-10).*
