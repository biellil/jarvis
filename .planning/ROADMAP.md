# Roadmap: JARVIS

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-05)
- ✅ **v1.1 Monorepo + API** — Phases 6-8 (shipped 2026-04-06)
- ✅ **v1.2 Desktop UI** — Phases 9-13 (shipped 2026-04-07)
- ✅ **v1.3 Migração Python → TypeScript** — Phases 14-21 (shipped 2026-04-10)
- 🚧 **v1.4 Voice & UX Polish** — Phases 22-23 (in progress — started 2026-04-11)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-04-05</summary>

- [x] Phase 1: Foundation (4/4 plans) — completed 2026-04-02
- [x] Phase 2: Memory (6/6 plans) — completed 2026-04-04
- [x] Phase 3: Voice Pipeline (6/6 plans) — completed 2026-04-04
- [x] Phase 4: PC Control (3/3 plans) — completed 2026-04-05
- [x] Phase 5: Advanced Features (2/2 plans) — completed 2026-04-05

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Monorepo + API (Phases 6-8) — SHIPPED 2026-04-06</summary>

- [x] Phase 6: FastAPI Core (2/2 plans) — completed 2026-04-05
- [x] Phase 7: Monorepo + Express Gateway (2/2 plans) — completed 2026-04-06
- [x] Phase 8: Docker Compose (2/2 plans) — completed 2026-04-06

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Desktop UI (Phases 9-13) — SHIPPED 2026-04-07</summary>

- [x] Phase 9: Electron Scaffold (2/2 plans) — completed 2026-04-06
- [x] Phase 10: Frameless Widget Window (2/2 plans) — completed 2026-04-06
- [x] Phase 11: Orb Animation (2/2 plans) — completed 2026-04-06
- [x] Phase 12: Hotkey + Text Chat (4/4 plans) — completed 2026-04-07
- [x] Phase 13: Audio Endpoint + Voice Input (4/4 plans) — completed 2026-04-07

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Migração Python → TypeScript (Phases 14-21) — SHIPPED 2026-04-10</summary>

- [x] Phase 14: TypeScript Backend Scaffolding (2/2 plans) — completed 2026-04-07
- [x] Phase 15: Multi-LLM Factory + LangChain Integration (3/3 plans) — completed 2026-04-07
- [x] Phase 16: Memory Layer (SQLite + ChromaDB + Embeddings) (5/5 plans) — completed 2026-04-08
- [x] Phase 17: ChatSession + Agent Runtime (4/4 plans) — completed 2026-04-08
- [x] Phase 18: PC Control Tools — Backend (5/5 plans) — completed 2026-04-09
- [x] Phase 18.5: PC Control Tools — Electron Executor (5/5 plans) — completed 2026-04-09
- [x] Phase 19: Voice Pipeline — Backend (8/8 plans) — completed 2026-04-09
- [x] Phase 19.5: Voice Pipeline — Electron (4/4 plans) — completed 2026-04-09
- [x] Phase 20: E2E Validation & Python Comparison (2/2 plans) — completed 2026-04-10
- [x] Phase 21: Cutover & Python Deprecation (3/3 plans) — completed 2026-04-10

Full details: `.planning/milestones/v1.3-ROADMAP.md`

</details>

### 🚧 v1.4 Voice & UX Polish (Phases 22-23)

- [x] **Phase 22: VoiceInputManager Refactor + Wake Word Core** — Refatora ownership de mic em `ptt-hotkey.ts` e implementa detecção "Hey JARVIS" sempre-escutando no renderer via `onnxruntime-web` + openwakeword ONNX (completed 2026-04-11)
- [ ] **Phase 23: Orb UX Polish + Wake Word Visual Feedback** — Wake burst animation, kill switch no tray, accessibility (`prefers-reduced-motion`) e distinção visual listening/paused

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

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2026-04-02 |
| 2. Memory | v1.0 | 6/6 | Complete | 2026-04-04 |
| 3. Voice Pipeline | v1.0 | 6/6 | Complete | 2026-04-04 |
| 4. PC Control | v1.0 | 3/3 | Complete | 2026-04-05 |
| 5. Advanced Features | v1.0 | 2/2 | Complete | 2026-04-05 |
| 6. FastAPI Core | v1.1 | 2/2 | Complete | 2026-04-05 |
| 7. Monorepo + Express Gateway | v1.1 | 2/2 | Complete | 2026-04-06 |
| 8. Docker Compose | v1.1 | 2/2 | Complete | 2026-04-06 |
| 9. Electron Scaffold | v1.2 | 2/2 | Complete | 2026-04-06 |
| 10. Frameless Widget Window | v1.2 | 2/2 | Complete | 2026-04-06 |
| 11. Orb Animation | v1.2 | 2/2 | Complete | 2026-04-06 |
| 12. Hotkey + Text Chat | v1.2 | 4/4 | Complete | 2026-04-07 |
| 13. Audio Endpoint + Voice Input | v1.2 | 4/4 | Complete | 2026-04-07 |
| 14. TypeScript Backend Scaffolding | v1.3 | 2/2 | Complete | 2026-04-07 |
| 15. Multi-LLM Factory + LangChain | v1.3 | 3/3 | Complete | 2026-04-07 |
| 16. Memory Layer | v1.3 | 5/5 | Complete | 2026-04-08 |
| 17. ChatSession + Agent Runtime | v1.3 | 4/4 | Complete | 2026-04-08 |
| 18. PC Control Tools — Backend | v1.3 | 5/5 | Complete | 2026-04-09 |
| 18.5. PC Control Tools — Electron | v1.3 | 5/5 | Complete | 2026-04-09 |
| 19. Voice Pipeline — Backend | v1.3 | 8/8 | Complete | 2026-04-09 |
| 19.5. Voice Pipeline — Electron | v1.3 | 4/4 | Complete | 2026-04-09 |
| 20. E2E Validation | v1.3 | 2/2 | Complete | 2026-04-10 |
| 21. Cutover & Python Deprecation | v1.3 | 3/3 | Complete | 2026-04-10 |
| 22. VoiceInputManager Refactor + Wake Word Core | v1.4 | 4/4 | Complete   | 2026-04-11 |
| 23. Orb UX Polish + Wake Word Visual Feedback | v1.4 | 0/? | Not started | - |
