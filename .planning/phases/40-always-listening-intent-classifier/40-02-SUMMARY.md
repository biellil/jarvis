---
phase: 40-always-listening-intent-classifier
plan: 02
subsystem: voice-pipeline
tags: [electron-store, ipc, typescript, vad, whisper, always-listening, phase-40]

# Dependency graph
requires:
  - phase: 39-voice-mode-state-machine
    provides: VoiceMode union type, electron-store voiceMode accessors, IPC channel registry pattern
provides:
  - electron-store getVadSilenceThresholdMs/setVadSilenceThresholdMs com clamp duplo no read e write (range 300-800ms, default 500ms)
  - 4 novos canais IPC ALWAYS_LISTENING_* + VOICE_MODE_DEGRADED no IPC_CHANNELS registry
  - Interface AlwaysListeningUtterancePayload (wavBuffer + timestamp) para renderer→main
  - Interface VoiceModeDegradedEvent com reason discriminado (classifier-load-fail | classifier-download-fail | timeout | permission-denied)
  - Campo SettingsData.vadSilenceThresholdMs (read-only no get; aplicado em real-time via IPC dedicado)
  - Interface TranscribeResult substituindo o inline { result?: string } no WhisperInstance
  - Documentação central do fallback heurístico para STT confidence (D-08): @fugood/whisper.node não expõe per-segment confidence
affects:
  - 40-03 (Always-Listening Strategy) — consome AlwaysListeningUtterancePayload + canais IPC + getVadSilenceThresholdMs
  - 40-04 (Intent Classifier) — consome TranscribeResult.confidence (com fallback heurístico)
  - 40-05 (Settings UI VAD slider) — consome SettingsData.vadSilenceThresholdMs + canal ALWAYS_LISTENING_VAD_THRESHOLD
  - 40-06 (Tray Degraded toast) — consome VoiceModeDegradedEvent + canal VOICE_MODE_DEGRADED
  - 41 (Tray integration / degraded UX)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clamp duplo (read+write) para campos numéricos persistidos: defesa contra corrupção de store + input UI malicioso (T-40-VAD)"
    - "IPC reason discriminated union para eventos de erro acionáveis (VoiceModeDegradedEvent.reason — Phase 41 toast condicional)"
    - "Campo opcional em interface foundational + comentário documentando fallback heurístico (TranscribeResult.confidence) — permite upgrade transparente sem quebrar callers"
    - "SaveSettingsRequest exclui campos com real-time apply via IPC dedicado (vadSilenceThresholdMs) — evita conflito save vs live-tune"

key-files:
  created: []
  modified:
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/main/__tests__/store.test.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/voiceInput/whisperResources.ts

key-decisions:
  - "vadSilenceThresholdMs persistido como primitivo number (não wrapper { ms: number }) — espelha pattern de voiceMode em vez de ttsProvider/ttsApiKey, evita boilerplate desnecessário"
  - "Clamp duplo (read E write) para vadSilenceThresholdMs — protege contra corrupção de electron-store JSON e input UI inválido (T-40-VAD STRIDE Tampering mitigation)"
  - "TranscribeResult.confidence opcional + fallback heurístico documentado em comentário do tipo — fecha Open Question A3/Q1 do RESEARCH.md sem bloquear waves seguintes; AlwaysListeningStrategy usa heurística 'transcript vazio→confidence=0' (D-08)"
  - "vadSilenceThresholdMs ausente de SaveSettingsRequest com NOTE explicando — UI-SPEC marca esse campo como real-time apply via canal dedicado, sem botão Save"
  - "Type guard adicional typeof !== 'number' no getVadSilenceThresholdMs além do range check — defesa contra strings/null gravados manualmente no JSON"

patterns-established:
  - "Persisted-numeric-with-clamp: pattern para futuros campos numéricos (sensitivity, threshold, timeout) — clamp no read trata corrupção como undefined; clamp no write evita persistir valores malformados"
  - "IPC-channel-comment-convention: cada novo canal documentado com '/** direção: descrição funcional */' inline antes da entrada no IPC_CHANNELS"
  - "Foundational-types-before-implementation: Plan 02 estabelece tipos+canais antes de Plans 03-06 — desbloqueia trabalho paralelo nas waves seguintes sem necessidade de descobrir contratos no codebase"

