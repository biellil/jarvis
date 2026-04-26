---
phase: 40-always-listening-intent-classifier
plan: 01
subsystem: testing
tags: [vitest, test-scaffold, nyquist, wave-0, always-listening, intent-classifier, pt-br, ring-buffer, vad]

requires:
  - phase: 39-voice-mode-state-machine
    provides: VoiceCaptureStrategy interface + VoiceModeChangeEvent type — testes do main coordinator espelham contrato Phase 39
provides:
  - 4 test scaffolds com it.todo cobrindo VLISTEN-01..04 (audioRingBuffer, intentClassifier, AlwaysListeningEngine renderer, AlwaysListeningStrategy main)
  - Fixtures pt-BR (15 positivos + 10 negativos) servindo de oracle para o classifier nas Waves 1-3
  - Diretório alwaysListening/ scaffolded em renderer + main para receber implementações futuras
  - Threat coverage executável em Wave 0: T-40-RING, T-40-INTENT, T-40-DEGRADE, T-40-TIMEOUT, T-40-VAD, T-40-MODEL-DL referenciados em describe/it labels
affects: [40-02 audioRingBuffer impl, 40-03 intentClassifier impl, 40-04 AlwaysListeningEngine impl, 40-05 AlwaysListeningStrategy impl, 40-06 Settings IPC]

tech-stack:
  added: []
  patterns:
    - "Wave 0 (Nyquist) test scaffold: it.todo + comentário de Wave de implementação para todo módulo planejado"
    - "Fixtures JSON co-localizadas com testes em __tests__/fixtures/ — import direto via path relativo"
    - "Threat IDs referenciados nos describe headers — torna mitigation rastreável no test runner"

key-files:
  created:
    - apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/AlwaysListeningEngine.test.ts
    - apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/intentClassifier.test.ts
    - apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/audioRingBuffer.test.ts
    - apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/fixtures/intent-pt-br.json
    - apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts
  modified: []

key-decisions:
  - "Scaffolds usam it.todo (não it.skip) — vitest reporta como TODO no output e não conta como falha; Wave seguinte converte em it() ao implementar"
  - "Imports dos módulos Phase 40 ainda não existentes ficam em comentário (// Wave N vai descomentar) — evita erros 'module not found' antes da Wave de implementação"
  - "Fixtures pt-BR mantidas em JSON puro (não TypeScript) — facilita expansão pela Wave 1 sem precisar mexer no test file"
  - "describe headers carregam VLISTEN-XX e T-40-XXX — busca por requirement ou threat ID no test runner localiza diretamente o cenário"

patterns-established:
  - "Padrão Wave 0 scaffold: header docstring lista requisitos VLISTEN-XX cobertos + threat IDs T-40-XXX mitigados + Wave de implementação esperada"
  - "Fixtures co-localizadas: __tests__/fixtures/*.json importadas com path relativo do test file (consistente com vitest resolveJsonModule default)"
  - "Threat coverage no scaffold: cada describe que cobre threat documenta o ID e o cenário de mitigation que será testado quando o impl chegar"

requirements-completed: [VLISTEN-01, VLISTEN-02, VLISTEN-03, VLISTEN-04]

duration: 8min
completed: 2026-04-26
---

# Phase 40 Plan 01: Test Scaffolds Always-Listening (Wave 0 Nyquist) Summary

**5 test scaffold files com 88 it.todo cobrindo VLISTEN-01..04 + 6 threat IDs Phase 40, prontos para as Waves 1-3 converterem em testes verdes durante implementação.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-26T13:34:00Z
- **Completed:** 2026-04-26T13:42:09Z
- **Tasks:** 2/2
- **Files created:** 5

## Accomplishments

- 4 arquivos de teste vitest discoverable (88 todos no total) servindo como contrato executável das Waves 1-3
- Fixtures pt-BR (15 positivos + 10 negativos) atendendo VLISTEN-02 accuracy oracle — bias contra English-only mitigado já no Wave 0 (T-40-INTENT)
- Threat coverage rastreável: T-40-RING, T-40-INTENT, T-40-DEGRADE, T-40-TIMEOUT, T-40-VAD e T-40-MODEL-DL referenciados em describe/it labels — Waves seguintes herdam a obrigação de transformá-los em assertions reais

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Fixtures pt-BR + 3 test scaffolds do renderer** — `d27c973` (test)
2. **Task 2: Test scaffold do main coordinator (Strategy + IPC + Settings)** — `abafa1b` (test)

_Note: ambas as tasks são puramente test scaffold (Wave 0 Nyquist) — sem implementação real, todos os it usam `it.todo`._

## Files Created/Modified

