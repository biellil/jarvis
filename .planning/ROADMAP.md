# Roadmap: JARVIS

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2024-04-05)
- ✅ **v1.1 Monorepo + API** — Phases 6-8 (shipped 2024-04-06)
- ✅ **v1.2 Desktop UI** — Phases 9-13 (shipped 2024-04-07)
- ✅ **v1.3 Migração Python → TypeScript** — Phases 14-21 (shipped 2024-04-10)
- ✅ **v1.4 Voice & UX Polish** — Phases 22-25 (shipped 2026-04-12)
- ✅ **v1.5 Conversation Quality & Docker Polish** — Phases 26-28 (shipped 2026-04-13)
- 🔄 **v1.6 Local Voice Pipeline** — Phases 29-32 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2024-04-05</summary>

- [x] Phase 1: Foundation (4/4 plans) — completed 2024-04-02
- [x] Phase 2: Memory (6/6 plans) — completed 2024-04-04
- [x] Phase 3: Voice Pipeline (6/6 plans) — completed 2024-04-04
- [x] Phase 4: PC Control (3/3 plans) — completed 2024-04-05
- [x] Phase 5: Advanced Features (2/2 plans) — completed 2024-04-05

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Monorepo + API (Phases 6-8) — SHIPPED 2024-04-06</summary>

- [x] Phase 6: FastAPI Core (2/2 plans) — completed 2024-04-05
- [x] Phase 7: Monorepo + Express Gateway (2/2 plans) — completed 2024-04-06
- [x] Phase 8: Docker Compose (2/2 plans) — completed 2024-04-06

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Desktop UI (Phases 9-13) — SHIPPED 2024-04-07</summary>

- [x] Phase 9: Electron Scaffold (2/2 plans) — completed 2024-04-06
- [x] Phase 10: Frameless Widget Window (2/2 plans) — completed 2024-04-06
- [x] Phase 11: Orb Animation (2/2 plans) — completed 2024-04-06
- [x] Phase 12: Hotkey + Text Chat (4/4 plans) — completed 2024-04-07
- [x] Phase 13: Audio Endpoint + Voice Input (4/4 plans) — completed 2024-04-07

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Migração Python → TypeScript (Phases 14-21) — SHIPPED 2024-04-10</summary>

- [x] Phase 14: TypeScript Backend Scaffolding (2/2 plans) — completed 2024-04-07
- [x] Phase 15: Multi-LLM Factory + LangChain Integration (3/3 plans) — completed 2024-04-07
- [x] Phase 16: Memory Layer (SQLite + ChromaDB + Embeddings) (5/5 plans) — completed 2024-04-08
- [x] Phase 17: ChatSession + Agent Runtime (4/4 plans) — completed 2024-04-08
- [x] Phase 18: PC Control Tools — Backend (5/5 plans) — completed 2024-04-09
- [x] Phase 18.5: PC Control Tools — Electron Executor (5/5 plans) — completed 2024-04-09
- [x] Phase 19: Voice Pipeline — Backend (8/8 plans) — completed 2024-04-09
- [x] Phase 19.5: Voice Pipeline — Electron (4/4 plans) — completed 2024-04-09
- [x] Phase 20: E2E Validation & Python Comparison (2/2 plans) — completed 2024-04-10
- [x] Phase 21: Cutover & Python Deprecation (3/3 plans) — completed 2024-04-10

Full details: `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v1.4 Voice & UX Polish (Phases 22-25) — SHIPPED 2026-04-12</summary>

- [x] Phase 22: VoiceInputManager Refactor + Wake Word Core (4/4 plans) — completed 2024-04-11
- [x] Phase 23: Orb UX Polish + Wake Word Visual Feedback (2/2 plans) — completed 2024-04-11
- [x] Phase 24: Wake Word Full Pipeline Integration (5/5 plans) — completed 2026-04-12
- [x] Phase 25: Orb Visual Polish P2 (3/3 plans) — completed 2026-04-12

Full details: `.planning/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>✅ v1.5 Conversation Quality & Docker Polish (Phases 26-28) — SHIPPED 2026-04-13</summary>

