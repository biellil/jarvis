---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: LLM Providers & System Actions
status: executing
last_updated: "2026-05-07T02:18:27.186Z"
last_activity: 2026-05-07
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 10
  completed_plans: 9
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 60 — lm-studio-streaming-events

## Current Position

Phase: 60 (lm-studio-streaming-events) — EXECUTING
Plan: 2 of 2
Status: Ready to execute
Last activity: 2026-05-07

Progress: [░░░░░░░░░░] 0% (0/5 phases)

## Milestone History

Last completed: v2.2 LLM Actions & Polish (6 phases, 22 plans, 164 files, shipped 2026-05-06). See `.planning/milestones/v2.2-ROADMAP.md`.

## Accumulated Context

### Decisions

Carry-forward patterns from v2.2:

- Canal WebSocket (`/api/actions`): Map<clientId, WebSocket> em memória no gateway; clientId gerado no Electron via crypto.randomUUID + electron-store
- Streaming TTS: sentence chunking por `[.!?]\s+` no Electron; ElevenLabs SDK oficial com `.stream()`; Murf.ai fallback para full-audio (não suporta streaming nativo)
- LLM Actions whitelist: home, Downloads, Documents, Desktop — validação Zod no backend antes de enviar ao Electron
- Confirmação de ações: toast não-bloqueante, timeout 10s = aborta silenciosamente
- Pitfall crítico: AudioContext deve ser singleton — acumular AudioContexts é o principal vetor de leak em soak test
- macOS tray icon template: `iconTemplate.png` (22×22) + `iconTemplate@2x.png` (44×44), black+alpha — Electron inverte automaticamente

Carry-forward patterns from v2.1:

- shadcn/ui + Tailwind v4 @theme tokens como design system — CSS custom properties, primitivos Radix/shadcn
- Radix Select (não native select) — testes Vitest precisam fireEvent.click em vez de fireEvent.change
- Field + Select + Input primitivos reutilizados para novos controles de Settings
- SettingsSectionProps interface como contrato para novas seções de Settings
- IPC apply-sem-restart como padrão: configurações aplicam via IPC sem restart do Electron
- electron-store como single source of truth para todas as configurações persistidas
- vitest.config.ts deve espelhar electron.vite.config.ts aliases — alias @ para src/renderer/src obrigatório
- AbortController para cancelar operações async in-flight (padrão anti-race-condition)

