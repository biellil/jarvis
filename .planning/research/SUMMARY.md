# Project Research Summary — JARVIS v1.4 Voice & UX Polish

**Project:** JARVIS — Just A Rather Very Intelligent System
**Domain:** Electron + TypeScript desktop voice assistant — always-listening wake word + orb UX polish
**Researched:** 2026-04-11
**Confidence:** HIGH

## Executive Summary

O milestone v1.4 tem dois objetivos: (1) recuperar a ativação por wake word "Hey JARVIS" que existia em Python v1.0 (CONV-05) e foi perdida na migração Python→TypeScript da v1.3, e (2) refinar o UX visual do orb desktop com micro-interações e feedback claro de wake word. Os 4 researchers convergiram numa recomendação arquitetural única e não-negociável: **wake word roda no processo renderer do Electron**, usando `onnxruntime-web` (WASM, sem binários nativos) + modelos `openwakeword` pré-treinados (`hey_jarvis_v0.1.onnx`), dentro de um `AudioWorkletProcessor` que consome PCM direto do `getUserMedia` já usado pelo PTT atual. Zero IPC renderer↔main por chunk, zero dependência de `node-gyp`/MSVC, zero API key — alinhado à constraint privacy-first do CLAUDE.md.

A recomendação rejeita frontalmente `bumblebee-hotword-node` (sugerida no PROJECT.md como candidata) por três motivos convergentes: (a) é explicitamente descrita como "stripped down and repackaged Porcupine", e CLAUDE.md bane Porcupine-derivados por exigir AccessKey; (b) depende do CLI `sox` instalado no SO, quebrando empacotamento cross-platform; (c) o próprio README declara "NOT for Electron, use a browser version". A alternativa `@picovoice/porcupine-node` cai pelo mesmo motivo. `snowboy` está descontinuado, `node-personal-wakeword` é abandonware. A janela viável é essencialmente única: `onnxruntime-web` + openwakeword ONNX no renderer.

O risco crítico, catalogado em PITFALLS, **não é a escolha da lib** — é uma condição de corrida de estado de microfone. O código atual `apps/desktop/src/main/ptt-hotkey.ts` mantém uma flag `isRecording` em escopo de módulo, concebida para um único ator (PTT). Adicionar wake word como segundo ator sem coordenação produz duas instâncias de `MediaRecorder` competindo pelo mesmo `MediaStream`, corrupção de estado do orb, e em casos de borda o TTS do próprio JARVIS re-dispara o wake word ("Hey, JARVIS can do that too") causando loops. A mitigação é arquitetural e **prerequisita**: extrair um `VoiceInputManager` que possua a aquisição de mic e o campo `source: 'ptt' | 'wakeword' | null` **antes** de qualquer código de wake word ser escrito. Sem esse refactor prévio, o milestone falha silenciosamente em produção.

## Key Findings

### Recommended Stack

Adição mínima de stack — apenas um pacote npm novo em todo o monorepo.

**Core technologies (todas adições em `apps/desktop`):**
- **`onnxruntime-web@1.24.3`** (MIT, Microsoft, publicado nov/2025) — runtime ONNX rodando em WASM dentro do Chromium do Electron. Zero binários nativos, zero `node-gyp`. Mesmo runtime do `transformers.js` já usado na v1.3 para embeddings — compatibilidade comprovada.
- **Modelos openwakeword ONNX pré-treinados** (~4 MB total: `melspectrogram.onnx` + `embedding_model.onnx` + `silero_vad.onnx` + `hey_jarvis_v0.1.onnx`). Apache-2.0 no código, CC BY-NC-SA 4.0 nos modelos — aceitável para "assistente pessoal para uso próprio" explícito em PROJECT.md.
- **Web Audio API nativa** (`AudioContext` + `AudioWorklet` + `getUserMedia`) — zero dependências novas. A mesma `MediaStream` já adquirida pelo `useAudioRecorder` hook (v1.3) é bifurcada: trilha contínua @ 16kHz para wake word, trilha on-demand para MediaRecorder quando wake word dispara.
- **Tailwind 4 + CSS keyframes + React 19 `startTransition`** (já instalados) — zero adição para orb refinement. CSS-only é suficiente para os 4 estados atuais + burst de wake-detected. `motion`/framer-motion **não adicionar** salvo se bater num teto concreto de CSS.

