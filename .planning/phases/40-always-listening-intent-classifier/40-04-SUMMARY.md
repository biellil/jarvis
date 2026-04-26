---
phase: 40-always-listening-intent-classifier
plan: 04
subsystem: voice-pipeline
tags: [voice, always-listening, vad, ring-buffer, transformers-js, audio-context, wav-encoding, tdd, wave-2]
one_liner: "AlwaysListeningEngine compositor renderer-side: AudioContext@16kHz + MicVAD legacy + AudioRingBuffer pre-roll + IntentClassifier lazy load + WAV encoding + reconfigureVadThreshold runtime."

# Dependency graph
requires:
  - phase: 40-always-listening-intent-classifier
    plan: 02
    provides: "@ricky0123/vad-web 0.0.30 already in package.json (Phase 39); ipc-types channels foundation"
  - phase: 40-always-listening-intent-classifier
    plan: 03
    provides: "AudioRingBuffer (Float32Array circular, capacity 16000), IntentClassifier wrapper Transformers.js, INTENT_THRESHOLD constant"
  - "encodeFloat32ToWav (Phase 24) — convert Float32@16kHz → WAV Uint8Array"
  - "MicVAD (@ricky0123/vad-web 0.0.30) — Silero VAD legacy with setOptions runtime reconfig"
provides:
  - "AlwaysListeningEngine class com lifecycle start/stop/dispose/reconfigureVadThreshold"
  - "AlwaysListeningEngineOptions interface (vadNegativeFramesToClose + onUtteranceReady + onError)"
  - "Conversão framesToRedemptionMs (frames @ 96ms → ms) interna — encapsulada da API @ricky0123/vad-web 0.0.30"
  - "Ring buffer pre-roll 500ms automático via onFrameProcessed (alimenta ring apenas em frames PRÉ-fala)"
  - "Pipeline pronto para Plan 05 consumir: WAV completo + ring → onUtteranceReady → IPC always-listening:utterance"
affects:
  - "40-05 (AlwaysListeningStrategy main coordinator) — instancia engine no renderer via IPC, conecta onUtteranceReady → ALWAYS_LISTENING_UTTERANCE channel"
  - "40-06 (Settings UI VAD slider) — IPC ALWAYS_LISTENING_VAD_THRESHOLD chama engine.reconfigureVadThreshold em runtime"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Renderer-side composition pattern: engine compõe Wave 1 building blocks (AudioRingBuffer, IntentClassifier) sem duplicar lógica — Strategy main-side (Plan 05) não precisa conhecer detalhes do VAD"
    - "Best-effort cleanup pattern: cada try/catch no stop() é isolado — falha em destroy() do VAD não impede stream.getTracks().stop() (T-40-MIC mitigation defensiva)"
    - "Idempotent dispose via flag isDisposed: previne double-cleanup de classifier/ringBuffer; start() pós-dispose throws para falha-rápida (caller responsável de criar nova instância)"
    - "Pre-roll alimentado em onFrameProcessed apenas quando !inSpeech — evita duplicação com a utterance interna do vad-web (que já é entregue completa em onSpeechEnd)"
    - "Frame→ms conversion encapsulada em framesToRedemptionMs() — interface pública AlwaysListeningEngineOptions mantém vocabulário 'frames' (alinhado a CONTEXT.md), conversion para API real (redemptionMs) é detalhe interno"

key-files:
  created:
    - apps/desktop/src/renderer/src/voice/alwaysListening/AlwaysListeningEngine.ts
  modified:
    - apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/AlwaysListeningEngine.test.ts

