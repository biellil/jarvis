# Phase 42: Orb Visual Per-Mode — Research

**Researched:** 2026-04-28
**Domain:** Electron renderer / React / inline-style animation — visual state extension to an existing orb component
**Confidence:** HIGH

---

## Summary

Phase 42 is a pure **renderer-side UI extension** with zero new IPC channels, zero new components, and zero new dependencies. All required infrastructure is already in the codebase: the IPC channels (`voiceMode:change`, `voice-mode:switch-result`, `voiceMode:get`) are live, the `VoiceModeSwitchResult` payload already carries a `label` field (D-07 in ipc-types.ts), and the existing `Toast` + crossfade mechanism in Orb.tsx handle everything the requirements ask for.

The work decomposes into three precise in-place edits: (1) extend `OrbContext` to hold and subscribe to `voiceMode`, (2) extend `Orb.tsx` to consume `voiceMode` for idle gradient/glow selection and to render Layer 6 (the mode badge), and (3) extend `App.tsx` to handle the `success: true` branch of `voice-mode:switch-result` and update the `autoCloseMs` ternary. Existing test files for `Orb.test.tsx` and `OrbContext.test.tsx` need new test cases to cover the new behavior.

**Primary recommendation:** Follow the UI-SPEC exactly — it is authoritative and complete. All hex values, position offsets, transition durations, and IPC patterns are specified. No design decisions remain for the implementer.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VUI-02 | Orb shows distinct visual state per mode (colors/animations for Wake Word, Always-Listening, PTT-only) — user identifies active mode without opening menu | Existing `stateGradients`/`stateGlow` Records in Orb.tsx accept per-mode values at idle state; existing 400ms crossfade mechanism reused |
| VUI-03 | Toast confirmation on mode switch + persistent badge on orb showing active mode ("WW", "AL", "PTT") | Existing `Toast` component + `setToast` from `ChatContext`; badge is a new Layer 6 div inside orb bounds; IPC channel `voice-mode:switch-result` already broadcasts label |
</phase_requirements>

---

## Standard Stack

### Core (all already in project — zero new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | Component rendering | Project standard; OrbContext/Orb are React components |
| TypeScript | Project standard | Type safety | `VoiceMode` union already in `ipc-types.ts` |
| Electron contextBridge | Runtime | IPC bridge | `window.jarvis.voiceMode` already exposed via preload |
| Vitest + @testing-library/react | Project standard | Unit tests | Used in all existing Orb tests |

**Installation:** None required — all dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure (no new files except tests)

```
apps/desktop/src/renderer/
├── components/Orb/
│   ├── OrbContext.tsx          ← extend: add voiceMode + setVoiceMode
│   ├── Orb.tsx                 ← extend: mode idle gradients + Layer 6 badge
│   └── __tests__/
│       ├── OrbContext.test.tsx ← extend: voiceMode init + subscription tests
│       └── Orb.test.tsx        ← extend: per-mode gradient + badge tests
└── src/
    └── App.tsx                 ← extend: success branch in switch-result handler
```

### Pattern 1: OrbContext voiceMode Extension

**What:** Add `voiceMode: VoiceMode` and `setVoiceMode` to the existing `OrbContextValue` interface. Initialize with `'wake-word'` default. Subscribe to `window.jarvis.voiceMode.getMode()` + `window.jarvis.voiceMode.onChange()` in a `useEffect` inside `OrbProvider`.

**When to use:** Colocation pattern — all orb visual state lives in one context. App.tsx already has its own `voiceMode` subscription for gating `WakeWordFeatures`; that subscription remains independent (different concern).

**Example (from 42-UI-SPEC.md):**
```typescript
// OrbContextValue addition
voiceMode: VoiceMode;
setVoiceMode: (mode: VoiceMode) => void;

// OrbProvider state
const [voiceMode, setVoiceMode] = useState<VoiceMode>('wake-word');

// OrbProvider useEffect on mount
useEffect(() => {
  void window.jarvis.voiceMode?.getMode().then((m) => {
    if (m) setVoiceMode(m);
  });
  const unsub = window.jarvis.voiceMode?.onChange((evt) => {
    setVoiceMode(evt.newMode);
  });
  return () => { unsub?.(); };
}, []);
```

