---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Agentic JARVIS
status: Ready to execute
last_updated: "2026-05-09T21:57:41.588Z"
last_activity: 2026-05-09
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 33
  completed_plans: 24
  percent: 73
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 67 — jarvis-proativo

## Current Position

Phase: 67 (jarvis-proativo) — EXECUTING
Plan: 2 of 10
Next: Phase 63
Last activity: 2026-05-09

Progress: [█░░░░░░░░░] 17% (1/6 phases)

## Milestone History

Last completed: v2.3 LLM Providers & System Actions (5 phases, 13 plans, shipped 2026-05-07).

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
- [Phase 61]: p-queue v9.2.0 installed (not 8.4.0 from STATE.md) — RESEARCH.md confirmed 9.2.0 is correct
- [Phase 61]: AbortController manages activeTasks Map only — does NOT interrupt @xenova/transformers (no native AbortSignal in v2.17.2)
- [Phase 61-embedding-priority-queue]: Write paths (addMemory, addTypedMemory) use embeddingQueue.enqueueEmbed; query paths retain direct embedText calls — hot path must not go through low-priority queue
- [Phase 61-embedding-priority-queue]: saveTurn SQLite saveMessages sync + Chroma fire-and-forget via void _queueVectorIndexing() with isolated try/catch
- [Phase 61]: embeddingQueue.pause()/start() wired into ChatSession with unconditional finally-block resume — LLM-PRIO-01 and LLM-PRIO-02 satisfied end-to-end
- [Phase 61]: saveTurn() converted to void fire-and-forget at both ChatSession.send() and sendStream() call sites — SQLite sync durability preserved via saveTurn internal implementation from Plan 02
- [Phase 62-kokoro-offline-tts]: kokoroResources.ts uses fetch API (not https.get) with for-await chunked streaming — cleaner async/await pattern
- [Phase 62-kokoro-offline-tts]: Model stored at app.getPath('userData')/kokoro/model.onnx — no isPackaged branching needed (unlike whisper extraResources)
- [Phase 62-kokoro-offline-tts]: device:null for kokoro-js from_pretrained (not 'auto' which is not in type definition)
- [Phase 62-kokoro-offline-tts]: KokoroDownloadProgress uses downloadedMb/totalMb (MB units to match kokoro-js model size reporting)
- [Phase 62-kokoro-offline-tts]: Button variant for download action: secondary (not outline — not in design system)
- [Phase 63-vision-pipeline-ts]: captureScreenFn built inline in ChatSession.create() using clientIdRef — avoids external injection, gateway URL normalized ws://→http://
- [Phase 63-vision-pipeline-ts]: analyze_screen returns base64 string (not object) — LangGraph tool() expects string without responseFormat override
- [Phase 63]: sharp 0.33+ uses @img/sharp-{platform}-{arch} packages for native binaries; extraResources must include @img/sharp-win32-x64, @img/colour, and sharp main package
- [Phase 63-vision-pipeline-ts]: screenshotHotkey goes through settings.save (not apply-without-restart) because global shortcut must be re-registered via changeScreenshotHotkey — mirrors pttHotkey pattern
- [Phase 63]: CHAT_SEND_IMAGE forwards to backend POST /api/chat with Bearer auth — matches BackendConfig.backendUrl pattern
- [Phase 63]: capture_screen_request/response handled before ActionAckSchema.safeParse in ws-server.ts to avoid schema rejection
- [Phase 63-vision-pipeline-ts]: Vision pipeline human-verified: analyze_screen triggers correctly, returns Portuguese error for non-vision LM Studio provider
- [Phase 63-vision-pipeline-ts]: TTS confirmed working end-to-end: error messages spoken aloud via kokoro, confirming Phase 62+63 integration
- [Phase 64-mcp-server]: ISO 8601 strings for McpClientInfo fields — IPC transport is JSON-based, Date objects not serializable
- [Phase 64-mcp-server]: mcpServerEnabled uses store.get default parameter pattern — consistent with electron-store boolean flags
- [Phase 64]: SettingsApi.mcp made optional — contextBridge exposes window.mcp separately from window.settings
- [Phase 66-01]: Wave 0 stub-first pattern — create vitest test files with `it.todo()` BEFORE Wave 1 implementation. Allows real `<verify>` commands in plans (no "MISSING" placeholders) and forces interface contracts to be defined upfront.
- [Phase 66-01]: Renderer mirrors backend keyword constants byte-for-byte; parity test reads backend file at test time and asserts equality to prevent drift. Pattern applicable to any pt-BR copy that must match across backend + renderer.
- [Phase 66-02]: LangGraph 1.x `Annotation.Root({...})` channels need explicit `(_, x) => x` overwrite reducers — default reducer behavior is opaque and Pitfall 8 (edit-feedback ignored) bites silently. Always declare reducer.
- [Phase 66-02]: `MemorySaver.deleteThread(threadId)` MUST be called explicitly on terminal events (`task:done|cancelled|error`). No automatic GC. Document at module level.
- [Phase 66-02]: Per-step ReAct instruction goes as `HumanMessage` NOT `SystemMessage` — Anthropic Claude rejects multiple system messages; OpenAI/LM Studio silently concatenate. Pitfall 5 explicit.
- [Phase 66-02]: `interrupt()` from `@langchain/langgraph` THROWS `GraphInterrupt`. Never wrap in `try/catch` without re-throwing on `isGraphInterrupt(err)`. Will swallow the pause mechanism otherwise.
- [Phase 66-02]: `createReactAgent` is `@deprecated` in 1.2.8 (moved to `langchain` package as `createAgent`). Phase 66 deliberately keeps the deprecated import — migration is tech-debt for v3.x. Document at site of use.
- [Phase 66-03]: AbortSignal threading pattern — `AbortSignal.any([config.signal, AbortSignal.timeout(N)])` composes outer cancel with inner timeout. Node 22 stable. Required at every fetch boundary (request-file-action, MCP tool-adapter).
- [Phase 66-03]: MCP tool cancellation returns pt-BR string `"Tool {name} cancelado pelo usuário."` to the LLM — NOT throw. Throwing would make the LLM retry; string-return makes the LLM report cleanly. Phase 65 D-16 shape preserved.
- [Phase 66-03]: D-17 audit log enrichment — when both `mcp-external` AND `agentic-task` apply, `source: 'agentic-task'` takes precedence; `mcpServerName` retained as separate field so origin is not lost.
- [Phase 66-03]: SSE event protocol uses `event: task:plan\ndata: {...}\n\n` format (named events, NOT bare `data:`). Renderer EventSource consumer uses `addEventListener('task:plan', ...)`. Pitfall 7 explicit.
- [Phase 66-03]: `streamMode: ['custom', 'messages'] as const` returns `[mode, chunk]` tuples in async iterator. The `custom` mode receives `config.writer(payload)` calls from inside nodes — used to emit task:* events without intermixing with token chunks.
- [Phase 66-03]: `taskId` format = `chat-{chatSessionId}-task-{uuid}` validated by regex `/^chat-[\w-]+-task-[0-9a-f-]{36}$/` at route boundary. Defense in depth for malformed input even though single-user backend.
- [Phase 66-03]: Connection lifecycle — SSE closes after each phase (initial → interrupt; resume → next interrupt or terminal). Renderer opens NEW SSE on POST /resume response. Cleaner than long-lived connections (RESEARCH Open Questions #5).
- [Phase 66-04]: TaskCheckList is a single component rendering 8 discriminated-union states — no fallback double-render, no separate components per state. Reduces surface area and matches UI-SPEC § Component Inventory contract.
- [Phase 66-04]: Orb `agentBadgeText` prop is OPTIONAL — when undefined, falls back to existing voice-mode label. NO change to voice-mode color (D-12). Pattern: optional override prop with fallback to existing behavior.
- [Phase 66-04]: TTS sumário uses determined-string templates (no extra LLM call) for latency. UI-SPEC locks the templates verbatim per N≤3 vs N>3 branches.
- [Phase 66-04]: sendAudioAndHandle short-circuit pattern: read activeTask from ChatContext, match keyword, call IPC bridge → bypass /api/chat. Falls through to existing flow when no match. Pattern reusable for any "voice triggers a non-chat action" case.
- [Phase 66-05]: BLOCKING manual UAT covers 8 scenarios (A-H) including microphone-driven cancellation, TTS perceptual quality, and badge contrast over varying wallpapers — perceptual gates not feasible in CI.
- [Phase 67-jarvis-proativo]: node-cron@^4.2.1 instalado em backend-ts; Drizzle migration 0005 com statement-breakpoints; ProactiveEvent union em ipc-types.ts; stub-first Wave 0 pattern com 9 it.todo() files

### v3.0 Architecture Notes

New packages for v3.0:

- `@modelcontextprotocol/sdk@1.29.0` — Official MCP client + server SDK; stdio transport for server, HTTP for client
- `kokoro-js@1.2.1` — Offline neural TTS (ONNX, ~350MB model, Apache license)
- `node-cron@3.0.x` — Cron-based scheduler for proactive tasks
- `chokidar@5.0.x` — File system watcher (ESM-only, Node 20+ required)
- `sharp@0.35.x` — Image processing for vision pipeline (resize 4K→1080p before vision LLM)

Key architecture notes for v3.0:

- Kokoro is the validation gate (Phase 62 first): if kokoro-js latency >1s/100 chars, Murf.ai becomes default and Kokoro optional
- MCP server runs in backend-ts as stdio transport (not HTTP); HTTP Streamable deferred to v3.1
- MCP client connects to 1 static server URL from .env (HTTP transport, ex: n8n); multi-server deferred to v3.1
- Vision pipeline: Electron desktopCapturer → base64 → HTTP POST /api/vision → backend-ts sharp.resize() → LangChain vision LLM
- Agentic: LangGraph 1.1.4 multi-step ReAct loop already in stack; add TaskExecutor with planning + reflection nodes
- Proactive: node-cron + chokidar in backend-ts/Electron; proactive tasks use same ChatSession as reactive chat, fire-and-forget with p-queue
- Kokoro model download: reuse Phase 50 (Whisper pre-download) progress bar pattern
- Never block chat with proactive tasks: separate p-queue (concurrency: 1) for proactive vs chat

### Pending Todos

None.

### Current Blockers

None.

## Session Continuity

**If starting fresh:**

- v3.0 roadmap em `.planning/ROADMAP.md` — 6 phases (62-67)
- 23 requirements mapeados: TTS-OFF-01/02/03/04, VISION-01/02/03, MCP-SRV-01/02/03, MCP-CLI-01/02/03, AGENT-01/02/03/04, PROACT-01/02/03/04/05/06
- Phase 62 (Kokoro Offline TTS) é o ponto de entrada — validation gate para TTS offline
- `/gsd:plan-phase 62` para iniciar execução