key-decisions:
  - "Classifier NÃO roda no renderer por utterance: per plan NOTE em <action> e D-03 (WAV único → IPC), o classifier vive no main (Plan 05) após STT. No renderer apenas fazemos o classifier.load() pra cumprir D-13 (lazy in-memory, fica residente até dispose) e propagar load fail (D-09). Trade-off: ainda há o custo de RAM do modelo no renderer, mas evita STT no renderer (tarefa do main com whisper.cpp)."
  - "Pre-roll via onFrameProcessed em vez de AudioWorklet: vad-web já tem o hook onFrameProcessed que entrega cada frame processado (legacy frame size 1536 samples ≈96ms). Reusar esse hook é mais simples que duplicar AudioWorklet ao lado do VAD, e evita race condition entre worklet e VAD se rodassem em paralelo no mesmo stream."
  - "redemptionMs (não negativeFramesToClose) na API real: interface pública AlwaysListeningEngineOptions mantém vocabulário 'frames' por consistência com CONTEXT.md/RESEARCH.md, mas internamente convertemos para redemptionMs (frames * 96ms) — a API atual do @ricky0123/vad-web 0.0.30 expõe redemptionMs no FrameProcessorOptions, não negativeFramesToClose. Open Question A5 do RESEARCH fechada: setOptions({redemptionMs}) funciona em runtime."
  - "Idempotência preferida sobre erro: dispose() chamado duas vezes retorna sem throw (UX defensiva — caller pode chamar dispose em finally/destructor sem precisar rastrear estado). start() pós-dispose throws (intencional — caller precisa criar nova instância, ringBuffer/classifier estão limpos)."
  - "FRAME_MS_DEFAULT=96 hardcoded em vez de derivar de frameSamples: o valor 1536 samples @16kHz = 96ms é o default do vad-web legacy model. Mudar frameSamples implica reconfigurar o VAD model — é um break-change que não está no escopo do MVP. Se vier necessidade futura de frames variáveis, a constante vira parâmetro."

patterns-established:
  - "Renderer-loop-pattern: classe encapsula AudioContext + MicVAD + ring buffer + WAV encoding em api-única (start/stop/dispose/reconfigure*) — caller (Strategy main-side) só precisa orquestrar lifecycle via IPC, não tocar nos internals"
  - "Best-effort-cleanup: try/catch isolado em cada step do stop() — guarantee de mic-release mesmo em falha parcial (mitigation T-40-MIC)"
  - "Mock-class-instead-of-mockImplementation: vi.mock retornando classe real (não factory de objeto) preserva semântica `new` no caller — corrige TypeError 'is not a constructor' que aparece com object factories"

requirements-completed: [VLISTEN-01, VLISTEN-03, VLISTEN-04]

# Metrics
duration: 7min
started: 2026-04-26T14:07:01Z
completed: 2026-04-26T14:14:45Z
tasks_completed: 1
tests_added: 14
tests_passing: 14
files_created: 1
files_modified: 1
commits: 2
date_completed: "2026-04-26"
---

# Phase 40 Plan 04: AlwaysListeningEngine Compositor Summary

**AlwaysListeningEngine implementado (290 LOC + 14 testes GREEN) compondo Wave 1 building blocks (AudioRingBuffer + IntentClassifier) com Silero VAD legacy (@ricky0123/vad-web 0.0.30) — pipeline renderer-side completo MediaStream → VAD → pre-roll prepend → WAV encoding → onUtteranceReady, com reconfigureVadThreshold em runtime via setOptions e dispose idempotente.**

## What Was Built

### AlwaysListeningEngine (`AlwaysListeningEngine.ts`)

Classe compositor com lifecycle 4-stage:

1. **`start(stream)`** — inicializa AudioContext@16kHz, executa `classifier.load()` (D-13 lazy in-memory; load fail propaga para Strategy emitir voiceMode:degraded D-09), monta MicVAD reusando o stream (sem re-prompt de mic, padrão de useWakeWord.ts Phase 24).

2. **VAD callbacks**:
   - `onSpeechStart` → marca `inSpeech=true` + registra `speechStartedAt`
   - `onFrameProcessed(probs, frame)` → escreve no ring buffer **apenas se `!inSpeech`** (pre-roll = frames pré-fala; durante fala vad-web já acumula utterance internamente)
   - `onSpeechEnd(audio)` → chama `handleSpeechEnd(audio)`
   - `onVADMisfire` → reset (`inSpeech=false` + `ringBuffer.clear()`)

3. **`handleSpeechEnd(audio)`**:
   - Calcula `durationMs` — descarta se < 200ms (T-40-TIMEOUT, anti-spam clicks/ruído)
   - `ringBuffer.toArray()` (drain implícito) → snapshot pre-roll
   - Concatena `[pre-roll] + [utterance audio]` → `encodeFloat32ToWav(fullAudio, 16000)` → `Uint8Array` WAV
   - Chama `opts.onUtteranceReady(wavBuffer)` — caller (AlwaysListeningStrategy Plan 05) envia via IPC `ALWAYS_LISTENING_UTTERANCE`