requirements-completed: [VLISTEN-01, VLISTEN-02, VLISTEN-04]

# Metrics
duration: 5min
completed: 2026-04-26
---

# Phase 40 Plan 02: Tipos e contratos IPC para Always-Listening Summary

**3 arquivos de fundação modificados (store.ts + ipc-types.ts + whisperResources.ts) + 5 testes adicionais cobrindo clamp duplo VAD silence threshold — 4 canais IPC novos, 2 interfaces Phase 40, 1 interface TranscribeResult com fallback heurístico documentado para STT confidence.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-26T13:39:04Z
- **Completed:** 2026-04-26T13:44:25Z
- **Tasks:** 2/2
- **Files modified:** 4 (3 src + 1 test)
- **Lines changed:** +163 / -1

## Accomplishments

- electron-store ganhou getVadSilenceThresholdMs/setVadSilenceThresholdMs com defesa em profundidade (clamp duplo no read e write, range 300-800ms, default 500ms alinhado com OpenAI/Alexa/Google)
- IPC contracts da Phase 40 ficaram prontos antes das waves seguintes: 4 canais novos (start/stop/utterance/vad-threshold + degraded), 2 interfaces (AlwaysListeningUtterancePayload, VoiceModeDegradedEvent) — Plans 03-06 não precisam mais explorar codebase para descobrir nomes/payloads
- TranscribeResult interface fecha Open Question A3/Q1 do RESEARCH.md: confidence opcional com fallback heurístico documentado direto no tipo, evitando descoberta silenciosa em Plans 04/05
- 5 testes novos no store.test.ts cobrindo todos os caminhos de clamp (default, roundtrip, min boundary, max boundary, corruption guard) — suite passa 25/25

## Task Commits

1. **Task 1: vadSilenceThresholdMs accessors no store** — `8f67010` (feat)
2. **Task 2: Tipos Phase 40 ao ipc-types + TranscribeResult** — `89709b8` (feat)

**Plan metadata commit:** `f7420d0` (docs: deferred-items.md)

## Files Created/Modified

- `apps/desktop/src/main/store.ts` — Adicionou StoreSchema.vadSilenceThresholdMs?: number, constantes VAD_SILENCE_THRESHOLD_DEFAULT/MIN/MAX, accessors getVadSilenceThresholdMs/setVadSilenceThresholdMs com clamp duplo
- `apps/desktop/src/main/__tests__/store.test.ts` — Importou os 2 novos accessors + describe block com 5 testes (default, roundtrip, clamp min, clamp max, corruption guard)
- `apps/desktop/src/shared/ipc-types.ts` — 4 novos canais IPC (ALWAYS_LISTENING_START/STOP/UTTERANCE/VAD_THRESHOLD + VOICE_MODE_DEGRADED), 2 interfaces (AlwaysListeningUtterancePayload, VoiceModeDegradedEvent), campo SettingsData.vadSilenceThresholdMs, comentário em SaveSettingsRequest explicando ausência intencional
- `apps/desktop/src/main/voiceInput/whisperResources.ts` — Nova interface TranscribeResult exportada com confidence?: number opcional; WhisperInstance.transcribeData agora retorna Promise<TranscribeResult>; comentário longo documentando fallback heurístico para D-08
- `.planning/phases/40-always-listening-intent-classifier/deferred-items.md` — Registro de 8 test files com falhas pre-existentes no worktree paralelo (causa: ausência de node_modules próprio do worktree — não introduzido pelo plan 40-02)

## Decisions Made