Nenhuma adição em `apps/backend-ts` ou `apps/gateway`. Wake word é 100% client-side no Electron — backend nem sabe que existe, só recebe `/api/chat/audio` como hoje. Detalhes completos em `.planning/research/STACK.md`.

### Expected Features

**Must have (P1 — table stakes, ship em v1.4 MVP, 10 items):**
- **WW-TS-01** — Wake word detection "Hey JARVIS" (regressão direta de CONV-05)
- **WW-TS-02 / ORB-POL-01** — Wake burst visual no orb dentro de 200–500ms da detecção (mesmo feature, dois rótulos)
- **WW-TS-03** — Kill switch mic no tray menu ("Pause listening" / "Resume listening") com persistência em electron-store
- **WW-TS-04** — Indicador de status persistente (orb idle difere visualmente quando listening-for-wake vs PAUSED; tray icon variant)
- **WW-TS-05** — Auto-resume listening-for-wake após cada ciclo de resposta (senão vira "PTT com passos extras")
- **WW-TS-06** — Timeout pós-wake de 3–5s via Silero VAD (aborta sessão se usuário não falar → evita orb travado)
- **WW-TS-07** — Threshold configurável via `.env` (`WAKE_WORD_THRESHOLD=0.5`), sem UI
- **WW-TS-08** — Fallback gracioso se `getUserMedia` falhar → modo PTT-only, tray mostra "mic unavailable"
- **WW-TS-09** — Zero áudio cloud (verificado por escolha de lib — roda 100% offline)
- **ORB-POL-07** — `prefers-reduced-motion` accessibility mode (media query CSS)

**Should have (P2 — differentiators, ship se budget de fase permitir):**
- **ORB-POL-04** — Idle breathing (hue drift sutil ±10° over 4–8s) — puro CSS, ~15 LOC
- **ORB-POL-08** — Crossfade state transitions (duas layers de gradiente, fade in/out) — ~30 LOC
- **ORB-POL-02** — Drag-to-reposition do orb (requer carveout de click-through region)

**Defer (v1.5+):**
- **ORB-POL-03** — Hover tooltip explicando estado atual (requer pointer-events rework)
- **ORB-POL-05** — Click-to-toggle PTT direto no orb (requer drag-vs-click arbitration)
- **ORB-POL-06** — Specular highlight parallax seguindo o cursor (pure eye candy, alto custo/payoff)
- **Custom/user-trained wake words** — treinamento openwakeword requer horas de dataset
- **Settings/preferences UI panel** — explicitamente deferido em PROJECT.md
- **macOS + Linux cross-platform polish** — explicitamente deferido em PROJECT.md
- **Waveform / audio meter visual no orb** — baixo valor num círculo de 128px
- **Particle effects / WebGL shader orb** — diminishing return vs CSS gradient atual

Detalhes em `.planning/research/FEATURES.md`.

### Architecture Approach

Wake word roda **no renderer**, não no main process. Decisão unânime entre STACK e ARCHITECTURE. Pipeline: `getUserMedia` (já adquirido) → `AudioContext` @ 16kHz → `AudioWorkletProcessor` buffera em frames de 1280 samples (80ms) → `onnxruntime-web` roda cadeia de 4 modelos (melspec → embed → VAD → classifier hey_jarvis) → callback `onDetected()` → `setOrbState('listening')` + `useAudioRecorder.startRecording()`. Tudo in-process, zero IPC por chunk. Main process só toca em 3 pontos: (1) `backgroundThrottling: false` no `webPreferences` da BrowserWindow (uma linha, impede Chromium throttling de janela oculta), (2) tray menu item de toggle com persistência em electron-store, (3) canal IPC único `wakeWord:toggle` broadcast tray→renderer.

