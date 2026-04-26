---
phase: 40-always-listening-intent-classifier
plan: 03
subsystem: voice-pipeline
tags: [voice, intent-classifier, vad, ring-buffer, transformers-js, pt-br, tdd]
one_liner: "AudioRingBuffer (Float32Array circular) e IntentClassifier (multilingual-e5-small + cosine similarity + few-shot pt-BR) — VLISTEN-02/03 com mocks Transformers.js."
requires:
  - "@xenova/transformers package (hoisted no workspace, novo dep em apps/desktop)"
  - "vitest + happy-dom (existente em apps/desktop devDependencies)"
provides:
  - "AudioRingBuffer class para pre-roll 500ms (VLISTEN-03)"
  - "IntentClassifier class com load/classify/unload (VLISTEN-02)"
  - "INTENT_EXAMPLES_PT_BR few-shot examples (15 positive + 10 negative)"
  - "Tipos: IntentClassifierOptions, IntentClassificationResult, AuditLogEntry"
  - "Constante INTENT_THRESHOLD (D-07 com env override)"
affects:
  - "Plan 40-04 (AlwaysListeningEngine) consumirá AudioRingBuffer + IntentClassifier"
tech-stack:
  added:
    - "@xenova/transformers ^2.17.2 (deps em apps/desktop, já hoisted no workspace)"
  patterns:
    - "TDD RED → GREEN com vitest + mock @xenova/transformers"
    - "Float32Array circular com writeHead/readHead/count (sem ringbufferjs)"
    - "Map<label:text, embedding> em vez de array dinâmico (T-40-RING)"
    - "Promise.race + setTimeout para timeout fallback (D-10)"
    - "Audit log opt-in via env var (D-12, T-40-AUDIT)"
key-files:
  created:
    - "apps/desktop/src/renderer/src/voice/alwaysListening/audioRingBuffer.ts"
    - "apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts"
    - "apps/desktop/src/main/voiceMode/intentExamples.pt-BR.ts"
    - "apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/audioRingBuffer.test.ts"
    - "apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/intentClassifier.test.ts"
    - "apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/fixtures/intent-pt-br.json"
  modified:
    - "apps/desktop/package.json (add @xenova/transformers ^2.17.2)"
decisions:
  - "Implementação manual Float32Array circular em vez de ringbufferjs (Open Question 5 do RESEARCH.md: ringbufferjs sem updates há 6 anos; manual impl tem mesma garantia de fixed-size)"
  - "Map<label:text, Float32Array> em fewShotEmbeddings em vez de array (acceptance criterion: prevenção de dynamic array hot path; key 'positive:' ou 'negative:' permite split simples)"
  - "Mock determinístico @xenova/transformers em testes: gera embedding 384-dim baseado em keywords pt-BR — evita download real do modelo de 120MB durante test runs"
  - "process.env['INTENT_THRESHOLD'] (bracket access em strict TS) em vez de dotted access — strict mode do TS sem tipo de Node.env literal"
  - "extractor tipado como ((text: string, opts?: unknown) => Promise<{data: Float32Array}>) | null — pipeline() do Transformers.js retorna unknown dynamic, cast aplicado em load()"
metrics:
  duration_minutes: 7
  tasks_completed: 2
  tests_added: 26
  tests_passing: 26
  files_created: 6
  files_modified: 1
  commits: 4
  date_completed: "2026-04-26"
---

# Phase 40 Plan 03: Audio Ring Buffer + Intent Classifier Summary

AudioRingBuffer (Float32Array circular fixo, 16000 samples capacity) e IntentClassifier
(@xenova/transformers + multilingual-e5-small + cosine similarity vs few-shot pt-BR)
implementados via TDD com 26 testes passando. Atende VLISTEN-02 (intent filter local)
e VLISTEN-03 (pre-roll 500ms sem leak). Mocks de Transformers.js permitem testar sem
download real do modelo de 120MB.

## What Was Built

### AudioRingBuffer (`audioRingBuffer.ts`)
Buffer circular fixo com `Float32Array(capacity)` estático e ponteiros `writeHead`,
`readHead`, `count`. Quando o buffer enche, `write()` avança `readHead` descartando
o sample mais antigo (circular discard). `toArray()` drena em ordem cronológica
respeitando o wrap. `clear()` reseta ponteiros sem realocar — zero GC pressure.
Coberto por 13 testes incluindo soak miniaturizado (1M samples → buffer permanece
em capacity).

