---
phase: quick-260427-qzg
plan: 01
subsystem: voice-input
tags: [ptt, voice-mode, wake-word, multi-turn, mediastream, ipc]
tech-stack:
  added: []
  patterns:
    - "Sub-componente condicional <WakeWordFeatures> para gating de hooks por voice mode (evita unmount dance manual)"
    - "MediaStream cacheado em useRef até unmount do hook (cleanup só no useEffect return)"
    - "isStreamUsable() retorna boolean (não type predicate) para preservar narrowing manual em ambas as branches"
    - "Bridge EventEmitter (main) → IPC channel (main → renderer) para propagar voiceMode:change ao renderer"
    - "registerTTSHooks({}) no cleanup do hook para desregistrar callback fantasma no singleton ttsPlayer"
key-files:
  created: []
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/ipc/voiceMode.ts
    - apps/desktop/src/main/ipc/index.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/renderer/hooks/useAudioRecorder.ts
    - apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts
    - apps/desktop/src/renderer/src/App.tsx
decisions:
  - "Bridge voiceMode:change main→renderer via wrapper em ipc/voiceMode.ts (não no VoiceModeManager) — segue padrão broadcastModeSwitch/broadcastPauseToggle e mantém o manager headless"
  - "registerGetVoiceModeHandler chamado em main/index.ts APÓS voiceModeManager.init() (setupIpcHandlers roda antes da criação do manager) — evita refatoração da assinatura de setupIpcHandlers"
  - "Gating de hooks via sub-componente condicional <WakeWordFeatures> em vez de prop {enabled} — desmount/remount nativo do React garante cleanup completo do useWakeWord (vad.pause, engine.stop, registerTTSHooks({})) sem precisar adicionar branches no hook"
  - "isStreamUsable retorna boolean (não type predicate) — TypeScript narrowing em type guard descarta o valor truthy mas inválido na branch !usable, impedindo o cleanup track.stop()"
  - "Stream cacheado até unmount com revalidação de readyState antes de cada gravação — cobre USB mic desconectado e re-prompt zero entre toggles"
metrics:
  duration: "11 min"
  completed: "2026-04-27"
---

# Quick Task 260427-qzg: Fix Push-to-Talk (Permissão de Mídia + Mic Aberto) Summary

Bug 1 resolvido cacheando MediaStream entre toggles de PTT no `useAudioRecorder`; bug 2 resolvido isolando `useWakeWord` + `useMultiTurnWindow` num sub-componente condicional `<WakeWordFeatures>` que só monta em `voiceMode === 'wake-word'`. Plumbing IPC novo (`voiceMode:get` + bridge do `voiceMode:change`) expõe o modo atual ao renderer para gatear os hooks reativamente.

## Bugs Fechados

### Bug 1 — Re-prompt de permissão de mídia em todo aperto PTT

- **Causa raiz:** `useAudioRecorder.stopRecording()` chamava `stream.getTracks().forEach(t => t.stop())` e zerava `streamRef.current = null`. Próxima `startRecording()` chamava `getUserMedia()` de novo → Electron emitia `[permission] request: media from: http://localhost:5173/` em todo toggle.
- **Fix:** stream cacheado em `streamRef` por toda a vida do hook; tracks só são paradas no cleanup do `useEffect` (unmount). `MediaRecorder` continua sendo recriado por gravação (a API é terminal após `stop()`). Função `isStreamUsable()` valida `readyState === 'live'` em cada track — se uma morrer (USB mic desconectado), descarta e refaz `getUserMedia` transparentemente.
- **Esperado pós-fix:** ≤ 1 prompt de permissão por sessão de PTT, mesmo em N apertos consecutivos.

### Bug 2 — Mic aberto após resposta TTS + transcrição fantasma " e aí"

- **Causa raiz:** `App.tsx` chamava `useWakeWord()` e `useMultiTurnWindow()` incondicionalmente, em todos os modos. Mesmo em `ptt-only`, `useWakeWord` adquiria mic via `getUserMedia` e `useMultiTurnWindow` registrava `afterPlay` que abria janela VAD de 8s após cada TTS terminar — VAD pegava ruído ambiente e enviava " e aí" ao gateway com `source: 'followup'`.
- **Fix:** extraído sub-componente `<WakeWordFeatures multiTurnEnabled windowMs />` que encapsula ambos os hooks. `AppContent` lê `voiceMode` via `window.jarvis.voiceMode.getMode()` no mount e reage a `onChange()` (broadcast main→renderer). Renderiza `<WakeWordFeatures />` apenas quando `voiceMode === 'wake-word'`. Em `ptt-only` ou `always-listening`, os hooks NUNCA montam — `getUserMedia` não é chamado, `afterPlay` não é registrado.
- **Reforço:** `useMultiTurnWindow` agora chama `registerTTSHooks({})` no cleanup do `useEffect` para garantir desregistro do callback fantasma no singleton `ttsPlayer` mesmo em transições rápidas.
- **Esperado pós-fix:** após resposta PTT, mic 100% fechado; nenhum log `[multiTurnWindow] opening`; nenhuma transcrição " e aí" enviada ao backend sem aperto manual.

