---
phase: 24
slug: wake-word-full-pipeline-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (renderer + backend-ts) |
| **Config file** | apps/desktop/vitest.config.ts, apps/backend-ts/vitest.config.ts |
| **Quick run command** | `pnpm --filter desktop test -- --run` |
| **Full suite command** | `pnpm -r test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command (scoped to touched package)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*To be filled by gsd-planner as tasks are defined. Each task must map to a test or explicit Wave 0 dependency.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | WAKE-05 / WAKE-06 | — | — | unit + integration | `pnpm test` | ⬜ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.test.ts` — stubs for WAKE-05 (shared pipeline happy path + error paths)
- [ ] `apps/desktop/src/renderer/hooks/useWakeWord.test.ts` — stubs for WAKE-06 (VAD integration + max recording timeout)
- [ ] `apps/backend-ts/src/voice/tts/murf.test.ts` — stubs for Murf TTS provider (D-04)
- [ ] Install `@ricky0123/vad-web` in `apps/desktop` if missing

*If frameworks already exist the Wave 0 tasks only cover new files + new dep install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E2E com mic real em pt-BR: "Hey JARVIS, que horas são?" → ouve resposta do LLM | Success Criterion #1 | Exige hardware de microfone + áudio alto-falante real, voz humana pt-BR, avaliação subjetiva de qualidade TTS | 1) Iniciar backend-ts com `TTS_PROVIDER=murf` e `MURF_API_KEY` válido. 2) Abrir desktop app em idle. 3) Dizer "Hey JARVIS, que horas são?" em voz normal. 4) Observar orb: wake burst → listening → processing → responding. 5) Ouvir resposta pt-BR via TTS. 6) Orb retorna a idle em <5s percebidos. |
| Degradação gracioso TTS → texto (D-06) | D-06 | Exige forçar `audioBase64` vazio em runtime real e confirmar UX | 1) Com backend, retornar `audioBase64: ''` temporariamente. 2) Disparar wake word + pergunta. 3) Confirmar que o texto da resposta aparece no chat sem toast de erro e orb volta a idle. |
| Error recovery com backend down | D-08 | Requer derrubar processo real do backend | 1) Matar backend-ts. 2) Disparar wake word + pergunta. 3) Confirmar toast "JARVIS offline. Verifique o backend." e orb retorna a idle com flash vermelho. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