### Pattern 2: Per-Mode Idle Gradient Selection in Orb.tsx

**What:** The existing `stateGradients` Record is keyed by `OrbState`. For the `'idle'` state, a secondary lookup by `voiceMode` determines the actual gradient and glow. Non-idle states are completely unchanged.

**When to use:** Only when `state === 'idle'`. The crossfade mechanism (`displayedGradients` state, sublayers A/B) is reused as-is — when `voiceMode` changes while idle, trigger the same crossfade that normally runs on state change.

**Key implementation detail:** `prevStateRef` currently tracks `OrbState`. For voiceMode crossfade, a separate `prevVoiceModeRef` is needed OR the effect dependency is expanded. The clean approach: add a second `useEffect` watching `[state, voiceMode]` that recomputes `from`/`to` gradients considering both axes.

**Gradient lookup (from 42-UI-SPEC.md):**
```typescript
const modeIdleGradients: Record<VoiceMode, string> = {
  'wake-word': `radial-gradient(circle at 33% 30%, #7BE8F5 0%, #2BA8D4 20%, #1560A8 45%, #2D1F7A 72%, #12103A 100%)`,
  'always-listening': `radial-gradient(circle at 33% 30%, #86EFAC 0%, #22C55E 20%, #15803D 45%, #14532D 72%, #052E16 100%)`,
  'ptt-only': `radial-gradient(circle at 33% 30%, #FED7AA 0%, #F97316 20%, #C2410C 45%, #7C2D12 72%, #2C0E06 100%)`,
};

const modeIdleGlow: Record<VoiceMode, string> = {
  'wake-word': 'rgba(43,168,212,0.55)',
  'always-listening': 'rgba(34,197,94,0.55)',
  'ptt-only': 'rgba(249,115,22,0.55)',
};
```

### Pattern 3: Layer 6 Mode Badge

**What:** A new `<div>` rendered as Layer 6 inside the existing 128×128 orb container (after Layer 5 — wake burst ring). Positioned `bottom: 14px`, `left: 50%`, `transform: translateX(-50%)`. `pointerEvents: 'none'` so drag-to-reposition passes through.

**Badge label and color maps (from 42-UI-SPEC.md):**
```typescript
const modeBadgeLabel: Record<VoiceMode, string> = {
  'wake-word':        'WW',
  'always-listening': 'AL',
  'ptt-only':         'PTT',
};

const modeIdleBadgeText: Record<VoiceMode, string> = {
  'wake-word':        '#7BE8F5',
  'always-listening': '#86EFAC',
  'ptt-only':         '#FED7AA',
};

