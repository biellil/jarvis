---
phase: 24
slug: wake-word-full-pipeline-integration
type: uat
created: 2026-04-11
status: approved
approver: user
---

# Phase 24 — User Acceptance Test

**Goal:** Provar end-to-end que o loop wake word → STT → LLM → TTS → idle fecha corretamente em ambiente real, com microfone físico, voz humana em pt-BR, e Murf.ai como TTS provider.

**Pré-requisitos:**

- [ ] Backend-ts rodando com `TTS_PROVIDER=murf` e `MURF_API_KEY` válido no `.env`
- [ ] Gateway (Express) rodando em :3000
- [ ] LM Studio rodando em localhost:1234 com modelo carregado (qualquer modelo pt-BR capaz)
- [ ] Desktop app rodando via `pnpm --filter @jarvis/desktop dev`
- [ ] Microfone físico conectado e testado via OS settings
- [ ] `wakeWordPaused === false` no store (tray menu "Resume listening" se necessário)
- [ ] Orb visível em estado `idle` com wake word ATIVO (glow normal, não dimmed)

---

## Success Criteria (do ROADMAP §Phase 24)

### SC-1: Happy path — wake word → pergunta → resposta TTS

**Steps:**
1. Com orb em idle, dizer em voz normal: **"Hey JARVIS, que horas são?"**
2. Observar orb: wake burst (amber ring, ~350ms)
3. Observar orb transicionar para `listening` (laranja pulsante)
4. Esperar o VAD Silero detectar fim da fala (~1.4s após terminar a pergunta — defaults da lib)
5. Observar orb transicionar para `processing`
6. Observar orb transicionar para `responding`
7. Ouvir resposta em pt-BR via voz Heitor (Murf)
8. Observar orb retornar a `idle` após o áudio terminar

**Acceptance:**
- [ ] Wake burst visível
- [ ] Listening → processing transition automático (sem apertar nada)
- [ ] Resposta audível em pt-BR com voz masculina Murf
- [ ] Orb retorna a idle sem intervenção
- [ ] Latência total ≤ 5s percebidos entre fim da pergunta e início da resposta audível
- [ ] Texto da resposta aparece no chat/SpeechBubble (pode ser antes ou durante o TTS)

### SC-2: Loop automático retoma sem ação — WAKE-05

**Steps:**
1. Após SC-1 terminar e orb estar em `idle`, aguardar 2s
2. Sem tocar em nada, dizer novamente: **"Hey JARVIS, obrigado"**
3. Observar fluxo idêntico ao SC-1

**Acceptance:**
- [ ] Wake word dispara na segunda invocação sem configuração adicional
- [ ] Ciclo completo funciona idêntico ao SC-1

### SC-3: VAD real substitui timeout fixo — WAKE-06 (D-02 tuning check)

**Steps:**
1. Com orb em idle, dizer **"Hey JARVIS"** e então parar de falar imediatamente (diga só o wake word sem pergunta)
2. Observar orb ir para `listening`
3. Após silêncio de ~1.4s, VAD deve detectar fim da fala OU disparar fallback de 6s

**Acceptance:**
- [ ] Se VAD detectou (provável): orb vai para processing + recebe alguma resposta do LLM (pode ser "Como posso ajudar?" ou similar)
- [ ] Se fallback 6s disparou: toast amarelo "Não ouvi nada. Diga Hey JARVIS de novo." aparece e orb volta a idle
- [ ] Em nenhum cenário o orb fica travado em `listening`

**D-02 tuning judgment (library defaults sanity check):**

CONTEXT.md D-02 listou aproximações stale (`redemptionFrames: 8 (~250ms)`, `minSpeechFrames: 9 (~300ms)`). Os defaults reais da lib `@ricky0123/vad-web@0.0.30` são `redemptionMs: 1400` e `minSpeechMs: 400` — ~6x mais lentos que os números originais do CONTEXT. A divergência é legítima (números do CONTEXT eram aproximações), mas o usuário precisa julgar se o comportamento real é aceitável antes do sign-off.

- [ ] Dizer "Hey JARVIS, que horas são?" em ritmo normal e cronometrar: o recording termina ~1.4s após você parar de falar? (defaults da lib)
- [ ] Esse delay de ~1.4s de silêncio antes de fechar a captura parece natural ou lag excessivo?
  - Se natural → aprovar D-02 defaults literais (sinal: "D-02 defaults OK" no sign-off)
  - Se lag excessivo → criar gap fix para adicionar `VAD_REDEMPTION_MS` e `VAD_MIN_SPEECH_MS` env var override em `apps/desktop/src/renderer/hooks/useWakeWord.ts` (NÃO bloqueia sign-off do phase, vira TODO para gap closure)