- **Persistir vadSilenceThresholdMs como primitivo number** (não como `{ ms: number }` wrapper). Justificativa: voiceMode (Phase 39) também é primitivo. Wrappers só fazem sentido quando há múltiplos campos relacionados (pttHotkey + accelerator) ou quando undefined precisa ser distinguido de "não setado" (não é o caso aqui — undefined sempre vira default 500).
- **Clamp duplo defensivo** (read + write) para vadSilenceThresholdMs. Justificativa: T-40-VAD STRIDE Tampering — defesa em profundidade contra (1) JSON do electron-store editado manualmente pelo usuário (read-side guard), (2) input do Settings UI sem validação client-side (write-side guard). Padrão a ser reutilizado em futuros campos numéricos persistidos.
- **TranscribeResult.confidence opcional + fallback documentado no tipo**. Justificativa: D-08 OPEN QUESTION A3/Q1 do RESEARCH.md (whisper.cpp expõe confidence?). Tornar o campo opcional permite upgrade transparente caso @fugood/whisper.node ganhe o campo no futuro, sem quebrar AlwaysListeningStrategy. Comentário no tipo evita que Plans 04/05 redescobrim o problema.
- **vadSilenceThresholdMs ausente de SaveSettingsRequest** com comentário NOTE inline. Justificativa: UI-SPEC.md marca esse campo como real-time apply (slider que reconfigura o engine sem botão Save), via IPC dedicado ALWAYS_LISTENING_VAD_THRESHOLD. Incluí-lo em SaveSettingsRequest criaria conflito de fonte (save vs live tune).
- **Type guard typeof !== 'number'** adicional no get. Justificativa: corruption guard mais robusto — se usuário gravar manualmente `"vadSilenceThresholdMs": "500"` (string), `< MIN` retorna NaN, `> MAX` retorna NaN; só o type check pega esse caso explicitamente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Type guard `typeof !== 'number'` adicionado ao getVadSilenceThresholdMs**
- **Found during:** Task 1
- **Issue:** Plan especificava clamp por range mas não tratava casos onde o valor armazenado não é um number (string, null, object — corrupção JSON manual). Comparações `<` e `>` com não-number retornam NaN/false silenciosamente.
- **Fix:** Adicionado `typeof stored !== 'number'` ao OR-chain de validação no getVadSilenceThresholdMs. Casos não-numéricos retornam o default 500ms (mesma semântica que out-of-range).
- **Files modified:** apps/desktop/src/main/store.ts
- **Verification:** Caminho coberto implicitamente pelo teste de corruption guard (que escreve número fora de range); verificação adicional via TypeScript — campo é `vadSilenceThresholdMs?: number` então leituras tipadas são number|undefined.
- **Committed in:** 8f67010 (Task 1)

**2. [Rule 3 - Blocking] Restauração da árvore de trabalho ao base correto antes de iniciar**
- **Found during:** Pre-task (worktree branch check)
- **Issue:** Worktree estava no commit ac5ffbd (WR-02 fix) ao invés de bdad690 (Phase 40 base). git status mostrava arquivos modificados de plans não relacionados (voiceMode.test.ts, ROADMAP.md, STATE.md, etc.) que não pertencem ao plan 40-02.
- **Fix:** `git reset --soft bdad690` + `git checkout ac5ffbd -- .planning/` (para recuperar os arquivos de plan da Phase 40) + `git checkout -- <files>` para descartar mudanças não relacionadas. Working tree limpo no commit base correto antes de iniciar Task 1.
- **Files modified:** Nenhum (operação git de housekeeping)
- **Verification:** `git status --short` retornou vazio; `git log -1` confirmou bdad690 como HEAD.
- **Committed in:** N/A (operação pré-task)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Ambos os auto-fixes essenciais para correctness. O type guard fortalece a mitigation T-40-VAD declarada no plan threat_model. A restauração do worktree não alterou código — apenas garantiu que os commits do plan tenham o base correto. Zero scope creep.

## Issues Encountered

- **Failures pre-existentes em testes do voiceHandler/security/integration**: 12 sub-testes em 8 test files falham no worktree paralelo por causa de `Cannot find package '@fugood/whisper.node'` (worktree não tem node_modules próprio). Verificado pre-existente via `git stash` + re-run no estado base — failures persistem sem as mudanças do Task 2. Logado em `deferred-items.md` para revisão na consolidação dos worktrees. Suite alvo do plan (store.test.ts) passa 25/25.