## Arquivos Tocados

| Arquivo | Mudança |
|---|---|
| `apps/desktop/src/shared/ipc-types.ts` | Adiciona `IPC_CHANNELS.VOICE_MODE_GET`, interface `VoiceModeApi`, e `JarvisAPI.voiceMode` |
| `apps/desktop/src/main/ipc/voiceMode.ts` | Adiciona `registerGetVoiceModeHandler()` e `bridgeVoiceModeChangeToRenderer()` |
| `apps/desktop/src/main/ipc/index.ts` | Re-exporta os dois novos handlers para wiring em `main/index.ts` |
| `apps/desktop/src/main/index.ts` | Chama `registerGetVoiceModeHandler` + `bridgeVoiceModeChangeToRenderer` após `voiceModeManager.init()` |
| `apps/desktop/src/preload/index.ts` | Expõe `window.jarvis.voiceMode.getMode() / onChange()` |
| `apps/desktop/src/renderer/hooks/useAudioRecorder.ts` | Cache do MediaStream entre gravações; cleanup das tracks só no unmount; revalidação `readyState === 'live'` antes de reusar |
| `apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts` | `registerTTSHooks({})` no cleanup do `useEffect` para desregistrar afterPlay fantasma |
| `apps/desktop/src/renderer/src/App.tsx` | Extrai `<WakeWordFeatures>`; lê `voiceMode` via IPC; renderiza WakeWordFeatures condicionalmente |

## Commits

- `6ee5187` ✨ feat(ipc): expor voice mode atual ao renderer via window.jarvis.voiceMode (Task 1: IPC plumbing)
- `c0939a8` 🐛 fix(ptt): cachear MediaStream e desativar wake word em modo ptt-only (Task 2: renderer fixes)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Bridge faltando para canal `voiceMode:change` (main→renderer)**
- **Found during:** Task 1
- **Issue:** O plano descrevia `VOICE_MODE_CHANGE: 'voiceMode:change' // já existe (main → renderer broadcast)`. Inspeção do código mostrou que o canal existe em `IPC_CHANNELS`, mas `VoiceModeManager` apenas emite no seu próprio EventEmitter interno (`this.emit('voiceMode:change', event)` em `voiceMode/index.ts:249`) — ninguém bridgeava para `webContents.send`. Sem isso, `window.jarvis.voiceMode.onChange()` do preload ficaria silente: o canal IPC nunca receberia eventos.
- **Fix:** adicionada função `bridgeVoiceModeChangeToRenderer(voiceModeManager)` em `ipc/voiceMode.ts` que escuta o EventEmitter do manager e re-broadcasta para todas as `BrowserWindow.getAllWindows()` (com `isDestroyed()` guard, mesmo padrão de `broadcastModeSwitch`). Chamada em `main/index.ts` após `voiceModeManager.init()`.
- **Files modified:** `apps/desktop/src/main/ipc/voiceMode.ts`, `apps/desktop/src/main/ipc/index.ts`, `apps/desktop/src/main/index.ts`
- **Commit:** `6ee5187`

**2. [Rule 3 - Blocker] `setupIpcHandlers` roda antes de `voiceModeManager` ser criado**
- **Found during:** Task 1
- **Issue:** O plano sugeria registrar `registerGetVoiceModeHandler` dentro de `setupIpcHandlers()`. Mas em `main/index.ts`, `setupIpcHandlers(...)` é chamado na linha 223, e `voiceModeManager = new VoiceModeManager(...)` só na linha 264. Passar o manager para o handler dentro do mesmo fluxo de wiring atual exigiria refatoração da assinatura de `setupIpcHandlers` e quebraria os mocks existentes em `index.test.ts` (linha 79: `vi.doMock('../ipc', () => ({ setupIpcHandlers: mockSetupIpcHandlers }))`).
- **Fix:** mantida assinatura de `setupIpcHandlers`. `registerGetVoiceModeHandler(voiceModeManager)` e `bridgeVoiceModeChangeToRenderer(voiceModeManager)` foram registrados separadamente em `main/index.ts` logo após `voiceModeManager.init()`. Comentário inline explica a ordem em `ipc/index.ts`.
- **Commit:** `6ee5187`

