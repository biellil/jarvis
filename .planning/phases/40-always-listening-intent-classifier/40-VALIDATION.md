---
phase: 40
slug: always-listening-intent-classifier
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of truth for test categories: `40-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + @testing-library/react (consistent com fases 35–39 do desktop app) |
| **Config file** | `apps/desktop/jest.config.js` (verificar existência em Wave 0; criar se ausente) |
| **Quick run command** | `npm test --prefix apps/desktop -- --testPathPattern=alwaysListening --no-coverage` |
| **Full suite command** | `npm test --prefix apps/desktop -- --coverage` |
| **Estimated runtime** | ~30–60 segundos (full suite), ~5–10s (quick) |

---

## Sampling Rate

- **After every task commit:** Run `npm test --prefix apps/desktop -- --testPathPattern=alwaysListening --no-coverage` (quick unit tests only)
- **After every plan wave:** Run `npm test --prefix apps/desktop -- --coverage` (full suite incluindo integration)
- **Before `/gsd-verify-work`:** Full suite green + manual 3-environment acoustic test (quiet / kitchen / outdoor) com 5+ utterances cada
- **Max feedback latency:** 60 segundos

---

## Per-Task Verification Map

> Tasks IDs preenchidos pelo gsd-planner em cada PLAN.md. Esta tabela é o esqueleto — o checker valida cobertura completa.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 40-XX-01 | XX | 0 | — | — | Test scaffolding (Wave 0 gap) | unit | `npm test --prefix apps/desktop -- AlwaysListeningEngine.test` | ❌ W0 | ⬜ pending |
| 40-XX-02 | XX | 0 | — | — | Test scaffolding (Wave 0 gap) | unit | `npm test --prefix apps/desktop -- intentClassifier.test` | ❌ W0 | ⬜ pending |
| 40-XX-03 | XX | 0 | — | — | Test scaffolding (Wave 0 gap) | unit | `npm test --prefix apps/desktop -- audioRingBuffer.test` | ❌ W0 | ⬜ pending |
| 40-XX-04 | XX | 1 | VLISTEN-01 | T-40-VAD | VAD detecta speech-end no range 300–800ms; emite onSpeechEnd callback | unit + integration | `npm test --prefix apps/desktop -- AlwaysListeningEngine.test -t "VAD speech-end"` | ❌ W0 | ⬜ pending |
| 40-XX-05 | XX | 1 | VLISTEN-02 | T-40-INTENT | Classifier devolve `{hasIntent, score}` binário; cosine-sim > 0.6 → intent; ruído ambiente é descartado | unit + smoke | `npm test --prefix apps/desktop -- intentClassifier.test -t "multilingual-e5 classify"` | ❌ W0 | ⬜ pending |
| 40-XX-06 | XX | 1 | VLISTEN-03 | T-40-RING | Ring buffer 500ms (8000 samples @ 16kHz) preserva pre-roll, fixed-size, sem leak | unit | `npm test --prefix apps/desktop -- audioRingBuffer.test -t "fixed-size circular"` | ❌ W0 | ⬜ pending |
| 40-XX-07 | XX | 2 | VLISTEN-04 | T-40-CONFIG | Settings slider 300–800ms aplicado runtime via IPC sem restart; clamp validado | integration + e2e | `npm test --prefix apps/desktop -- settings.test -t "vad-threshold"` + manual UI test | ❌ W0 | ⬜ pending |
| 40-XX-08 | XX | 2 | — | T-40-DEGRADE | Classifier load-fail emite `voiceMode:degraded`; fallback path mantém último modo funcional | unit | `npm test --prefix apps/desktop -- voiceModeDegrade.test -t "classifier load fail"` | ❌ W0 | ⬜ pending |
| 40-XX-09 | XX | 2 | — | T-40-TIMEOUT | Inference timeout 300ms → send-anyway path executa, log warn estruturado | unit | `npm test --prefix apps/desktop -- intentClassifier.test -t "300ms timeout"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/AlwaysListeningEngine.test.ts` — stubs para VLISTEN-01 (VAD speech-end + pre-roll + ring drain)
- [ ] `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/intentClassifier.test.ts` — stubs para VLISTEN-02 (multilingual-e5-small classify, threshold 0.6, pt-BR fixtures, timeout path)
- [ ] `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/audioRingBuffer.test.ts` — stubs para VLISTEN-03 (fixed-size circular, no leaks, pre-roll size)
- [ ] `apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts` — stubs para IPC contract + Settings slider integration (VLISTEN-04) + degrade event
- [ ] Verificar `apps/desktop/jest.config.js` — instalar `jest @testing-library/react @types/jest` apenas se ausente
- [ ] Fixtures pt-BR: `apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/fixtures/intent-pt-br.json` (10–15 positivos + 8–10 negativos para teste de classifier)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Acoustic robustness em 3 ambientes (quiet / kitchen / outdoor) | VLISTEN-02 + VLISTEN-04 | Requer captura de áudio real em ambientes diversos; impossível automatizar sem perda de fidelidade | Em cada ambiente: 5+ utterances de comando + 3+ minutos de ruído ambiente; logar VAD score + classifier score; verificar 0 falsos positivos durante ruído e 0 falsos negativos durante comandos |
| Cold-start UX (1ª utterance após mode switch) | VLISTEN-02 (D-13/D-15) | Latência percebida pelo usuário não é mensurável só com timer — requer feedback humano | Trocar pra always-listening com app frio; falar comando imediatamente; verificar resposta dentro de 500ms (send-anyway timeout) ou logs explicando atraso |
| Ajuste real-time do slider VAD em Settings | VLISTEN-04 | UX de "muda sem restart" precisa ser sentida — slider responsivo, sem freezes | Abrir Settings, mover slider de 300→500→800ms enquanto always-listening está ativo; falar comando após cada mudança; confirmar comportamento de detecção mudou sem restart visível |
| `voiceMode:degraded` toast UX (Phase 41 consumer) | D-09/D-16 | Phase 41 ainda não existe — verificar manualmente que evento é emitido com payload correto | Forçar classifier load fail (renomear modelo no userData) → trocar pra always-listening → verificar logs do evento; toast UX validado quando Phase 41 implementar consumer |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 test files + fixtures pt-BR)
- [ ] No watch-mode flags (`--watch`, `--watchAll` proibidos)
- [ ] Feedback latency < 60s (full suite) / < 10s (quick)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner fills Per-Task Map com IDs reais)

**Approval:** pending