- `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/fixtures/intent-pt-br.json` — Fixtures pt-BR (15 positivos + 10 negativos) usadas pelo intentClassifier.test.ts via import relativo
- `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/audioRingBuffer.test.ts` — 13 it.todo cobrindo VLISTEN-03 + T-40-RING (capacity, circular write, drain, clear reuse, memory safety getSize<=capacity)
- `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/intentClassifier.test.ts` — 16 it.todo + forEach gera +25 (15+10 fixtures) cobrindo VLISTEN-02 + T-40-INTENT/T-40-TIMEOUT (load, classify, threshold 0.6, sttConfidence pre-filter D-08, timeout 300ms send-anyway D-10, unload)
- `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/AlwaysListeningEngine.test.ts` — 15 it.todo cobrindo VLISTEN-01+VLISTEN-03 + T-40-VAD/T-40-RING (start/VAD onSpeechEnd, pre-roll concatenation, onUtteranceReady, reconfigureVadThreshold, dispose idempotência)
- `apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts` — 24 it.todo cobrindo VLISTEN-01/VLISTEN-04 + D-01/D-04/D-09/D-15/D-16 + T-40-VAD/T-40-DEGRADE/T-40-MODEL-DL (Strategy interface, IPC lifecycle, degraded event, vad-threshold clamp 300-800, settings:get vadSilenceThresholdMs default 500, scheduleModelPreDownload background)

## Decisions Made

- **Wave 0 scaffold via `it.todo` (não `it.skip` nem mocks completos)** — vitest discovery mostra os cenários previstos sem ruído de "falha de implementação" e sem precisar de stubs vazios. Quando a Wave 1 chegar para audioRingBuffer.ts, o test runner mostrará claramente quais it.todo precisam virar it() reais.
- **Imports de módulos Phase 40 comentados** — evita "module not found" enquanto os arquivos não existem; cada arquivo de teste tem comentário `// Wave N vai descomentar:` apontando para o plan responsável.
- **Fixtures pt-BR em JSON puro** — facilita expansão pela Wave 1 (basta editar o JSON) e simplifica reuso por outros testes futuros (e.g., E2E de Wave 3).
- **Threat IDs nos describe headers** — torna o test output rastreável: `grep "T-40-RING" test-output` localiza diretamente os cenários de memory safety; Waves seguintes não podem "esquecer" o threat porque está embedado no nome do describe.

## Deviations from Plan

None - plan executado exatamente como escrito.

## Authentication Gates

Nenhum gate de autenticação encontrado — Wave 0 é puramente test scaffold local (sem chamadas externas).

## Self-Check: PASSED

**Files verified:**
- FOUND: apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/AlwaysListeningEngine.test.ts
- FOUND: apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/intentClassifier.test.ts
- FOUND: apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/audioRingBuffer.test.ts
- FOUND: apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/fixtures/intent-pt-br.json
- FOUND: apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts

**Commits verified:**
- FOUND: d27c973 (Task 1)
- FOUND: abafa1b (Task 2)

**Vitest discovery verified:** `npx vitest run src/renderer/src/voice/alwaysListening src/main/__tests__/voiceMode/alwaysListening.test.ts` reporta 4 test files, 88 todos sem erro de parsing.

**Acceptance criteria verified:**
- 15 positivos / 10 negativos no fixture (Python json.load assertion)
- 4 arquivos com pelo menos 10 it.todo cada (audioRingBuffer 13, intentClassifier 16+25=41 com forEach, AlwaysListeningEngine 15, alwaysListening main 24)
- Todos os threat IDs do plan presentes em arquivos de teste
- VLISTEN-01..04 referenciados em describe headers

## Notes for Future Phases

- **Wave 1 (40-02 audioRingBuffer + 40-03 intentClassifier):** descomentar imports `// import { AudioRingBuffer } from '../audioRingBuffer'` e `// import { IntentClassifier } from '../intentClassifier'` nos respectivos arquivos. Converter `it.todo` em `it()` à medida que cada comportamento for implementado. Fixtures pt-BR já estão prontas como oracle.
- **Wave 2 (40-04 AlwaysListeningEngine + 40-05 AlwaysListeningStrategy):** descomentar imports na engine renderer e na strategy main. Mocks de AudioContext/MediaStream podem reusar o padrão estabelecido em WakeWordEngine.test.ts (FakeAudioContext + FakeAudioWorklet).
- **Wave 3 (40-06 IPC + Settings):** o describe `IPC handler: settings:get — vadSilenceThresholdMs field` já documenta o contrato — ao adicionar o campo no Settings response da Phase 34, basta seguir o describe para garantir compatibilidade reversa (default 500 quando store vazio).