**Major components (tudo novo vive em `apps/desktop/src/renderer/voice/wakeWord/`):**
1. **`WakeWordEngine.ts`** (NEW) — Orquestrador: audio pipeline, ciclo `start/stop/suspend/resume`, debounce 2s, ONNX sessions
2. **`wakeWordWorklet.js`** (NEW) — `AudioWorkletProcessor` off-main-thread, buffera Float32 em frames de 1280, posta via `port.postMessage`
3. **`modelLoader.ts`** (NEW) — Fetch + cache dos 4 arquivos `.onnx` de `resources/wakeword-models/` via `process.resourcesPath`
4. **`useWakeWord.ts`** hook (NEW) — React hook que monta o engine, subscribe em `OrbContext`, pausa em {`listening`, `processing`, `responding`}, resume em `idle`
5. **`VoiceInputManager`** (NEW, refactor crítico) — Singleton owning mic acquisition + `source: 'ptt' | 'wakeword' | null`, política "PTT sempre ganha"
6. **`ptt-hotkey.ts`** (REFACTORED) — Deixa de ter `isRecording` local, delega ao manager
7. **`tray.ts` + `store.ts`** (MODIFIED) — Item "Wake word: on/off" persistente em electron-store
8. **`Orb.tsx` + `OrbContext.tsx`** (MODIFIED, opcional) — Estado transitório `wake-detected` + CSS keyframe burst

Detalhes em `.planning/research/ARCHITECTURE.md`.

### Critical Pitfalls

1. **Porcupine/Picovoice AccessKey trap** — `bumblebee-hotword-node` (sugerida no PROJECT.md) é derivada de Porcupine e **está banida** por CLAUDE.md. Mitigação: hard-ban no CI via `grep -E "porcupine|picovoice|bumblebee-hotword" pnpm-lock.yaml && exit 1`. Usar `onnxruntime-web` + openwakeword ONNX.

2. **PTT + wake word double-trigger** — Estado atual de `ptt-hotkey.ts` tem `isRecording` module-local incompatível com segundo ator. **PREREQUISITO ABSOLUTO:** extrair `VoiceInputManager` **antes** de qualquer código de wake word. Sem isso, duas instâncias de MediaRecorder competem pelo mesmo MediaStream, orb dessincronizado, chunks corrompidos chegam ao backend.

3. **TTS self-trigger (feedback loop)** — LLM gera resposta contendo "hey JARVIS" → TTS reproduz → mic captura → wake word re-dispara → loop. Mitigação: `OrbContext` é fonte única de verdade; `useWakeWord` só roda inferência quando `state === 'idle'`. Adicionalmente, wrapper do TTS player faz `wakeword.pause()` em `beforePlay` e `wakeword.resume()` em `afterPlay + 300ms`. Não tentar AEC.

4. **CPU drain por always-on inference** — Loop ingênuo em `setInterval(16ms)` queima 8-12% CPU idle. Mitigação: (a) inferência no AudioWorklet, nunca main thread; (b) cadência via audio callback ~12.5 Hz, casando frame size de 80ms; (c) `ort.env.wasm.numThreads = 1`; (d) VAD Silero pre-filter corta CPU ~90% em sala silenciosa; (e) **success criterion bloqueante:** <2% CPU sustained após 10min de silêncio num laptop 4-core.

5. **Modelos ONNX não empacotam no Electron build** — Funciona em `pnpm dev`, quebra em `pnpm build` com `ENOENT`. Mitigação: usar `extraResources` no `electron-builder.yml` (não `asarUnpack`), runtime path helper `app.isPackaged ? process.resourcesPath : __dirname/../..`. Post-build smoke test: `unzip -l dist/*.AppImage | grep wakeword-models`.

Pitfalls moderados documentados: native build hell no Windows (mitigado por `onnxruntime-web` puro WASM), macOS permission dialog silencioso (deferido junto com macOS v1.5+), WSL/Docker sem mic (fallback via WW-TS-08), cold start do modelo (preload durante `ready-to-show`), Vite serving de AudioWorklet `.js` via `new URL(..., import.meta.url)`.

Detalhes em `.planning/research/PITFALLS.md`.

## Implications for Roadmap

v1.4 é um milestone **curto e focado** conforme PROJECT.md ("1-2 phases previstas, continuando numeração de 22"). A pesquisa suporta essa estimativa. Proposta: **2 phases sequenciais** (não paralelizáveis por risco de double-trigger).

### Phase 22: VoiceInputManager Refactor + Wake Word Core