const modeIdleBadgeBorder: Record<VoiceMode, string> = {
  'wake-word':        'rgba(123,232,245,0.35)',
  'always-listening': 'rgba(134,239,172,0.35)',
  'ptt-only':         'rgba(254,215,170,0.35)',
};
```

**Visibility:** Badge is ALWAYS visible regardless of orb state. Color is always the mode's idle palette — does not change per OrbState.

### Pattern 4: App.tsx `voice-mode:switch-result` Success Branch

**What:** The existing handler in `App.tsx` only handles `success: false`. Phase 42 adds the `success: true` branch:

```typescript
// Existing handler — extend this, do not replace
const handleSwitchResult = (_event: unknown, result: VoiceModeSwitchResult) => {
  if (result.success && result.label) {
    setToast({ message: `Modo: ${result.label}`, variant: 'info' });
    // autoCloseMs handled in JSX ternary
  } else if (!result.success && result.blockedReason === 'mic-permission-denied') {
    // existing warning toast — unchanged
  }
};
```

**autoCloseMs ternary change (App.tsx JSX):**
```jsx
// Current: autoCloseMs={toast.action ? 0 : undefined}
// Phase 42: autoCloseMs={toast.action ? 0 : 2000}
```

**Why 2000ms:** Mode confirmation is a low-signal notification (user initiated the action). 2s is enough to read, clears quickly. Action toasts (permission denied) use 0 (manual dismiss) — the ternary preserves this.

### Anti-Patterns to Avoid

- **Removing App.tsx voiceMode subscription:** App.tsx has its own `voiceMode` state for gating `WakeWordFeatures`. This is a DIFFERENT concern from OrbContext's subscription. Both subscriptions must coexist — `window.jarvis.voiceMode.onChange` supports multiple listeners.
- **Using synchronous IPC for no-flash:** Electron contextBridge does not support synchronous invoke. The async `getMode()` with `'wake-word'` as safe default is the correct approach.
- **Changing badge color based on OrbState:** Badge color is mode-only, not state-based. The badge provides stable mode identification even while the orb is in listening/processing/responding states.
- **Overflowing the 128px orb bounds:** Badge must stay inside the 128×128 `SIZE` div. `bottom: 14px` places it inside the visible glass body.
- **Adding new IPC channels:** Zero new channels. `voiceMode:change`, `voice-mode:switch-result`, and `voiceMode:get` already exist in `IPC_CHANNELS`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gradient crossfade | Custom animation | Existing `displayedGradients` state + A/B sublayers | Already handles 400ms crossfade with timer cleanup |
| Toast display | New toast component | Existing `Toast.tsx` + `setToast` from `ChatContext` | Already has variant system, autoClose, action button |
| VoiceMode subscription | New IPC listener | `window.jarvis.voiceMode.onChange()` + preload | Already bridged in `bridgeVoiceModeChangeToRenderer` |
| Mode persistence | New store read | `window.jarvis.voiceMode.getMode()` | Already registered as `ipcMain.handle('voiceMode:get')` |

**Key insight:** This phase has zero infrastructure work. Every primitive needed (crossfade, toast, IPC subscription, VoiceMode type) is already implemented and tested.

---

## Common Pitfalls

### Pitfall 1: Crossfade trigger mismatch — voiceMode change while idle not animating

**What goes wrong:** The existing crossfade `useEffect` in Orb.tsx watches `[state]`. A `voiceMode` change while `state === 'idle'` never triggers it — the gradient silently snaps without animation.

**Why it happens:** The dependency array was designed before voiceMode existed as a concept.

**How to avoid:** Add a second `useEffect` (or expand the existing one) that depends on both `state` and `voiceMode`. Compute the idle gradient from both axes: `state === 'idle' ? modeIdleGradients[voiceMode] : stateGradients[state]`. When voiceMode changes at idle, set `displayedGradients({ from: prevIdleGrad, to: newIdleGrad, transitioning: true })`.

**Warning signs:** Badge color transitions in CSS (400ms) but gradient doesn't crossfade — they look desynchronized.

### Pitfall 2: Duplicate voiceMode subscriptions causing double-render

**What goes wrong:** App.tsx already subscribes to `window.jarvis.voiceMode.onChange`. Adding another in OrbProvider creates two simultaneous subscriptions — each fires independently, causing two sequential React re-renders on every mode change.

**Why it happens:** Developer assumes "someone already reads voiceMode so I should check before adding."

**How to avoid:** This is intentional and correct — two subscriptions are fine (each serves a different purpose). React batches `setState` calls within the same event loop tick. The double-render is harmless and not perceptible.

### Pitfall 3: Test mock missing `voiceMode` field — all Orb tests fail

**What goes wrong:** `Orb.test.tsx` uses a `mockContext` helper that returns a hardcoded `OrbContextValue`. After adding `voiceMode`/`setVoiceMode` to `OrbContextValue`, TypeScript throws a type error on the mock object because the new fields are missing.

**Why it happens:** The `mockContext` helper is typed as `Partial<OrbCtx>` with defaults — but the base defaults object needs to include the new fields.

**How to avoid:** Add `voiceMode: 'wake-word' as VoiceMode, setVoiceMode: vi.fn()` to the `mockContext` default object in `Orb.test.tsx`. Same pattern for `OrbContext.test.tsx`.

### Pitfall 4: `window.jarvis.voiceMode` undefined in tests — OrbContext.test.tsx crashes

**What goes wrong:** `OrbProvider` now calls `window.jarvis.voiceMode?.getMode()` on mount. In happy-dom test environment, `window.jarvis` is not defined — this crashes or returns undefined, and the `?.` guard may still throw if `window.jarvis` itself is undefined.

**Why it happens:** The test setup file (`setup.ts`) only imports `@testing-library/jest-dom/vitest` — it does not mock `window.jarvis`.

**How to avoid:** Mock `window.jarvis.voiceMode` in `OrbContext.test.tsx` using `vi.stubGlobal` or a `beforeEach` setup:
```typescript
beforeEach(() => {
  vi.stubGlobal('jarvis', {
    voiceMode: {
      getMode: vi.fn().mockResolvedValue('wake-word'),
      onChange: vi.fn().mockReturnValue(() => {}),
    },
  });
});
```

### Pitfall 5: `autoCloseMs` ternary regression — permission toast now auto-closes

**What goes wrong:** Changing `autoCloseMs={toast.action ? 0 : undefined}` to `autoCloseMs={toast.action ? 0 : 2000}` is correct for mode-switch toasts. But existing tests for Phase 44 permission toast that expect `autoCloseMs=0` (action present) must still pass.

**Why it happens:** The ternary condition checks `toast.action` presence — action toasts always get `0` (no auto-close). The change from `undefined` to `2000` only affects the no-action path. No regression.

**Warning signs:** If a test checks `autoCloseMs === undefined` on a mode-switch toast — that test needs to be updated to expect `2000`.

---

## Code Examples

### OrbContext: voiceMode init pattern (from 42-UI-SPEC.md)

```typescript
// Source: 42-UI-SPEC.md — OrbContext Extension
const [voiceMode, setVoiceMode] = useState<VoiceMode>('wake-word');