4. **`stop()` / `dispose()`**:
   - `stop()` — best-effort cleanup (VAD destroy, stream.getTracks().stop(), audioContext.close()) com try/catch isolado em cada step (T-40-MIC: mic liberado mesmo em falha parcial)
   - `dispose()` — idempotente via flag `isDisposed`; chama `stop()` + `classifier.unload()` (libera modelo da RAM, D-13) + `ringBuffer.clear()` (T-40-RING)
   - `start()` pós-dispose() throws (intencional — caller cria nova instância)

### `reconfigureVadThreshold(negativeFramesToClose)` (VLISTEN-04)

Aplica novo threshold de silêncio em runtime sem reiniciar a sessão. Converte `frames * 96ms` (FRAME_MS_DEFAULT do Silero legacy) em `redemptionMs` e chama `vadSession.setOptions({ redemptionMs })`. Open Question A5 do RESEARCH.md fechada: API setOptions confirmada em `dist/real-time-vad.d.ts` do @ricky0123/vad-web 0.0.30.

Pré-`start()` apenas atualiza o valor interno (sem throw) — aplicado no próximo `start()`.

### Test File Conversion

`AlwaysListeningEngine.test.ts` foi convertido de 14 it.todo (Wave 0 scaffold) para 14 testes concretos GREEN. Mocks:

- **IntentClassifier** mockado como classe real (não factory de objeto, evita "is not a constructor" TypeError) — load/unload/classify spies controláveis por teste, evitando download de 120MB do multilingual-e5-small
- **MicVAD** mockado com instâncias capturadas em `micVADInstances[]` para inspeção e disparo manual de `onSpeechStart` / `onSpeechEnd` / `onFrameProcessed`
- **AudioContext** + **MediaStream** stubs (FakeAudioContext / FakeMediaStreamTrack) — happy-dom não implementa essas APIs

Cobertura por requisito:

| Requirement | Test count | Scenarios |
|---|---|---|
| VLISTEN-01 (VAD speech-end) | 4 | start initializes, speech-end pipeline, < 200ms discard, classifier load fail propagates |
| VLISTEN-03 (pre-roll) | 2 | concatenation prepends ring snapshot, ring cleared after each utterance |
| VLISTEN-04 (reconfigure runtime) | 2 | setOptions called with redemptionMs, pre-start no-throw |
| onUtteranceReady contract | 2 | valid WAV (RIFF/WAVE markers), NOT called for sub-200ms |
| Lifecycle (T-40-RING/MIC) | 4 | stop ends VAD + tracks, dispose unloads classifier, idempotent, start-after-dispose throws |

## Verification Performed

```bash
# Suite completa do alwaysListening — sem regressão
npx vitest run src/renderer/src/voice/alwaysListening/__tests__/ --no-coverage
# → 3 test files, 40 tests, ALL PASS

# AlwaysListeningEngine isolado
npx vitest run src/renderer/src/voice/alwaysListening/__tests__/AlwaysListeningEngine.test.ts --no-coverage
# → 14 passed (14)

# TypeScript zero erros nos arquivos novos
npx tsc --noEmit 2>&1 | grep -E "alwaysListening|AlwaysListening"
# → (sem output — zero erros)
```

### Acceptance criteria do plan

- [x] `grep "export class AlwaysListeningEngine"` — match em `AlwaysListeningEngine.ts:83`
- [x] `grep "export interface AlwaysListeningEngineOptions"` — match em `AlwaysListeningEngine.ts:51`
- [x] `grep "async reconfigureVadThreshold"` — match em `AlwaysListeningEngine.ts:231`
- [x] `grep "this.classifier.unload"` — match em `AlwaysListeningEngine.ts:293`
- [x] `grep "isDisposed"` — 4 matches (declaração + 3 usos: gate em start, gate em dispose, set em dispose)
- [x] `grep "ringBuffer\.\(clear\|toArray\)"` — 4 matches (clear em onVADMisfire, < 200ms guard, dispose; toArray em handleSpeechEnd)
- [x] `grep "encodeFloat32ToWav"` — match em import + uso em handleSpeechEnd
- [x] Testes GREEN com mocks de vad-web e encodeFloat32ToWav (encodeFloat32ToWav real, vad-web mocked)
- [x] `tsc --noEmit` zero erros em AlwaysListeningEngine.ts ou seu test file

### Threat invariants verificadas