**3. [Rule 1 - Bug] TypeScript narrowing em type guard descartava `MediaStream` truthy-mas-inválido**
- **Found during:** Task 2 (typecheck após primeira tentativa)
- **Issue:** A primeira versão de `isStreamUsable` declarava `stream is MediaStream`. Após `if (!isStreamUsable(stream))`, TypeScript narrowed `stream` para `never`, então `stream.getTracks()` (no cleanup da branch !usable) virava erro TS2339. O caso real cobre stream não-null mas com track morta — precisamos chamar `track.stop()` antes de pedir um novo.
- **Fix:** mudança para `boolean` literal (não type predicate) e introdução de variável local `cached` separada de `stream: MediaStream` final. Branch usable: `stream = cached as MediaStream`. Branch !usable: usa `cached` (preserva o tipo `MediaStream | null` original) para fazer `cached.getTracks().forEach(t.stop())` antes de `getUserMedia`.
- **Commit:** `c0939a8`

### Skipped Tasks

**Task 3 (checkpoint:human-verify):** pulada por constraint (execução assíncrona, não bloquear humano). O que precisaria de verificação manual:

1. **Bug 1 manual test** — Em modo `ptt-only`, apertar PTT 5 vezes seguidas; esperado: ≤ 1 ocorrência de `[permission] request: media` na sessão.
2. **Bug 2 manual test** — Após resposta com TTS terminar; esperado: nenhum log `[multiTurnWindow] opening follow-up window`; mic FECHADO; nenhuma transcrição " e aí" no gateway.
3. **Regressão wake-word** — trocar voice mode para `wake-word` via tray; esperado: logs `[wakeWord] engine started` aparecem (boot late do hook); falar "Hey JARVIS" + frase ainda funciona.
4. **Regressão troca de modo dinâmica** — em wake-word ativo, trocar para `ptt-only`; esperado: logs de cleanup aparecem; "Hey JARVIS" deixa de disparar; PTT continua funcionando.

**Task 4 (commit consolidado):** pulada — substituída por commits atômicos por task (Task 1 = `6ee5187`, Task 2 = `c0939a8`), conforme spec do executor (commits atomicamente por task).

## Verification Performed

- `npx tsc --noEmit -p tsconfig.json` em `apps/desktop`: nenhum erro novo introduzido pelos arquivos modificados (74 erros pré-existentes permanecem em `settings.test.ts`, `voiceHandler.ts`, `ChatInput.tsx`, `useMultiTurnWindow.ts:152-208` (lib types `MicVAD.onSpeechStart/End`), `useWakeWord.ts:122,147,253,358,374` (hook state shape), `pttOnly.ts`, `main/index.ts:126,139,151,202`, etc — todos fora do escopo desta quick task).
- `pnpm test --run useWakeWord useMultiTurnWindow`: **28/28 passed** — sem regressão em testes diretamente cobrindo os hooks tocados.
- `pnpm test --run` (suite completa): **539 passed | 23 failed | 9 skipped (571)**. O baseline pré-mudança (commit 1fdc262) mostra exatamente a mesma contagem: **539 passed | 23 failed**. **Zero regressão** introduzida — todas as falhas são pré-existentes e fora do escopo (`vramDetection`, `whisper-gpu-detection`, `voiceHandler`, `tts-providers`, `tray.platform`, `security.test.ts`, `integration-chat`, `chat-send-audio`, `modelLoader`).
- Auto-fix attempts: 1 ciclo no `useAudioRecorder.ts` (correção de TS narrowing) — bem abaixo do limite de 3.

## Deferred Issues

Nenhum — bugs alvo do plan foram corrigidos sem novos issues introduzidos. Pre-existing typecheck/test failures continuam logados no projeto e fora do escopo.

## Self-Check: PASSED

- Created files (none): N/A
- Modified files all exist and contain the expected changes:
  - `apps/desktop/src/shared/ipc-types.ts` — FOUND
  - `apps/desktop/src/main/ipc/voiceMode.ts` — FOUND
  - `apps/desktop/src/main/ipc/index.ts` — FOUND
  - `apps/desktop/src/main/index.ts` — FOUND
  - `apps/desktop/src/preload/index.ts` — FOUND
  - `apps/desktop/src/renderer/hooks/useAudioRecorder.ts` — FOUND
  - `apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts` — FOUND
  - `apps/desktop/src/renderer/src/App.tsx` — FOUND
- Commits exist:
  - `6ee5187` — FOUND
  - `c0939a8` — FOUND
