# Roadmap: JARVIS

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2024-04-05)
- ✅ **v1.1 Monorepo + API** — Phases 6-8 (shipped 2024-04-06)
- ✅ **v1.2 Desktop UI** — Phases 9-13 (shipped 2024-04-07)
- ✅ **v1.3 Migração Python → TypeScript** — Phases 14-21 (shipped 2024-04-10)
- ✅ **v1.4 Voice & UX Polish** — Phases 22-25 (shipped 2026-04-12)
- 🚧 **v1.5 Conversation Quality & Docker Polish** — Phases 26-28 (in progress — started 2026-04-12)

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

### 🚧 v1.5 Conversation Quality & Docker Polish (Phases 26-28)

- [x] **Phase 26: Docker Infrastructure** — ChromaDB como serviço Docker, STT model pré-baixado, `docker compose up` sobe tudo pronto (completed 2026-04-12)
- [ ] **Phase 27: Conversation Quality** — System prompt pt-BR, memória cross-session funcional via ChromaDB, recall_memory tool E2E
- [ ] **Phase 28: Multi-Turn Voice** — Listening window pós-TTS, silent timeout para idle, estado visual distinto para follow-up

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

**Research flag:** SIM — precisa `/gsd-research-phase` antes do plan. Tópicos: (a) AudioWorklet asset serving no Vite (dev vs packaged), (b) cadência ideal de inferência ONNX vs buffer sizing, (c) integração `electron-builder` `extraResources` + runtime path resolver, (d) técnica de RMS zero-detection para pitfall mic silencioso.

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

**Stretch goals (P2 — ship se o budget de fase permitir, sem bloquear fechamento do milestone):**
  - Idle breathing com hue drift sutil ±10° a cada 4–8s no orb idle ativo (ORB-POL-03)
  - Crossfade entre estados do orb usando duas layers de gradiente em vez de switch instantâneo (ORB-POL-04)
  - Drag-to-reposition do orb com posição persistida em `electron-store` (ORB-POL-05 — requer carveout de click-through region)

**Stack additions:** ZERO. Tailwind 4 + CSS keyframes + React 19 `startTransition` já validados em v1.2 (ORB-01..04 shipped). Não adicionar `motion`/framer-motion salvo se bater num teto concreto de CSS.

**Research flag:** NÃO — padrões já provados em v1.2. Planning direto para execution.

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

**Stretch goals (P2):**
  - Barge-in: se o usuário falar durante `responding`, abortar TTS playback e voltar pra listening
  - Partial streaming: tocar TTS conforme o LLM streama tokens (em vez de esperar response completa)
  - Multi-turn: segunda pergunta sem precisar dizer "Hey JARVIS" de novo se for dentro de N segundos

**Stack additions:** ZERO. VAD pode ser feito com `@ricky0123/vad-web` (ONNX, já temos onnxruntime-web da Phase 22) ou análise RMS simples no próprio MediaRecorder stream. Reutiliza `window.jarvis.sendAudio` e `handleAudioResponse` existentes.

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

**Plans:** TBD

### Phase 28: Multi-Turn Voice

**Goal:** Usuário pode continuar conversando por voz após a resposta TTS do JARVIS sem precisar repetir "Hey JARVIS", com janela de escuta configurável e estado visual próprio no orb.

**Depends on:** Phase 24 (wake word full pipeline — ciclo TTS→idle já existe e precisa ser interceptado)

**Requirements:** MTURN-01, MTURN-02, MTURN-03

**Success Criteria** (what must be TRUE):
  1. Após o TTS terminar, o orb entra automaticamente em estado "aguardando follow-up" (visual distinto de idle e de listening normal) e permanece escutando por N segundos configuráveis via `VITE_MULTI_TURN_WINDOW_MS` (default 8000ms)
  2. Usuário fala durante a janela de follow-up e o JARVIS processa a pergunta sem precisar dizer "Hey JARVIS" — ciclo completo STT → LLM → TTS funciona igual ao ciclo normal
  3. Se o usuário não falar durante a janela, o orb volta silenciosamente ao idle com wake word ativo — sem toast, sem animação brusca

**UI hint**: yes

**Plans:** TBD

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
| 26. Docker Infrastructure | v1.5 | 3/3 | Complete    | 2026-04-12 |
| 27. Conversation Quality | v1.5 | 0/? | Not started | - |
| 28. Multi-Turn Voice | v1.5 | 0/? | Not started | - |