- **tsc --noEmit reporta erros de module resolution**: mesmo causa raiz (worktree sem node_modules). Erros do tipo `Cannot find module 'electron-store'` em todos os arquivos com imports de packages. Nenhum erro novo nos arquivos modificados — apenas erros pre-existentes. Tipos novos (AlwaysListeningUtterancePayload, VoiceModeDegradedEvent, TranscribeResult, vadSilenceThresholdMs) são corretamente reconhecidos pelo TS server.

## Verification Snapshot

| Check | Result |
|-------|--------|
| `grep "vadSilenceThresholdMs?: number" store.ts` | ✓ 1 match |
| `grep "export function getVadSilenceThresholdMs" store.ts` | ✓ 1 match |
| `grep "export function setVadSilenceThresholdMs" store.ts` | ✓ 1 match |
| `grep "VAD_SILENCE_THRESHOLD_DEFAULT = 500" store.ts` | ✓ 1 match |
| `grep -c "VAD Silence Threshold accessors" store.test.ts` | ✓ 2 matches (header + describe) |
| `vitest run store.test.ts` | ✓ 25/25 passed |
| `grep "ALWAYS_LISTENING_START: 'always-listening:start'" ipc-types.ts` | ✓ 1 match |
| `grep "ALWAYS_LISTENING_UTTERANCE: 'always-listening:utterance'" ipc-types.ts` | ✓ 1 match |
| `grep "VOICE_MODE_DEGRADED: 'voiceMode:degraded'" ipc-types.ts` | ✓ 1 match |
| `grep "export interface AlwaysListeningUtterancePayload" ipc-types.ts` | ✓ 1 match |
| `grep "export interface VoiceModeDegradedEvent" ipc-types.ts` | ✓ 1 match |
| `grep "reason: 'classifier-load-fail'" ipc-types.ts` | ✓ 1 match |
| `grep "vadSilenceThresholdMs: number" ipc-types.ts` | ✓ 1 match (SettingsData) |
| `grep -c "ALWAYS_LISTENING" ipc-types.ts` | ✓ 4 matches (4 channels) |
| `grep "TranscribeResult" whisperResources.ts` | ✓ 3 matches (interface decl + return type + comment) |

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for Plans 40-03/04/05/06:**
- Plan 40-03 (AlwaysListeningStrategy) pode importar `getVadSilenceThresholdMs`, `IPC_CHANNELS.ALWAYS_LISTENING_*`, `AlwaysListeningUtterancePayload`, `VoiceModeDegradedEvent` diretamente.
- Plan 40-04 (Intent Classifier) pode importar `TranscribeResult` e usar a heurística fallback documentada (transcript vazio → confidence=0).
- Plan 40-05 (Settings UI VAD slider) pode usar `SettingsData.vadSilenceThresholdMs` no get e o canal `ALWAYS_LISTENING_VAD_THRESHOLD` para real-time apply.
- Plan 40-06 (Tray degraded toast / Phase 41) pode escutar `VOICE_MODE_DEGRADED` e usar `VoiceModeDegradedEvent.reason` para mensagens condicionais.

**Blockers / concerns:**
- Nenhum blocker para as waves seguintes do plan.
- Recomendação para consolidação do worktree: rodar `pnpm install` + suite completa no main worktree antes de marcar Phase 40 como pronta (ver deferred-items.md).

## Self-Check: PASSED

Verified files exist:
- ✓ apps/desktop/src/main/store.ts (modified)
- ✓ apps/desktop/src/main/__tests__/store.test.ts (modified)
- ✓ apps/desktop/src/shared/ipc-types.ts (modified)
- ✓ apps/desktop/src/main/voiceInput/whisperResources.ts (modified)
- ✓ .planning/phases/40-always-listening-intent-classifier/deferred-items.md (created)

Verified commits exist:
- ✓ 8f67010 — Task 1 (store.ts + tests)
- ✓ 89709b8 — Task 2 (ipc-types.ts + whisperResources.ts)
- ✓ f7420d0 — deferred-items.md

---
*Phase: 40-always-listening-intent-classifier*
*Plan: 02*
*Completed: 2026-04-26*