Carry-forward patterns de v1.9:

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
- [Phase 46]: Mel normalization corrected to x/10 + 2 — sign inversion was root cause of near-zero classifier scores for all audio
- [Phase 46]: WakeWordEngine tests need @vitest-environment happy-dom annotation + inputNames/outputNames on all 4 session mocks (mel, embed, vad, kw)
- [Phase 46]: VAD gate is intentionally disabled (Silero requires raw audio, not embeddings); test 5 updated to reflect this architectural decision
- [Phase 47-01]: Settings window 480 → 600px width; space-y-8 inter-section gaps; mb-4 on h2 headers; space-y-4 inside TtsProviderSelect — human-verified and approved
- [Phase 48]: Authored 5 UI primitives (Button/Input/Label/Select/Slider) manually after shadcn CLI failed silently on Tailwind v4. Used ring-destructive/30 (token+opacity) instead of literal rgba for Input error focus.
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
- [Phase 50-01]: resolveWhisperModel uses inline VRAM thresholds — selectModelByVram not exported from vramDetection.ts
- [Phase 50-01]: whisper-resources.test.ts uses top-level imports with vi.clearAllMocks to avoid vi.resetModules mock isolation issue
- [Phase 50]: setupWhisperHandlers accepts lazy getter () => BrowserWindow | null — settings window is lazy-created, not available at startup
- [Phase 51]: Script versionado em apps/desktop/scripts/ para gerar template PNGs on-demand (nao prebuild); PNGs commitados para evitar dependencia de sharp no CI
- [Phase 51]: Ternario platform-conditional inline em createTray(): process.platform === 'darwin' ? 'iconTemplate.png' : 'icon-16x16.png'
- [Phase 52-01]: LlmProvider exported as named type alias so store.ts can import it without circular repetition
- [Phase 52-01]: SaveSettingsRequest intentionally excludes new fields — apply-without-restart pattern, no Save button cycle needed
- [Phase 52-02]: Multi-window broadcast via BrowserWindow.getAllWindows() for all 3 new IPC handlers — consistent with broadcastPauseToggle pattern
- [Phase 52-02]: tokenizer.ts uses conservative per-provider context windows: lmstudio=4096, openai=8192, anthropic=100000
- [Phase 52-03]: Radix Slider aria-label does not propagate to Thumb accessible name in happy-dom — use getByRole('slider') without name filter
- [Phase 52-03]: Confirmation modal implemented as in-tree state (not Radix Dialog portal) for LlmSection overflow warning — avoids portal rendering issues in happy-dom
- [Phase 53-01]: SentenceChunker uses fresh /[.!?]\s+/.exec() per iteration to avoid stateful /g lastIndex pitfalls; D-02 abbreviation lock kept dumb on purpose
- [Phase 53-01]: streamingTurn cancellation = wrapper object {value:false} so closures capture live reference, not snapshot at synthAndSend creation time
- [Phase 53-01]: streamingTurn tests must vi.mock('../tts/index.js') because tts/index transitively imports electron-store via store.ts (throws on module-load in node test env)
- [Phase 53-02]: AudioContext singleton extracted into audioContextSingleton.ts — only one new AudioContext() call across entire renderer (soak-test mandate)
- [Phase 53-02]: streamingTtsPlayer schedules with start(when=Math.max(currentTime, lastEnd)) for sample-accurate gapless playback; per-turn pending Map drains in idx order to tolerate out-of-order arrivals
- [Phase 53-02]: FakeAudioContext registered as vitest setupFile — canonical mock pattern for future Web Audio renderer tests
- [Phase 53-03]: Streaming TTS feature flag mirrors Phase 52 SEXT-03 verbatim — store + IPC + multi-window broadcast + apply-without-restart
- [Phase 53-03]: Mock BrowserWindow in IPC tests must include isDestroyed: () => false — Phase 52+ broadcast handlers guard with isDestroyed()
- [Phase 53]: [Phase 53-04]: Bifurcation lives post-STT in handleAudio (entry function takes webmBuffer not transcription) — STT runs unconditionally, both branches share the same transcription input
- [Phase 53]: [Phase 53-04]: abortActiveStreamingTurn module-scoped in voiceHandler.ts — single dispatch point; future barge-in dispatcher just imports and calls it
- [Phase 54-llm-actions-channel-security]: vi.hoisted() with inline MinimalEmitter class for vi.mock factories referencing classes — avoids import-before-initialization error
- [Phase 54-llm-actions-channel-security]: actionsClient.ts module-scope state pattern (ws, stopped, reconnectTimer) for WebSocket lifecycle — mirrors voiceInput singleton patterns
- [Phase 54-llm-actions-channel-security]: ws noServer:true + httpServer.on('upgrade') to share port 3000 with Express without conflict
- [Phase 54-llm-actions-channel-security]: pendingAckResolvers Map (not EventEmitter) for ACK routing — simpler, type-safe, Promise-compatible
- [Phase 54-llm-actions-channel-security]: isPathValid uses path.resolve() for cross-platform traversal protection; tests use real os.homedir() not POSIX mock (Windows path.resolve incompatibility)
- [Phase 54]: ActionLogger accepts Drizzle instance directly (not dbPath string) — route uses module-level singleton, tests pass in-memory db
- [Phase 54]: POST /internal/actions-log mounted at /internal prefix — not proxied by gateway, only callable from backend-internal callers (gateway audit-logger)
- [Phase 54]: ActionConfirmationToast exported as named export from App.tsx for renderer test isolation — avoids full App tree mounting in tests
- [Phase 54-llm-actions-channel-security]: sendActionRequest sets 12s timer internally (not caller-managed) — Phase 55 LangGraph tool gets clean throw
- [Phase 54-llm-actions-channel-security]: CLIENT_NOT_CONNECTED throws without logActionToBackend — missing connection is not an auditable action attempt
- [Phase 55]: sendActionRequest returns { status, content? } object — callers use result.status/.content for viewContent file access
- [Phase 55]: POST /internal/dispatch-action mounted at /internal prefix in Express gateway — follows Phase 54 pattern, not proxied externally
- [Phase 55]: createRequestFileActionTool uses AbortSignal.timeout(13_000) — 1s above gateway 12s sendActionRequest; GATEWAY_URL normalized ws://→http://; tool bypasses wrapAllPcTools per D-11; clientId optional in ChatSessionOptions for graceful degradation
- [Phase 55]: executeAndAck clears pendingAction before IPC to prevent stale state on re-render
- [Phase 55]: sendAck in preload passes content? through ActionAckPayload — ipc/actions.ts already forwarded content
- [Phase 56]: SAMPLE_INTERVAL_MS auto-selects: 10s when --duration < 2min, 30min otherwise — zero config for both smoke and full runs
- [Phase 57-google-gemini-provider]: Default Gemini model is gemini-2.0-flash; streaming:true set for parity with openai/anthropic; no safetySettings (Phase 58 scope)
- [Phase 57]: SessionLock.tryAcquire() is best-effort for swapLLM — if busy, swap proceeds with warning (single-user device)
- [Phase 57]: API key accessors use { key: string } wrapper in StoreSchema mirroring TTS key pattern from Phase 34 for consistency
- [Phase 57]: RELOAD_LLM handler: persist keys to electron-store first, then POST backend, broadcast error toast + lmstudio fallback on failure (D-04, D-05, D-13)
- [Phase 57-google-gemini-provider]: Use @shared alias for ipc-types import in LlmSection to avoid fragile 5-level relative path
- [Phase 57-google-gemini-provider]: handleReloadLlm triggered on both provider change and API key blur for immediate backend reload without Save button
- [Phase 58-file-actions-refinement]: openFile uses open() package as fallback when shell.openPath returns error string (FACT-12)
- [Phase 58-file-actions-refinement]: moveFile/renameFile use src::dest encoding within existing path field — no new IPC fields needed (FACT-11)
- [Phase 58]: READ_ONLY_ACTIONS Set auto-executes openFolder/openFile/closeFile/viewContent without toast; destructive actions retain pendingAction flow (FACT-10/11)
- [Phase 59-system-controls]: createMediaControlTool uses z.enum for command — type-safe, LLM constrained to valid values (play_pause/next_track/prev_track)
- [Phase 59-system-controls]: createAdjustVolumeTool delta range [-100,100] with Zod .min/.max constraints for backend safety
- [Phase 59-system-controls]: assertDelta validator accepts signed integers in [-100,100]; adjustVolumeLinux reads current pactl % before applying delta; toggleMuteLinux uses pactl toggle; Windows fallback via nircmd for volume/mute/media
- [Phase 60-lm-studio-streaming-events]: Idempotent _buildNativeUrl: check /api/v1 suffix first before removing /v1 to prevent double-prefix bug
- [Phase 60-lm-studio-streaming-events]: USE_LM_STUDIO_STREAMING_EVENTS flag gates ChatOpenAIStreamingEvents instantiation in factory lmstudio case