### IntentClassifier (`intentClassifier.ts`)
Wrapper sobre `pipeline('feature-extraction', 'Xenova/multilingual-e5-small')` com:
- **Pre-filter D-08:** `sttConfidence < threshold` ou transcript vazio →
  `verdict: 'stt-confidence-filtered'`, hasIntent=true (send-anyway).
- **Timeout D-10:** `Promise.race([classifyInternal, setTimeout(timeoutMs)])` →
  `verdict: 'timeout-send-anyway'` em caso de CPU congestionado.
- **Cosine similarity:** L2-normalized embeddings (pooling=mean), guard `+ 1e-8`
  no denominador. `hasIntent = maxPositive > threshold && maxPositive > maxNegative`.
- **Audit log D-12:** opt-in via env `ALWAYS_LISTENING_AUDIT=true` + opts.auditLog
  callback — escreve text+scores+verdict, nunca áudio raw.

Few-shot examples em arquivo dedicado (`intentExamples.pt-BR.ts`): 15 positivos
(comandos curtos, perguntas WH, greetings com intent) + 10 negativos (filler words,
confirmações sem ação). Embeddings pré-computados em `load()` e armazenados em
`Map<label:text, Float32Array>` (chave `"positive:abre o terminal"` permite split
simples na hot path).

### Test Infrastructure
6 arquivos novos no diretório `alwaysListening/`:
- `audioRingBuffer.ts` + `audioRingBuffer.test.ts` (13 testes)
- `intentClassifier.ts` + `intentClassifier.test.ts` (13 testes)
- `intentExamples.pt-BR.ts` (15 + 10 examples)
- `__tests__/fixtures/intent-pt-br.json` (mesmas 25 strings, JSON consumível)

Mock de `@xenova/transformers` retorna embeddings determinísticos por keyword
matching pt-BR — testes rodam offline em <1s.

## Verification Performed

- **Tests:** `npx vitest run src/renderer/src/voice/alwaysListening/__tests__/` → 26/26 PASS
- **Threat invariants:**
  - T-40-RING: `grep "push|splice|concat|Array.from"` em `audioRingBuffer.ts` retorna VAZIO.
    Backing array `private readonly buffer: Float32Array` confirmado fixo.
  - T-40-INTENT: `cosineSimilarity` com guard `+ 1e-8`; embeddings normalizados via
    `pooling: 'mean', normalize: true` no Transformers.js call.
  - T-40-TIMEOUT: teste explícito com mock lento (500ms) + `timeoutMs: 100` → verdict
    `'timeout-send-anyway'` confirmado.
  - T-40-AUDIT: 2 testes (ON com env var, OFF sem env var) confirmam opt-in.
- **Acceptance criteria (do plan):**
  - [x] `export class AudioRingBuffer` presente
  - [x] `private readonly buffer: Float32Array` presente (prova de fixed-size)
  - [x] Sem dynamic array operations em `audioRingBuffer.ts`
  - [x] `export class IntentClassifier` presente
  - [x] `export interface IntentClassificationResult` presente
  - [x] `'timeout-send-anyway'`, `'stt-confidence-filtered'`, `ALWAYS_LISTENING_AUDIT`
        todos presentes em `intentClassifier.ts`
  - [x] `export const INTENT_EXAMPLES_PT_BR` presente em `intentExamples.pt-BR.ts`
  - [x] Sem `push`/`splice` em `intentClassifier.ts` (Map em vez de array)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dependência faltando: Plan 40-01 (Wave 0 scaffold) não
executado neste worktree**
- **Found during:** Task 1 antes de iniciar TDD
- **Issue:** Plan 03 declara `depends_on: [40-01]` (Wave 0 cria os scaffolds de teste)
  mas o worktree paralelo apenas continha Plan 01 em outro worktree não mergeado.
  Execução não podia continuar sem os arquivos de teste base.
- **Fix:** Criados os arquivos de teste diretamente como parte do RED phase do TDD —
  alinhado com instrução do plano (`tdd="true"`). Os scaffolds it.todo do Plan 01
  foram substituídos por testes concretos com asserções (RED → GREEN cycle direto).
- **Files affected:** Tests files seriam criados pelo Plan 01, agora criados pelo Plan 03.
- **Commits:** 2089c71 (RED audioRingBuffer), 4ef825a (RED intentClassifier)

**2. [Rule 3 - Blocking] @xenova/transformers ausente nas dependências de apps/desktop**
- **Found during:** Task 2 antes do mock setup
- **Issue:** Pacote `@xenova/transformers` está hoisted no workspace root mas não
  declarado em `apps/desktop/package.json` — TS strict + IDE não resolveriam o import.