useEffect(() => {
  void window.jarvis.voiceMode?.getMode().then((m) => {
    if (m) setVoiceMode(m);
  });
  const unsub = window.jarvis.voiceMode?.onChange((evt) => {
    setVoiceMode(evt.newMode);
  });
  return () => { unsub?.(); };
}, []);
```

### Orb.tsx: active idle gradient computation

```typescript
// Source: derived from 42-UI-SPEC.md color table
const activeIdleGradient = state === 'idle'
  ? modeIdleGradients[voiceMode]
  : stateGradients[state];

const activeIdleGlow = state === 'idle'
  ? modeIdleGlow[voiceMode]
  : stateGlow[state];
```

### App.tsx: extended switch-result handler

```typescript
// Source: 42-UI-SPEC.md — Component: Mode-Switch Confirmation Toast
const handleSwitchResult = (_event: unknown, result: VoiceModeSwitchResult) => {
  if (result.success && result.label) {
    setToast({ message: `Modo: ${result.label}`, variant: 'info' });
  } else if (!result.success && result.blockedReason === 'mic-permission-denied') {
    setToast({
      message: 'Microfone negado — abrir configurações?',
      variant: 'warning',
      action: {
        label: 'Abrir System Settings',
        onClick: () => window.jarvis.openSystemSettings?.(),
      },
    });
  }
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OrbContext had 3 fields (state, wakeWordPaused, burstActive) | Phase 42 adds voiceMode as 4th visual concern | Phase 42 | Context shape grows — all consumers (Orb.tsx) need updating |
| Orb idle is always blue | Orb idle is mode-colored (blue/green/orange) | Phase 42 | Wake-word users see no change; AL/PTT users get green/orange |
| App.tsx switch-result handler only handles failure | Phase 42 adds success branch | Phase 42 | Mode changes now show a confirmation toast |

**No deprecations in this phase.**

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely renderer code changes with no external tool, service, or CLI dependencies beyond the project's existing Electron + Node + Vitest stack. All runtime dependencies are already installed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `apps/desktop/vitest.config.ts` |
| Quick run command | `cd apps/desktop && npx vitest run src/renderer/components/Orb` |
| Full suite command | `cd apps/desktop && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| VUI-02 | Orb renders green gradient when voiceMode='always-listening' and state='idle' | unit | `npx vitest run src/renderer/components/Orb/__tests__/Orb.test.tsx` | ✅ (needs new tests) |
| VUI-02 | Orb renders orange gradient when voiceMode='ptt-only' and state='idle' | unit | `npx vitest run src/renderer/components/Orb/__tests__/Orb.test.tsx` | ✅ (needs new tests) |
| VUI-02 | Non-idle states use existing gradients regardless of voiceMode | unit | `npx vitest run src/renderer/components/Orb/__tests__/Orb.test.tsx` | ✅ (needs new tests) |
| VUI-03 | Layer 6 badge renders with correct label ("WW"/"AL"/"PTT") | unit | `npx vitest run src/renderer/components/Orb/__tests__/Orb.test.tsx` | ✅ (needs new tests) |
| VUI-03 | Badge is always visible (all OrbStates) | unit | `npx vitest run src/renderer/components/Orb/__tests__/Orb.test.tsx` | ✅ (needs new tests) |
| VUI-02 | OrbContext initializes voiceMode='wake-word' as default | unit | `npx vitest run src/renderer/components/Orb/__tests__/OrbContext.test.tsx` | ✅ (needs new tests) |
| VUI-02 | OrbContext calls getMode() on mount and updates voiceMode | unit | `npx vitest run src/renderer/components/Orb/__tests__/OrbContext.test.tsx` | ✅ (needs new tests) |
| VUI-02 | OrbContext subscribes to onChange and updates on mode change | unit | `npx vitest run src/renderer/components/Orb/__tests__/OrbContext.test.tsx` | ✅ (needs new tests) |
| VUI-03 | App.tsx fires setToast on success switch result | unit | `npx vitest run src/renderer/src/App.tsx` (via App test or manual-only) | ❌ Wave 0 gap |

### Sampling Rate

- **Per task commit:** `cd apps/desktop && npx vitest run src/renderer/components/Orb`
- **Per wave merge:** `cd apps/desktop && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] New test cases in `Orb.test.tsx` — covers VUI-02 (per-mode idle gradient) and VUI-03 (badge label/color/visibility)
- [ ] New test cases in `OrbContext.test.tsx` — covers voiceMode default, getMode() call, onChange subscription and cleanup
- [ ] Mock `window.jarvis.voiceMode` in test setup for OrbContext tests — `getMode` (resolves `VoiceMode`) + `onChange` (returns unsub fn)