- [ ] Se o usuário optar pelo override: documentar os valores desejados nos gaps (ex.: `VAD_REDEMPTION_MS=500`, `VAD_MIN_SPEECH_MS=300`)

### SC-4: Error recovery — toast pt-BR + orb idle

**Cenário A — Backend down (D-08):**
1. Matar o processo backend-ts (Ctrl+C no terminal do backend)
2. Dizer **"Hey JARVIS, teste"**
3. Observar:
   - [ ] Orb pisca red (ou similar) ao receber erro
   - [ ] Toast pt-BR aparece: "JARVIS offline. Verifique o backend." (ou mensagem similar mapeada por `mapErrorCode`)
   - [ ] Orb retorna a `idle`
4. Reiniciar o backend para continuar o UAT

**Cenário B — TTS failure degrade (D-06):**
1. Temporariamente setar `MURF_API_KEY=invalid_key_for_uat` no `.env` e reiniciar o backend
   (isso força Murf a retornar 401 → fallback para LocalTTSProvider → texto ainda funciona mas TTS pode ser ruim ou falhar)
2. Dizer **"Hey JARVIS, como você está?"**
3. Observar:
   - [ ] Texto da resposta aparece no chat (addAgentMessage) — texto NÃO é perdido
   - [ ] Audio pode ou não tocar — aceitável qualquer dos dois
   - [ ] Orb retorna a idle
4. Restaurar `MURF_API_KEY` válido

### SC-5: Shared pipeline parity — WAKE-13

**Steps:**
1. Com orb em idle, apertar PTT (`Ctrl+Space`)
2. Dizer **"Teste de PTT"**
3. Apertar PTT novamente para parar
4. Observar fluxo: listening → processing → responding → idle com resposta TTS

**Acceptance:**
- [ ] PTT ainda funciona end-to-end após o refactor da Plan 03
- [ ] Resposta aparece no chat e TTS toca
- [ ] Nenhum erro visível no console que não estava presente antes da Phase 24

---

## Manual-Only Verifications (de 24-VALIDATION.md)

- [ ] **E2E com mic real em pt-BR** — coberto por SC-1 e SC-2 acima
- [ ] **Degradação gracioso TTS → texto** — coberto por SC-4 Cenário B
- [ ] **Error recovery backend down** — coberto por SC-4 Cenário A

---

## A6 Runtime Assumption Check (Research)

**What to verify:** `MicVAD.new({ getStream })` reuses the existing MediaStream without triggering a second `getUserMedia` prompt.

**Steps:**
1. Clean-start the app (kill + `pnpm --filter @jarvis/desktop dev`)
2. Grant mic permission when prompted
3. Count the number of permission prompts that appear

**Acceptance:**
- [ ] Exactly ONE mic permission prompt appears (not two)
- [ ] If two appear, create a gap-fix ticket to pass a dedicated stream in `getStream` rather than reusing

---

## Decisions Sign-Off

Confirm each decision from CONTEXT.md was implemented:
- [ ] D-01: `@ricky0123/vad-web@0.0.30` installed (check `apps/desktop/package.json`)
- [ ] D-02: Library defaults used (A1 resolution — no explicit threshold/timing override)
- [ ] D-03: 6s max fallback via `VITE_WAKE_WORD_MAX_RECORDING_MS=6000`
- [ ] D-04: `TTS_PROVIDER=murf` works in the factory
- [ ] D-05: Default voice is `pt-BR-heitor`
- [ ] D-06: TTS failure keeps agent text visible
- [ ] D-07: `sendAudioAndHandle` pure function exists and is consumed by both PTT and wake word
- [ ] D-08: Hard errors show pt-BR toast via `ChatContext.setToast`
- [ ] D-09: 60s internal timeout reused (no external AbortController per A5)
- [ ] D-10: No barge-in, no multi-turn, no partial streaming (scope locked)

---

## Final Sign-Off

**Tester:** _________________________
**Date:** _________________________
**Status:** ⬜ All criteria passed / ⬜ Gaps found (list below)

**Gaps found (if any):**
1. ...
2. ...

**Next action:** Run `/gsd-verify-work 24` (if all passed) OR `/gsd-plan-phase 24 --gaps` (if gaps).