- **T-40-VAD (Tampering):** `setOptions({redemptionMs})` chamado com valor já clamped pelo caller (Plan 05 setVadSilenceThresholdMs); engine não re-valida (evita drift). Teste explícito asserta a chamada via mock.setOptions.
- **T-40-RING (Information Disclosure):** `dispose()` chama `ringBuffer.clear()` após stop; `isDisposed` flag previne re-entrada. Teste assertando `unload` chamado uma vez mesmo em dispose duplo.
- **T-40-MIC (Denial of Service):** `stop()` chama `getTracks().forEach(t => t.stop())` em try/catch isolado de outras cleanup steps. Teste com 2 tracks valida ambos parados (`stopped=true`).
- **T-40-TIMEOUT (Business Logic):** Utterances < 200ms descartadas em `handleSpeechEnd` via `durationMs < MIN_UTTERANCE_MS` guard. Teste com 50ms confirma `onUtteranceReady` NÃO chamado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree base não correspondia a 7397fd4f (post-Wave-1)**
- **Found during:** Pre-task (worktree branch check)
- **Issue:** Worktree estava em `ac5ffbd` (Phase 39 fix WR-02), não em `7397fd4` que contém os arquivos Wave 1 (audioRingBuffer.ts, intentClassifier.ts, ipc-types.ts atualizado, store.ts atualizado, intentExamples.pt-BR.ts, AlwaysListeningEngine.test.ts scaffold). Sem essa base, o RED test falharia por motivos errados (módulos da Wave 1 ausentes em vez do esperado "AlwaysListeningEngine não existe").
- **Fix:** `git reset --hard 7397fd4f1cb32f925f1f72d452bd20c35fd2827a` — atualizou árvore + index, descartando o `ac5ffbd` que estava fora da phase 40 mainline.
- **Files affected:** Operação git — recupera 36 arquivos da Wave 1 que estavam ausentes no `ac5ffbd`.
- **Verification:** `git log --oneline -5` confirmou HEAD em 7397fd4; `ls apps/desktop/src/renderer/src/voice/alwaysListening/` mostrou audioRingBuffer.ts, intentClassifier.ts e __tests__/ scaffold pre-existentes.
- **Committed in:** N/A (operação pré-task)

### Implementation Decisions Within Plan Discretion

- **redemptionMs em vez de negativeFramesToClose na API real do @ricky0123/vad-web:** o plan menciona `negativeFramesToClose` no <interfaces> do plan herdado de pseudocódigo do RESEARCH.md, mas a API REAL do vad-web 0.0.30 expõe `redemptionMs` (em FrameProcessorOptions). Convertimos `frames * 96ms (FRAME_MS_DEFAULT) → redemptionMs` internamente via `framesToRedemptionMs(n)`. Justificativa: manter vocabulário "frames" na interface pública (caller-friendly, alinhado a CONTEXT.md "negativeFramesToClose") e converter no boundary. Isolamento da quirk de API.

- **Classifier NÃO classifica per-utterance no renderer:** o plan tem uma seção REVIEW ARQUITETURAL extensa em <action> debatendo Opção A (renderer envia WAV → main classifica) vs Opção B (renderer classifica). Final do plan recomenda Opção A: "Chamar `opts.onUtteranceReady(wavBuffer)` SEMPRE (sem classifier no renderer para MVP). O classifier roda no main (Plan 05) após STT — conforme D-03". Implementei seguindo essa recomendação. Classifier.load() ainda roda em start() para cumprir D-13 (lazy load + load fail propagado D-09), mas classify() vive no main (Plan 05).

- **onFrameProcessed gate `!inSpeech`:** decisão pra evitar duplicação. Vad-web já entrega o utterance audio completo em `onSpeechEnd` — alimentar o ring buffer durante speech significaria que `concatenateAudio(ringSnapshot, utteranceAudio)` teria sobreposição. Solução: ring buffer só captura frames PRÉ-fala (rolling window), `onSpeechEnd` traz a utterance pura. Concatenação resulta em "últimos N ms antes da fala + fala completa".

- **MockIntentClassifier como classe real (não factory de objeto):** primeira tentativa do test usava `vi.fn().mockImplementation(() => ({load,unload,classify}))`, mas vitest reportava `TypeError: ... is not a constructor` — vi.fn não é construtível por padrão. Solução: `class MockIntentClassifier { load = mockFn; unload = mockFn; classify = vi.fn(); }` — preserva semântica `new` no caller (engine usa `new IntentClassifier(opts)`).