*(Note: `App.tsx` toast success branch is integration-level behavior; covered by visual inspection during dev and manual testing via tray click. Unit-testing it would require mounting the full App tree with mocked IPC — acceptable to mark as manual-only for this phase.)*

---

## Sources

### Primary (HIGH confidence)

- `apps/desktop/src/renderer/components/Orb/Orb.tsx` — current crossfade mechanism, stateGradients, stateGlow, layer numbering, SIZE=128
- `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` — existing context shape, OrbProvider useState pattern, useEffect cleanup
- `apps/desktop/src/renderer/src/App.tsx` — existing `voice-mode:switch-result` handler, `voiceMode` subscription, toast wiring
- `apps/desktop/src/renderer/src/components/Toast.tsx` — `ToastVariant`, `VARIANT_BG`, `autoCloseMs` prop, `role="alert"`
- `apps/desktop/src/renderer/src/chat/ChatContext.tsx` — `ToastState` interface, `setToast` pattern
- `apps/desktop/src/shared/ipc-types.ts` — `VoiceMode` union, `VoiceModeSwitchResult`, `VoiceModeApi`, `IPC_CHANNELS`
- `apps/desktop/src/main/ipc/voiceMode.ts` — `broadcastModeSwitch`, `bridgeVoiceModeChangeToRenderer`, `registerGetVoiceModeHandler`
- `.planning/phases/42-orb-visual-per-mode/42-UI-SPEC.md` — authoritative design contract (approved status)
- `.planning/config.json` — `nyquist_validation: true` confirmed

### Secondary (MEDIUM confidence)

- `apps/desktop/src/renderer/components/Orb/__tests__/Orb.test.tsx` — existing `mockContext` helper pattern, test structure to extend
- `apps/desktop/src/renderer/components/Orb/__tests__/OrbContext.test.tsx` — existing fake timer pattern for burst tests

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies; all stack confirmed by reading actual source files
- Architecture: HIGH — UI-SPEC is detailed and authoritative; exact code patterns provided
- Pitfalls: HIGH — derived from reading actual test infrastructure gaps and crossfade implementation details in Orb.tsx
- Test map: HIGH — test files confirmed to exist; new test cases needed are enumerated

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (stable — no fast-moving external dependencies)