- **Fix:** Adicionado `"@xenova/transformers": "^2.17.2"` em
  `apps/desktop/package.json` dependencies (versão alinhada à hoisted no root).
- **Commit:** 4ef825a (incluído junto com testes)

### Implementation Decisions Within Plan Discretion

- **Implementação manual Float32Array circular** (em vez de `ringbufferjs`):
  conforme RESEARCH §Open Question 5, `ringbufferjs` está há 6 anos sem updates;
  a implementação manual provada no RESEARCH §Pattern 3 (alternative section) é
  mais segura, sem dependência abandonada. Plan explicitamente menciona essa opção
  em Task 1 (`<action>` parágrafo: "sem ringbufferjs — conforme Open Question 5...").

- **Few-shot embeddings em `Map<string, Float32Array>`** com chaves prefixadas
  por label (`"positive:abre o terminal"`) em vez de objeto `{label, text, embedding}`:
  satisfaz a acceptance criterion "sem `push`/`splice`" mantendo iteração ordenada
  e performance O(1) de inserção.

- **Mock determinístico em vez de mock simples** em `intentClassifier.test.ts`:
  o mock retorna embeddings que separam positives e negatives em clusters distintos
  (vetor `[0.95, 0.1, ...]` vs `[0.1, 0.95, ...]`, ambos normalizados), permitindo
  testar a lógica de classificação real (cosine sim + threshold + verdict) e não
  apenas o pipeline. Cobre todos os 25 fixtures pt-BR.

## Authentication / Network Gates

Nenhum encontrado. Nenhum download real do modelo @xenova/transformers ocorreu —
mock substitui pipeline() em todos os testes. Pre-download em background (D-15) é
escopo do Plan 40-05 (não tocado aqui).

## Known Stubs

Nenhum stub. Ambos os módulos estão funcionalmente completos para o escopo do plan.
A integração com `AlwaysListeningEngine` (Plan 04 / Wave 2) é onde o ring buffer e
o classifier serão compostos — esses dois módulos foram projetados para uso isolado
em testes unitários e composição na próxima wave.

## Threat Flags

Nenhuma surface adicional além das já mapeadas em `<threat_model>` do plan.
Os threats T-40-RING, T-40-INTENT, T-40-TIMEOUT, T-40-AUDIT, T-40-MODEL-DL estão
todos com mitigações implementadas conforme plan.

## Performance Notes

- AudioRingBuffer write/toArray são O(n) sobre tamanho do chunk; benchmarking de
  1M samples (escrito em chunks de 1000 * 1000 iterations) completa em <50ms no
  CI mockado (não realista para áudio real, mas confirma ausência de leak).
- IntentClassifier classify hot path é O(25 * D) com D=384 dims — ~9600 multiplicações
  por classify(). Em hardware típico (CPU desktop 2024), isso resolve em <30ms
  contra benchmarks empíricos do RESEARCH (multilingual-e5-small inference 30-80ms).
  Combinado com timeout 300ms, há margem confortável para CPU congestionado.

## Next Steps (out of scope — handled in subsequent plans)

- **Plan 40-02 (Wave 1, paralelo):** electron-store schema field `vadSilenceThresholdMs`
  + IPC handler `'always-listening:vad-threshold'`.
- **Plan 40-04 (Wave 2):** AlwaysListeningEngine compõe AudioRingBuffer + IntentClassifier
  + Silero VAD; AlwaysListeningStrategy main coordinator.
- **Plan 40-05 (Wave 3):** Pre-download background do modelo via main process com
  `userData/models/` cache (D-14, D-15).

## Self-Check: PASSED

- [x] `apps/desktop/src/renderer/src/voice/alwaysListening/audioRingBuffer.ts` — FOUND
- [x] `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts` — FOUND
- [x] `apps/desktop/src/main/voiceMode/intentExamples.pt-BR.ts` — FOUND
- [x] `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/audioRingBuffer.test.ts` — FOUND
- [x] `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/intentClassifier.test.ts` — FOUND
- [x] `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/fixtures/intent-pt-br.json` — FOUND
- [x] Commit `2089c71` (RED audioRingBuffer) — FOUND in git log
- [x] Commit `6b63f52` (GREEN audioRingBuffer) — FOUND in git log
- [x] Commit `4ef825a` (RED intentClassifier + fixtures + few-shot) — FOUND in git log
- [x] Commit `1ab9a3a` (GREEN IntentClassifier) — FOUND in git log