---

**Total deviations:** 1 auto-fixed (1 blocking, pre-task git operation).
**Impact on plan:** Zero scope creep. Os 3 itens em "Implementation Decisions Within Plan Discretion" são todos refinamentos dentro da margem do plan (`<action>` parágrafo "verificar API exata", "SIMPLIFICAR o handleSpeechEnd" e o Review Arquitetural).

## Authentication / Network Gates

Nenhum encontrado. Test runs offline (mocks de @xenova/transformers e @ricky0123/vad-web). Modelo multilingual-e5-small NÃO foi baixado (Plan 40-05 lida com pre-download em background no main process via D-15).

## Known Stubs

Nenhum stub. Pipeline está completo end-to-end:

- `start(stream)` → AudioContext + classifier.load() + MicVAD pronto
- VAD callbacks → ring buffer atualizado + utterance entregue
- `handleSpeechEnd` → WAV encode + onUtteranceReady() chamado
- `reconfigureVadThreshold(n)` → setOptions({redemptionMs}) ao vivo
- `stop()` / `dispose()` → cleanup completo

`onError` é callback genérico do `opts` — invocado em encode failure dentro de handleSpeechEnd. Não é stub (semântica clara, sem hard-coded ""), apenas raramente invocado em produção.

`opts.onUtteranceReady(wavBuffer)` é chamado SEM passar pelo classifier no renderer — isto é INTENCIONAL e documentado (D-03 + plan NOTE). O classifier.classify() roda no main (Plan 05). Não é stub porque o design é assim.

## Threat Flags

Nenhuma surface adicional além das mapeadas em `<threat_model>` do plan. Os 4 threats T-40-VAD, T-40-RING, T-40-MIC, T-40-TIMEOUT estão todos com mitigações implementadas + cobertura de teste.

## Performance Notes

- **AudioContext close() async:** stop() faz `await audioContext.close()` — em prod isso pode levar ~5-50ms (browser engine). Best-effort try/catch impede que falha bloqueie o cleanup do mic e do VAD.
- **Ring buffer write em onFrameProcessed:** ~96ms entre frames; cada `write(frame)` é O(frameSize) = O(1536). Capacity 16000 (= 2x pre-roll), portanto rolling window estável após ~167ms de uso.
- **WAV encoding latency:** `encodeFloat32ToWav` é O(samples). Para utterance de 1s @ 16kHz = 16000 samples + 8000 pre-roll = 24000 samples → ~24KB WAV. Encoding síncrono em ~1-3ms typical.
- **Classifier.load() bloqueio em start():** RESEARCH.md mede 200-500ms cold start em SSD; Plan 40-05 lida com pre-download em background pra mitigar primeira utterance latency (D-15).

## Next Steps (out of scope — handled in subsequent plans)

- **Plan 40-05 (Wave 3): AlwaysListeningStrategy main coordinator** — instancia engine no renderer via IPC ALWAYS_LISTENING_START, escuta ALWAYS_LISTENING_UTTERANCE, roda STT (whisper.cpp) → IntentClassifier.classify(transcript, sttConfidence) no main → se hasIntent, despacha pro voiceHandler.handleAudio. Pre-download de modelo em background após app.whenReady().
- **Plan 40-06 (Wave 3): Settings UI VAD slider** — slider 300-800ms aplica via setVadSilenceThresholdMs no store + IPC ALWAYS_LISTENING_VAD_THRESHOLD chama engine.reconfigureVadThreshold em runtime.

## Self-Check: PASSED

**Files verified:**
- FOUND: `apps/desktop/src/renderer/src/voice/alwaysListening/AlwaysListeningEngine.ts` (created)
- FOUND: `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/AlwaysListeningEngine.test.ts` (modified — was scaffold)

**Commits verified:**
- FOUND: `5041d02` — `✅ test(40-04): adicionar testes RED para AlwaysListeningEngine` (RED phase)
- FOUND: `3ad67b9` — `✨ feat(40-04): implementar AlwaysListeningEngine compositor (VAD + ring buffer + WAV)` (GREEN phase)

**Acceptance criteria verified:** all 9 grep checks + 14 tests GREEN + zero TS errors in AlwaysListeningEngine* files.

---
*Phase: 40-always-listening-intent-classifier*
*Plan: 04*
*Completed: 2026-04-26*