- [x] Phase 26: Docker Infrastructure (3/3 plans) — completed 2026-04-12
- [x] Phase 27: Conversation Quality (2/2 plans) — completed 2026-04-13
- [x] Phase 28: Multi-Turn Voice (2/2 plans) — completed 2026-04-13

Full details: `.planning/milestones/v1.5-ROADMAP.md`

</details>

### v1.6 Local Voice Pipeline (Phases 29-32)

- [ ] **Phase 29: STT Core Infrastructure** — whisper.cpp Node bindings + GPU auto-detection + audio normalization + ASAR config + feature flag
- [ ] **Phase 30: Voice Handler + TTS Migration** — voiceHandler.ts orquestração + TTS HTTP no Electron main + seleção de modelo por VRAM
- [ ] **Phase 31: IPC Refactor & E2E Rollout** — sendAudioAndHandle refatorado para usar IPC + feature flag + validação E2E
- [ ] **Phase 32: Backend & Docker Cleanup** — remover endpoints /chat/audio + remover nodejs-whisper + Docker simplificado

## Phase Details

### Phase 22: VoiceInputManager Refactor + Wake Word Core

**Goal:** Usuário pode ativar o JARVIS falando "Hey JARVIS" sem tocar no teclado, com detecção 100% offline rodando no renderer do Electron, coexistindo de forma segura com o PTT atual.

**Depends on:** Phase 21 (v1.3 shipped — stack TypeScript completa)

**Requirements:** WAKE-01, WAKE-05, WAKE-06, WAKE-07, WAKE-08, WAKE-09

