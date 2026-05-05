---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: LLM Actions & Polish
status: defining
last_updated: "2026-05-05T00:00:00.000Z"
last_activity: 2026-05-05
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-30)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 50 — Whisper Pre-Download UX

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-05 — Milestone v2.2 started

Progress: [░░░░░░░░░░] 0%

## Milestone History

Last completed: v2.1 Settings UX (3 phases, 12 plans, shipped 2026-05-05). See `.planning/milestones/v2.1-ROADMAP.md`.

## Accumulated Context

### Decisions

Carry-forward patterns from v1.9:

- Strategy pattern para captura de voz: WakeWordStrategy, AlwaysListeningStrategy, PttOnlyStrategy
- EventEmitter pub/sub para desacoplar tray, voiceInputManager e IPC de mode changes
- electron-store como single source of truth para voiceMode (default: 'wake-word')
- State machine com flag `transitioning` para evitar race conditions em mode switch
- Ring buffer pre-roll 500ms em Always-Listening para preservar primeiros fonemas
- Intent classifier local (multilingual-e5-small Transformers.js) — privacidade preservada
- OrbContext voiceMode via IPC subscription com cleanup correto
- crossfade useEffect watches [state, voiceMode] — pitfall crítico documentado
- Mode-switch toast autoCloseMs: 2000 (action toasts: 0ms)
- macOS permission gate via toast acionável "Abrir System Settings"
- [Phase 45]: PTT hotkey guard via setVoiceModeManager injection and createPttToggleCallback factory — null-safe, no circular import
- [Phase 45]: Mock objects must expose all symbols used by the module under test — missing setVoiceModeManager in ptt-hotkey mock caused unhandled Vitest error
- [Phase 46]: Mel normalization corrected to x/10 + 2 — sign inversion was root cause of near-zero classifier scores for all audio
- [Phase 46]: WakeWordEngine tests need @vitest-environment happy-dom annotation + inputNames/outputNames on all 4 session mocks (mel, embed, vad, kw)
- [Phase 46]: VAD gate is intentionally disabled (Silero requires raw audio, not embeddings); test 5 updated to reflect this architectural decision
- [Phase 47-01]: Settings window 480 → 600px width; space-y-8 inter-section gaps; mb-4 on h2 headers; space-y-4 inside TtsProviderSelect — human-verified and approved
- [Phase 48]: [Phase 48-02]: Authored 5 UI primitives (Button/Input/Label/Select/Slider) manually after shadcn CLI failed silently on Tailwind v4. Used ring-destructive/30 (token+opacity) instead of literal rgba for Input error focus.
- [Phase 48-design-system-foundation]: Field uses React.cloneElement to inject ARIA into a single child; Helper hides when error active (precedence)
- [Phase 48-design-system-foundation]: HotkeyRecorder preserves v2.0 prop API; legacy settings/HotkeyRecorder.tsx left in place for Phase 49 migration
- [Phase 49-settings-layout-refactor]: SettingsLayout uses inline placeholder stubs (option b) for Wave 1 buildability — avoids TS import errors until Wave 2/3 section files exist
- [Phase 49-settings-layout-refactor]: vadThresholdMs excluded from SettingsLayout dirty tracking — real-time IPC apply via setVadThreshold, no Save button cycle needed
- [Phase 49-settings-layout-refactor]: Pick<SettingsSectionProps> narrowing per section — each section only destructures props it needs
- [Phase 49-settings-layout-refactor]: Radix Slider scalar wrap/unwrap: value={[vadThresholdMs]} / vals[0]! for number[] API compatibility
- [Phase 49-settings-layout-refactor]: TtsSection uses Radix Select (not native select) — Wave 3 test update needed for fireEvent.change compatibility
- [Phase 49-settings-layout-refactor]: Field.Error empty string pattern: error={!!apiKeyError} controls Field visibility; child always renders apiKeyError ?? '' to avoid DOM flicker
- [Phase 49]: SettingsForm.tsx re-export shim: export { SettingsLayout as SettingsForm } preserves named export for all consumers without touching SettingsApp.tsx
- [Phase 49]: vitest.config.ts must mirror electron.vite.config.ts aliases — missing @ alias caused all renderer tests to fail on @/lib/cn imports
- [Phase 49-settings-layout-refactor]: SettingsForm.tsx re-export shim: export { SettingsLayout as SettingsForm } preserves named import for SettingsApp.tsx without touching those files
- [Phase 49-settings-layout-refactor]: vitest.config.ts missing @ alias: electron.vite.config.ts maps @ to src/renderer/src but vitest.config.ts only had @renderer — adding @ and @shared fixed @/lib/cn resolution
- [Phase 49-settings-layout-refactor]: Radix Slider tests: getByRole('slider') + aria-valuenow replaces getByLabelText + .value; keyboard ArrowRight/Left triggers onValueChange
- [Phase 49-settings-layout-refactor]: Test B (Radix Select portal change) skipped: portal rendering in happy-dom requires pointer-events setup that is brittle across Radix versions; 1 skip within plan limit
- [Phase 50-01]: resolveWhisperModel uses inline VRAM thresholds — selectModelByVram not exported from vramDetection.ts
- [Phase 50-01]: whisper-resources.test.ts uses top-level imports with vi.clearAllMocks to avoid vi.resetModules mock isolation issue
- [Phase 50]: setupWhisperHandlers accepts lazy getter () => BrowserWindow | null — settings window is lazy-created, not available at startup

### v2.0 Bugs Known

- **PTT guard missing**: ptt-hotkey.ts emite `ptt:action` independente do voice mode atual. ChatInput.tsx inicia gravação mesmo em wake-word mode. Fix: checar voiceModeManager.getMode() === 'ptt-only' antes de emitir.
- **Whisper model override ignored**: main/index.ts define selectedModel via VRAM mas nunca lê getWhisperModelOverride() do store. Settings salva mas valor é ignorado. Fix: aplicar override pós-VRAM-detection.
- **Wake word reliability**: ROOT CAUSE FIXED — mel normalization sign inversion (`-2` → `+2`) caused all embeddings to be out-of-distribution. Fix applied in Phase 46-01. Awaiting human smoke test to confirm.
- ~~**Settings UI narrow**: janela estreita com cara de default Electron.~~ FIXED in Phase 47-01 — window widened to 600px with improved spacing.

### Pending Todos

None.

### Current Blockers

None.

## Session Continuity

**If starting fresh:**

- v2.0 roadmap em `.planning/ROADMAP.md` — 3 phases (45, 46, 47)
- Bugs documentados em "v2.0 Bugs Known" acima
- `/gsd:plan-phase 45` para iniciar execução