### v2.3 Architecture Notes

New packages for v2.3:

- `@langchain/google-genai@2.1.30` — Gemini LLM via LangChain abstraction
- `@google/genai@1.52.0` — Official Gemini SDK (replaces deprecated @google/generative-ai)
- `p-queue@8.4.0` — Priority queue for embedding tasks with AbortController
- `open@11.0.0` — Cross-platform file opener fallback
- `loudness@0.4.2` — System volume control (headless, macOS/Windows/Linux)

Key architecture notes:

- Gemini: add case to llmFactory.ts, add 'gemini' to LlmProvider union, GEMINI_API_KEY in electron-store — ~20 LOC
- Gemini safety filter: null check on response.content mandatory — HTTP 200 with null content is a silent violation
- File fallback: shell.openPath() → fallback open package; always path.resolve() before any openPath call
- Action confirmation: requiresConfirmation Set initialized with only ['delete_file', 'move_file', 'rename_file']
- Volume/media: loudness package in Electron main; globalShortcut for media keys; reuse Phase 44 macOS permission gate pattern
- LM Studio Streaming Events: Phase 60 starts with investigation (confirm if langchain-openai auto-optimizes or needs subclass) before implementation
- Embedding priority: p-queue with priority 1 (embed) vs 10 (chat); AbortController cleanup mandatory; monitor in soak test

### Pending Todos

None.

### Current Blockers

None.

## Session Continuity

**If starting fresh:**

- v2.3 roadmap em `.planning/ROADMAP.md` — 5 phases (57-61)
- 9 requirements mapeados: LLM-PROV-01/02, LLM-PRIO-01/02, FACT-10/11/12, SYSCTRL-01/02
- `/gsd:plan-phase 57` para iniciar execução (Google Gemini Provider)