**Rationale:** O refactor de `ptt-hotkey.ts` para `VoiceInputManager` **deve vir primeiro** — identificado em PITFALLS #3 como "prereq task: Extract VoiceInputManager from ptt-hotkey.ts". Colocar wake word em cima do código atual de PTT garante race conditions em produção.

**Delivers:**
- `VoiceInputManager` singleton com política "PTT sempre ganha sobre wake word"
- `ptt-hotkey.ts` refatorado para delegar ao manager (sem regressão do PTT atual)
- `WakeWordEngine` + `AudioWorkletProcessor` + `modelLoader` em `apps/desktop/src/renderer/voice/wakeWord/`
- 4 modelos ONNX empacotados via `extraResources` (NÃO `asarUnpack`) com runtime path resolver
- `useWakeWord` hook subscribed em `OrbContext` (gate por estado `idle`)
- Integração com TTS player: `pause()/resume()` wrapping de playback
- `backgroundThrottling: false` na BrowserWindow
- CPU budget validado: <2% sustained após 10min de silêncio (bloqueante)
- Smoke test pós-build: `pnpm build` empacota modelos e wake word funciona no artefato instalado

**Addresses features:** WW-TS-01, WW-TS-05, WW-TS-06, WW-TS-07, WW-TS-08, WW-TS-09

**Avoids pitfalls:** #1 (ban Porcupine), #2 (VoiceInputManager), #3 (OrbContext gating + TTS wrapper), #4 (CPU budget), #5 (extraResources)

**Stack:** `onnxruntime-web@1.24.3`, openwakeword ONNX models, AudioWorklet, Web Audio API nativa

### Phase 23: Orb UX Polish + Wake Word Visual Feedback

**Rationale:** Visual polish vem **depois** do wake word funcional porque WW-TS-02/ORB-POL-01 precisa de evento de detecção real — animar contra flag stub é retrabalho. Fase inerentemente mais segura (CSS + React, sem risco de corrupção de estado), ideal para fechar o milestone.

**Delivers:**
- Wake burst animation (CSS keyframe ~350ms, scale 1.0→1.1→1.0 + amber ring opacity) no estado transitório `wake-detected`
- Orb idle gradient diferenciado entre `listening-for-wake` (ACTIVE) e PAUSED (WW-TS-04)
- Tray icon variant refletindo estado de wake word
- Kill switch "Pause/Resume listening" no tray menu com persistência em electron-store
- `prefers-reduced-motion` media query cobrindo todas as keyframes do orb
- **P2 (se budget permitir):** idle breathing hue drift (ORB-POL-04), crossfade state transitions (ORB-POL-08), drag-to-reposition (ORB-POL-02)

**Addresses features:** WW-TS-02, WW-TS-03, WW-TS-04, ORB-POL-01, ORB-POL-07 (+ P2 opcional: ORB-POL-04, 08, 02)

**Avoids pitfalls:** Fase visual é baixo risco. Respeita #2 (não introduz novo ator de mic) e #4 (CSS não aumenta CPU do wake word).

**Stack:** Tailwind 4, React 19 `startTransition`, CSS keyframes nativos — zero adição.

### Phase Ordering Rationale

- **Sequencial obrigatória:** Phase 23 depende do callback `onDetected` real de Phase 22.
- **Refactor antes de feature:** Dentro de Phase 22, o `VoiceInputManager` é o primeiro commit antes de qualquer código de wake word — invariante de PITFALLS #3.
- **MVP em Phase 22, polish em Phase 23:** Se Phase 23 precisar ser cortada por tempo, Phase 22 sozinha já recupera a regressão CONV-05 e fecha o "Goal" principal do milestone.
- **Risk front-loaded:** Todo risco técnico (CPU budget, model packaging, race conditions, self-trigger loops) concentra-se em Phase 22. Phase 23 é deterministic polish.

### Research Flags

Phases likely needing **deeper research** during `/gsd:plan-phase`:
- **Phase 22** — SIM, precisa `/gsd-research-phase`. Tópicos: (a) implementação precisa do AudioWorklet pattern (Vite asset serving cross-dev/prod), (b) cadência ideal de inferência ONNX vs buffer sizing, (c) integração concreta com `electron-builder` `extraResources` + runtime path helper, (d) técnica de RMS zero-detection para pitfall #7.