**Success Criteria** (what must be TRUE):
  1. Usuário diz "Hey JARVIS" e o orb transiciona de `idle` → `listening` em até 500ms — sem teclas, sem clicks (WAKE-01)
  2. Após o ciclo wake → fala → resposta → TTS terminar, o listening-for-wake retoma sozinho e o próximo "Hey JARVIS" funciona igual (WAKE-05)
  3. Se o usuário não falar em 3–5s após o wake, a gravação é abortada via Silero VAD e o orb volta pro idle sem ficar travado (WAKE-06)
  4. Pressionar PTT (`Ctrl+Space`) enquanto wake word está ativo nunca produz duas gravações simultâneas — PTT sempre ganha, coordenado via `VoiceInputManager` (WAKE-07)
  5. Se `getUserMedia` falhar no startup, JARVIS continua funcional em modo PTT-only com indicação clara no tray ("Mic unavailable") — sem crash (WAKE-08)
  6. CPU sustained <2% após 10 minutos de silêncio num laptop 4-core, com inferência rodando no AudioWorklet + VAD pre-filter (WAKE-09 privacy + pitfall #4 CPU budget)
  7. `pnpm build` empacota os 4 modelos ONNX via `extraResources` e o artefato instalado detecta wake word corretamente no primeiro launch (pitfall #5 packaging)

**Critical constraint (PITFALL #2 mitigation):** A Phase 22 DEVE começar extraindo `VoiceInputManager` de `apps/desktop/src/main/ptt-hotkey.ts` como **tarefa separada e primeiro commit**, antes de qualquer linha de código de wake word. O manager possui mic acquisition e rastreia `source: 'ptt' | 'wakeword' | null` com política "PTT sempre ganha". Sem esse refactor prévio, duas instâncias de `MediaRecorder` competem pelo mesmo `MediaStream` em produção e o milestone falha silenciosamente.

**Stack additions:**
- `onnxruntime-web@1.24.3` em `apps/desktop` (único pacote npm novo em todo o monorepo)
- 4 modelos ONNX openwakeword em `apps/desktop/resources/wakeword-models/`: `melspectrogram.onnx`, `embedding_model.onnx`, `silero_vad.onnx`, `hey_jarvis_v0.1.onnx` (~4 MB total)
- AudioWorklet nativo do Chromium (zero deps novas)
- Rejeita: `bumblebee-hotword-node` (Porcupine-derivado, banido por CLAUDE.md), `@picovoice/porcupine-node` (AccessKey), `snowboy` (descontinuado)

**Plans:** 4/4 plans complete

Plans:
- [x] 22-01-PLAN.md — VoiceInputManager refactor + ptt-hotkey extraction (Wave 1)
- [x] 22-02-PLAN.md — Wake Word Core modules: modelLoader, WakeWordEngine, RmsZeroGuard, AudioWorklet + IPC bridge (Wave 2)
- [x] 22-03-PLAN.md — Assets/download script + env.example + CI grep-ban (Wave 2)
- [x] 22-04-PLAN.md — Integração live: useWakeWord + OrbContext gating + TTS wrap + electron-builder + CPU benchmark (Wave 3)

### Phase 23: Orb UX Polish + Wake Word Visual Feedback

**Goal:** Usuário tem feedback visual imediato quando o wake word dispara, distingue claramente o estado "escutando wake word" de "pausado", e pode pausar/retomar via tray — tudo com suporte a `prefers-reduced-motion`.

**Depends on:** Phase 22 (precisa do callback `onDetected()` real do `WakeWordEngine` — animar contra flag stub é retrabalho)

**Requirements:** WAKE-02, WAKE-03, WAKE-04, ORB-POL-01, ORB-POL-02

**Success Criteria** (what must be TRUE):
  1. Usuário vê wake burst animation no orb (scale 1.0→1.1→1.0 + amber ring) entre 200–500ms após o wake word disparar, antes da gravação começar (WAKE-02, ORB-POL-02)
  2. Usuário abre o tray menu e vê item "Pause listening" / "Resume listening" que alterna o estado imediatamente, com a preferência persistindo entre sessões via `electron-store` (WAKE-03)
  3. Usuário consegue distinguir visualmente "idle com wake word ATIVO" de "idle com wake word PAUSADO" — cores, opacidade ou ring diferentes no orb + variante no tray icon (WAKE-04)
  4. Usuário com `prefers-reduced-motion` ativo vê versão reduzida/simplificada das keyframes do orb (idle, listening, processing, responding, wake burst) — coberto por `@media (prefers-reduced-motion: reduce)` (ORB-POL-01)

**Plans:** 2/2 plans complete

Plans:
- [x] 23-01-PLAN.md — OrbContext flag + Orb visual paused + wake burst keyframes + prefers-reduced-motion CSS (Wave 1)
- [x] 23-02-PLAN.md — Store/IPC realinhados + tray pause/resume + useWakeWord burst dispatch + reduced-motion bypass (Wave 2)

**UI hint**: yes

### Phase 24: Wake Word Full Pipeline Integration

**Goal:** Usuário fala "Hey JARVIS, <pergunta>" e recebe resposta falada do LLM, fim. Fecha o loop wake word → STT → LLM → TTS → idle que ficou desconectado nas Phases 22/23 (o engine foi construído e o feedback visual foi construído, mas o Uint8Array do `useWakeWord.ts` é descartado com `void stopRecording()` e nunca chega no backend).

**Depends on:** Phase 22 (wake word engine), Phase 23 (orb burst + pause/resume)

**Requirements:** WAKE-05 (ciclo completo idle→listening→processing→responding→idle via wake word), WAKE-06 (VAD real substituindo timeout fixo), + novos requirements a elicitar em `/gsd-discuss-phase`

**Why this exists:** Diagnóstico encontrado durante fechamento de v1.4 — `apps/desktop/src/renderer/hooks/useWakeWord.ts:176` tem `void audioRecorder.stopRecording()` que descarta os bytes capturados, enquanto o fluxo PTT (`ChatInput.tsx:75-110`) já demonstra o pipeline completo via `window.jarvis.sendAudio(audioBuffer)`. Phase 22/23 passaram verification porque nenhuma tinha must-have "usuário fala e recebe resposta do LLM" — é um gap de integration entre dois subsistemas shipped, não um bug isolado.

**Success Criteria (what must be TRUE):**
  1. Usuário fala "Hey JARVIS, que horas são?" → orb wake burst → listening → silêncio do usuário termina o recording automaticamente → processing → responding com áudio TTS tocando → volta pra idle (E2E completo em <5s percebidos)
  2. VAD real baseado em análise de áudio (RMS/energy ou WebRTC VAD) substitui o timeout fixo de `vadTimeoutMs` — recording termina ~500ms após o usuário parar de falar, não em tempo fixo
  3. Handler de áudio compartilhado: `handleAudioResponse` + `sendAudioToBackend` extraídos em hook/util único consumido tanto por `ChatInput.tsx` (PTT) quanto por `useWakeWord.ts` (wake word) — elimina duplicação e garante paridade de comportamento
  4. Error recovery: backend down (HTTP error), LLM timeout (AbortController), mic muted mid-recording, ou stream com silêncio → orb volta pra idle + toast visível + log estruturado, sem travar em listening/processing
  5. E2E humano assinado: validação manual com mic real do fluxo completo em pt-BR (wake word → pergunta real → resposta do LLM via TTS) antes do milestone v1.4 fechar

**Plans:** 5/5 plans complete

Plans:
- [x] 24-01-PLAN.md — MurfTTSProvider backend + factory (Wave 1, parallel with 24-02)
- [x] 24-02-PLAN.md — sendAudioAndHandle shared helper + tests (Wave 1, parallel with 24-01)
- [x] 24-03-PLAN.md — ChatInput PTT migration to shared helper (Wave 2, depends on 24-02)
- [x] 24-04-PLAN.md — @ricky0123/vad-web + encodeFloat32ToWav + useWakeWord wiring (Wave 2, depends on 24-02)
- [x] 24-05-PLAN.md — REQUIREMENTS.md update + 24-UAT.md + human sign-off (Wave 3, depends on 24-01..24-04)

### Phase 25: Orb Visual Polish P2

**Goal:** Implementar os 3 stretch goals visuais do orb: idle breathing com hue drift sutil (ORB-POL-03), crossfade transitions entre estados (ORB-POL-04), e orb draggable com posição persistida via electron-store (ORB-POL-05).

**Depends on:** Phase 23 (orb UX polish base)

**Requirements:** ORB-POL-03, ORB-POL-04, ORB-POL-05

**Success Criteria** (what must be TRUE):
  1. Orb idle pulsa com hue drift ±10° suave a cada 4–8s, perceptível mas não distrativo (ORB-POL-03)
  2. Transições entre estados do orb usam crossfade via duas layers sobrepostas em vez de troca instantânea (ORB-POL-04)
  3. Usuário pode arrastar o orb para qualquer posição na tela e a posição persiste ao reiniciar o Electron (ORB-POL-05)

**Plans:** 3/3 plans complete

Plans:
- [x] 25-01-PLAN.md — Idle breathing com hue drift ±10° (ORB-POL-03, Wave 1)
- [x] 25-02-PLAN.md — Crossfade transitions entre estados do orb (ORB-POL-04, Wave 1)
- [x] 25-03-PLAN.md — Drag-to-reposition com persistência via electron-store (ORB-POL-05, Wave 1)

**UI hint**: yes

### Phase 26: Docker Infrastructure

**Goal:** `docker compose up` sobe o ambiente completo pronto para uso — gateway, backend-ts, ChromaDB como serviço dedicado com volume persistente, e modelo STT whisper base já baixado na imagem, sem downloads em runtime.

**Depends on:** Phase 25 (v1.4 shipped)

**Requirements:** DOCK-06, DOCK-07, DOCK-08, DOCK-09

**Success Criteria** (what must be TRUE):
  1. `docker compose up` em máquina limpa sobe os 4 serviços (gateway, backend-ts, chromadb, e modelo STT disponível) sem erros e sem downloads adicionais em runtime
  2. Backend-ts conecta ao ChromaDB via rede Docker interna — o erro `ChromaConnectionError` que ocorria em container não aparece mais nos logs
  3. Memória semântica (ChromaDB) persiste entre `docker compose down` e `docker compose up` — dados não se perdem em restart
  4. `docker build` do backend-ts baixa e valida o modelo whisper base durante a build, não durante a primeira transcrição em runtime

**Plans:** 3/3 plans complete

Plans:
- [x] 26-01-PLAN.md — ChromaDB service + backend-ts connection fix (Wave 1)
- [x] 26-02-PLAN.md — Whisper model pre-download + E2E docker compose validation (Wave 2)

### Phase 27: Conversation Quality

**Goal:** JARVIS sempre responde em português brasileiro, recupera contexto de conversas anteriores via ChromaDB semântico, e o tool `recall_memory` funciona de ponta a ponta com ChromaDB real (não mock).

**Depends on:** Phase 26 (ChromaDB como serviço Docker precisa estar funcional para CONV-08/09)

**Requirements:** CONV-07, CONV-08, CONV-09

**Success Criteria** (what must be TRUE):
  1. JARVIS responde em português brasileiro em toda interação, mesmo que o usuário escreva em inglês — garantido por system prompt no payload de cada request LLM
  2. Ao iniciar nova sessão, JARVIS referencia informações de conversas anteriores sem que o usuário precise repetir contexto (ex: nome, preferências estabelecidas antes)
  3. O tool `recall_memory` retorna resultados reais do ChromaDB quando invocado pelo agente — verificável via log da tool call com resultados não-vazios em segunda sessão após primeira conversa

**Plans:** 2/2 plans complete

Plans:
- [x] 27-01-PLAN.md — System prompt pt-BR + dynamic topK memory recall (Wave 1)
- [x] 27-02-PLAN.md — E2E verification (CONV-07, CONV-08, CONV-09) (Wave 2)

### Phase 28: Multi-Turn Voice

**Goal:** Usuário pode continuar conversando por voz após a resposta TTS do JARVIS sem precisar repetir "Hey JARVIS", com janela de escuta configurável e estado visual próprio no orb.

**Depends on:** Phase 24 (wake word full pipeline — ciclo TTS→idle já existe e precisa ser interceptado)

**Requirements:** MTURN-01, MTURN-02, MTURN-03

**Success Criteria** (what must be TRUE):
  1. Após o TTS terminar, o orb entra automaticamente em estado "aguardando follow-up" (visual distinto de idle e de listening normal) e permanece escutando por N segundos configuráveis via `VITE_MULTI_TURN_WINDOW_MS` (default 8000ms)
  2. Usuário fala durante a janela de follow-up e o JARVIS processa a pergunta sem precisar dizer "Hey JARVIS" — ciclo completo STT → LLM → TTS funciona igual ao ciclo normal
  3. Se o usuário não falar durante a janela, o orb volta silenciosamente ao idle com wake word ativo — sem toast, sem animação brusca

**UI hint**: yes

**Plans:** 2/2 plans complete

Plans:
- [x] 28-01-PLAN.md — OrbState type extension + awaiting-followup visual rendering + Tailwind config (Wave 1)
- [x] 28-02-PLAN.md — useMultiTurnWindow hook + TTS integration + wake word coordination (Wave 2)

---

### Phase 29: STT Core Infrastructure

**Goal:** Electron main process pode transcrever áudio localmente usando whisper.cpp com GPU auto-detection (CUDA/Vulkan/Metal/CPU), com áudio normalizado para 16kHz PCM e rollout seguro via feature flag.

**Depends on:** Phase 28 (v1.5 shipped — voice pipeline existente é base do refactor)

**Requirements:** STT-01, STT-03, STT-04, INFRA-01, INFRA-02

**Success Criteria** (what must be TRUE):
  1. Electron main detecta e loga o backend GPU disponível na inicialização (CUDA para NVIDIA, Vulkan para AMD, Metal para Apple Silicon, CPU como fallback) — log visível com texto "Using GPU backend: [backend]" ou "Falling back to CPU" (STT-01, STT-03)
  2. Áudio capturado pelo MediaRecorder é normalizado para 16kHz PCM mono antes de qualquer chamada whisper.cpp — verificável via log de normalização com sample rate e channel count confirmados (STT-04)
  3. Com `USE_WHISPER_CPP=false` (default), o comportamento anterior de upload de áudio via gateway é preservado intacto — nenhuma regressão no fluxo existente de PTT e wake word (INFRA-02)
  4. `pnpm build` produz artefato Electron funcional sem erros de ASAR — binários `.node` do `@fugood/whisper.node` desempacotados corretamente via `asarUnpack` ou `extraResources` (INFRA-01)
  5. Com `USE_WHISPER_CPP=true`, uma chamada de transcrição de áudio de teste retorna texto correto no processo main — PoC verificado manualmente antes de prosseguir para Phase 30 (STT-01)

**Stack additions:**
- `@fugood/whisper.node@1.0.16` em `apps/desktop` — bindings nativos whisper.cpp com suporte CUDA/Vulkan/Metal/CPU
- electron-builder config atualizado para `asarUnpack` dos binários `.node`
- Feature flag `USE_WHISPER_CPP` em `.env` (default `false`)

**Plans:** 3/4 plans executed

Plans:
- [x] 29-01-PLAN.md — Wave 0: test stubs for GPU detection + audio normalizer (RED phase)
- [x] 29-02-PLAN.md — Core modules: gpuDetection + audioNormalizer + whisperResources + ASAR config
- [x] 29-03-PLAN.md — Feature flag wiring: USE_WHISPER_CPP in index.ts + ipc/chat.ts + .env.example
- [ ] 29-04-PLAN.md — Manual verification: ASAR build + transcription PoC checkpoint

### Phase 30: Voice Handler + TTS Migration

**Goal:** Electron main process orquestra o pipeline completo de voz — STT local → texto → LLM via gateway → texto → TTS HTTP → áudio — com seleção automática de modelo whisper por VRAM e TTS migrado do backend-ts para o main.

**Depends on:** Phase 29 (whisper.cpp PoC funcional + ASAR config validado + feature flag operando)

**Requirements:** ARCH-05, STT-02, STT-05, TTS-01, TTS-02, TTS-03

**Success Criteria** (what must be TRUE):
  1. `voiceHandler.ts` no Electron main recebe buffer de áudio via IPC, transcreve com whisper.cpp local, envia texto ao gateway `/api/chat`, e devolve áudio TTS ao renderer — pipeline completo sem tocar no endpoint `/chat/audio` (ARCH-05)
  2. Electron main seleciona automaticamente o modelo whisper baseado na VRAM detectada: >8GB → large, 4–8GB → base, <4GB → tiny via CPU — seleção logada e confirmável (STT-02)
  3. Transcrição de utterances de até 10s retorna em menos de 2 segundos em hardware com GPU compatível no modelo `base` — verificável com cronômetro manual (STT-05)
  4. TTS (Murf.ai ou ElevenLabs) é chamado do processo main via HTTP — sem mudança de `.env` necessária, mesmas env vars `MURF_API_KEY` / `ELEVENLABS_API_KEY` continuam funcionando (TTS-01, TTS-02)
  5. Nenhum código de TTS permanece no backend-ts — `MurfTTSProvider`, `ElevenLabsTTSProvider`, e factory removidos do `apps/backend-ts` (TTS-03)

**Stack additions:**
- `electron-store` (já existente) para caching da seleção de modelo whisper
- `axios` (ou fetch nativo do Node) para chamadas TTS HTTP do processo main

**Plans:** TBD
**UI hint**: yes

### Phase 31: IPC Refactor & E2E Rollout

**Goal:** `sendAudioAndHandle` envia áudio ao processo main via IPC (não mais ao gateway HTTP), o pipeline completo funciona E2E com `USE_WHISPER_CPP=true`, e PTT + wake word operam corretamente no novo fluxo.

**Depends on:** Phase 30 (voiceHandler.ts pronto e testado isoladamente — refatorar sendAudioAndHandle sem o handler seria construir sem destino)

**Requirements:** ARCH-06

**Success Criteria** (what must be TRUE):
  1. Com `USE_WHISPER_CPP=true`, usuário diz "Hey JARVIS, <pergunta>" e recebe resposta em áudio — pipeline completo: wake word → IPC → STT local → gateway LLM → TTS main → IPC → renderer, sem passar pelo endpoint `/chat/audio` (ARCH-06)
  2. PTT funciona identicamente ao fluxo anterior com `USE_WHISPER_CPP=true` — nenhuma regressão nos atalhos de teclado, gravação, ou resposta TTS
  3. Multi-turn voice (Phase 28) funciona com o novo IPC path — janela de follow-up e transição `awaiting-followup` preservadas
  4. Com `USE_WHISPER_CPP=false`, comportamento original via gateway HTTP permanece 100% operacional — feature flag funciona como killswitch bidirecional

**Plans:** TBD

### Phase 32: Backend & Docker Cleanup

**Goal:** Codebase e Docker refletem a nova arquitetura — endpoints de áudio removidos do gateway e backend-ts, nodejs-whisper removido do Dockerfile, imagem resultante menor e sem dependências de STT.

**Depends on:** Phase 31 (E2E validado com `USE_WHISPER_CPP=true` — só deletar código que foi substituído e confirmado como desnecessário)

**Requirements:** INFRA-03, INFRA-04, INFRA-05

**Success Criteria** (what must be TRUE):
  1. `POST /api/chat/audio` retorna 404 no gateway — endpoint removido de `apps/gateway`, rota não existe mais (INFRA-03)
  2. `POST /chat/audio` retorna 404 no backend-ts — handler removido de `apps/backend-ts`, código TTS removido junto (INFRA-04)
  3. `docker build` do backend-ts completa sem baixar modelos whisper e sem `nodejs-whisper` no `node_modules` — `docker images` mostra imagem menor que antes (INFRA-05)
  4. `docker compose up` sobe os serviços normalmente sem erros relacionados a endpoints de áudio removidos — logs limpos, gateway e backend-ts healthy

**Plans:** TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2024-04-02 |
| 2. Memory | v1.0 | 6/6 | Complete | 2024-04-04 |
| 3. Voice Pipeline | v1.0 | 6/6 | Complete | 2024-04-04 |
| 4. PC Control | v1.0 | 3/3 | Complete | 2024-04-05 |
| 5. Advanced Features | v1.0 | 2/2 | Complete | 2024-04-05 |
| 6. FastAPI Core | v1.1 | 2/2 | Complete | 2024-04-05 |
| 7. Monorepo + Express Gateway | v1.1 | 2/2 | Complete | 2024-04-06 |
| 8. Docker Compose | v1.1 | 2/2 | Complete | 2024-04-06 |
| 9. Electron Scaffold | v1.2 | 2/2 | Complete | 2024-04-06 |
| 10. Frameless Widget Window | v1.2 | 2/2 | Complete | 2024-04-06 |
| 11. Orb Animation | v1.2 | 2/2 | Complete | 2024-04-06 |
| 12. Hotkey + Text Chat | v1.2 | 4/4 | Complete | 2024-04-07 |
| 13. Audio Endpoint + Voice Input | v1.2 | 4/4 | Complete | 2024-04-07 |
| 14. TypeScript Backend Scaffolding | v1.3 | 2/2 | Complete | 2024-04-07 |
| 15. Multi-LLM Factory + LangChain | v1.3 | 3/3 | Complete | 2024-04-07 |
| 16. Memory Layer | v1.3 | 5/5 | Complete | 2024-04-08 |
| 17. ChatSession + Agent Runtime | v1.3 | 4/4 | Complete | 2024-04-08 |
| 18. PC Control Tools — Backend | v1.3 | 5/5 | Complete | 2024-04-09 |
| 18.5. PC Control Tools — Electron | v1.3 | 5/5 | Complete | 2024-04-09 |
| 19. Voice Pipeline — Backend | v1.3 | 8/8 | Complete | 2024-04-09 |
| 19.5. Voice Pipeline — Electron | v1.3 | 4/4 | Complete | 2024-04-09 |
| 20. E2E Validation | v1.3 | 2/2 | Complete | 2024-04-10 |
| 21. Cutover & Python Deprecation | v1.3 | 3/3 | Complete | 2024-04-10 |
| 22. VoiceInputManager Refactor + Wake Word Core | v1.4 | 4/4 | Complete | 2024-04-11 |
| 23. Orb UX Polish + Wake Word Visual Feedback | v1.4 | 2/2 | Complete | 2024-04-11 |
| 24. Wake Word Full Pipeline Integration | v1.4 | 5/5 | Complete | 2026-04-12 |
| 25. Orb Visual Polish P2 | v1.4 | 3/3 | Complete | 2026-04-12 |
| 26. Docker Infrastructure | v1.5 | 3/3 | Complete | 2026-04-12 |
| 27. Conversation Quality | v1.5 | 2/2 | Complete | 2026-04-13 |
| 28. Multi-Turn Voice | v1.5 | 2/2 | Complete | 2026-04-13 |
| 29. STT Core Infrastructure | v1.6 | 3/4 | In Progress|  |
| 30. Voice Handler + TTS Migration | v1.6 | 0/? | Not started | - |
| 31. IPC Refactor & E2E Rollout | v1.6 | 0/? | Not started | - |
| 32. Backend & Docker Cleanup | v1.6 | 0/? | Not started | - |