Phases with **standard patterns** (pode pular research-phase):
- **Phase 23** — NÃO precisa research adicional. CSS + React sobre padrões já provados em ORB-01..04 (v1.2 shipped). Planning direto para execution.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versão `onnxruntime-web@1.24.3` verificada via npm registry em 2026-04-11. openwakeword com 5+ anos de produção. Único pacote novo, sem deps nativas. |
| Features | HIGH | 9 table-stakes derivadas de Alexa/Siri/Mycroft/Home Assistant Voice com citações. MVP cut de 10 P1 items é conservador. |
| Architecture | HIGH | Researcher leu código atual de `apps/desktop` diretamente. Decisão renderer-vs-main é forced (não opinião). 4 researchers convergiram independentemente. |
| Pitfalls | HIGH | Issues citados são de trackers oficiais (electron/electron, rhasspy/wyoming-satellite, electron-userland/electron-builder) com números específicos. VoiceInputManager refactor é identificado por leitura direta de `ptt-hotkey.ts`. |

**Overall confidence:** HIGH

### Gaps to Address

- **Cold start latency do modelo ONNX:** Estimativa "500-1000ms" veio de blog post (MEDIUM). Validar empiricamente no início da Phase 22; se >2s, preload durante `ready-to-show`.
- **Viabilidade do CSP de AudioWorklet em Electron+Vite:** Pode precisar `worker-src 'self' blob:`, mas padrão moderno (`new URL('./worklet.js', import.meta.url)`) talvez funcione out-of-the-box. Confirmar cedo em Phase 22.
- **VAD threshold default de 0.5:** Calibrado para v0.1 do hey_jarvis em ambiente específico. Mitigação já no escopo via WW-TS-07 (`.env`).
- **macOS e Linux formalmente fora de escopo**, mas pitfalls de permissão ficam documentados para re-use em v1.5+.

## Sources

### Primary (HIGH confidence)
- `apps/desktop/package.json`, `apps/desktop/src/main/ptt-hotkey.ts`, `apps/desktop/src/renderer/hooks/useAudioRecorder.ts`, `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` — leitura direta do código atual
- `/root/jarvis/.planning/PROJECT.md` — v1.4 milestone goal, target features, deferred items
- `/root/jarvis/CLAUDE.md` — exclusão explícita de Porcupine/AccessKey, política pt-BR
- [GitHub dscripka/openWakeWord](https://github.com/dscripka/openWakeWord) — Apache-2.0, `hey_jarvis_v0.1.onnx`, 4-componentes ONNX, Silero VAD bundled
- [npm onnxruntime-web 1.24.3](https://www.npmjs.com/package/onnxruntime-web) — verificado via registry 2026-04-11, MIT, Microsoft
- [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)
- [Electron Frameless Window docs](https://www.electronjs.org/docs/latest/api/frameless-window)
- [rhasspy/wyoming-satellite#185](https://github.com/rhasspy/wyoming-satellite/issues/185) — TTS self-trigger documentado
- [Picovoice Porcupine Node.js docs](https://picovoice.ai/docs/quick-start/porcupine-nodejs/) — confirma AccessKey requirement
- [npm bumblebee-hotword-node 0.2.1](https://www.npmjs.com/package/bumblebee-hotword-node) — README declara "built on Porcupine" e "NOT for Electron"
- [electron-builder extraResources docs](https://www.electron.build/configuration/contents)

### Secondary (MEDIUM confidence)
- [GitHub dnavarrom/openwakeword_wasm](https://github.com/dnavarrom/openwakeword_wasm) — referência arquitetural
- [Deep Core Labs: Open Wake Word on the Web](https://deepcorelabs.com/open-wake-word-on-the-web/)
- [UI/UX Evolution 2026 — Primotech](https://primotech.com/ui-ux-evolution-2026-why-micro-interactions-and-motion-matter-more-than-ever/) — 200–500ms micro-interaction sweet spot
- [SmoothUI Siri Orb component](https://smoothui.dev/docs/components/siri-orb)
- [Home Assistant Wake Word sensitivity discussion](https://community.home-assistant.io/t/wake-word-sensitivity/629189)

---
*Research completed: 2026-04-11*
*Ready for roadmap: yes*
