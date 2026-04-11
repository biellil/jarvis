---
phase: 22
phase_name: VoiceInputManager Refactor + Wake Word Core
gathered: 2026-04-11
status: Ready for research
---

# Phase 22: VoiceInputManager Refactor + Wake Word Core — Context

**Gathered:** 2026-04-11
**Status:** Ready for research

<domain>
## Phase Boundary

Phase 22 tem dois entregáveis técnicos acoplados em um só goal:

1. **VoiceInputManager refactor** — extrair singleton dono da aquisição de microfone de `apps/desktop/src/main/ptt-hotkey.ts`, com campo `source: 'ptt' | 'wakeword' | null` e política "PTT sempre ganha". Este refactor é **pré-requisito absoluto** e deve ser o primeiro commit da phase, antes de qualquer código de wake word.
2. **Wake Word Core** — implementar detecção "Hey JARVIS" rodando continuamente no renderer do Electron via `onnxruntime-web` + modelos openwakeword ONNX, integrada ao pipeline de voz existente, gated por `OrbContext` pra prevenir TTS self-trigger loop.

**Requirements mapeados:** WAKE-01, WAKE-05, WAKE-06, WAKE-07, WAKE-08, WAKE-09

**Fora do escopo desta phase:** Feedback visual (wake burst animation, orb distinction idle-ativo vs paused, tray menu kill switch, `prefers-reduced-motion`) — tudo isso está em Phase 23 (WAKE-02, WAKE-03, WAKE-04, ORB-POL-01, ORB-POL-02).

</domain>

<decisions>
## Implementation Decisions

### Wake Word Phrase

**Decision:** Usar o modelo pré-treinado oficial `hey_jarvis_v0.1.onnx` do openwakeword.

**Rationale:** É o único modelo pré-treinado com a palavra "JARVIS" disponível publicamente. Na prática, o "hey" pode ser falado rápido/baixo ou quase engolido — basta enfatizar "JARVIS" pra disparar. Zero esforço extra, resultado em dias e não semanas. Custom model "jarvis" standalone exigiria treinamento dedicado (~1 semana) via geração sintética de dataset com TTS + pipeline openwakeword Python, o que justifica uma phase própria em milestone futuro.

**Deferred para v1.5+:** Treinamento de modelo custom "jarvis" puro. Seed plantada.

### Sensitivity / Detection Threshold

**Decision:** Threshold default de **0.5** (sensível).

**Rationale:** Trade-off deliberado — mais sensível pega "Hey JARVIS" mesmo abafado, mais responsivo no uso real. Falsos positivos de TV/música são filtrados pelo guard de `OrbContext === 'idle'` (pausa durante TTS/responding), e o VAD Silero pre-filter corta maior parte do ruído antes da inferência. Usuário pode ajustar via `.env` (`WAKE_WORD_THRESHOLD=0.5`) sem recompilar.

### Audible Cue on Detection

**Decision:** **Silencioso** — apenas feedback visual.

**Rationale:** Wake burst animation no orb (Phase 23) é feedback suficiente. Beep seria intrusivo, atrapalhando música/outros apps. Alinhado com o princípio visual-first do JARVIS desktop (widget transparente, click-through, minimalista). A infra de áudio pré-gravado só pra beep é código extra desnecessário. Se o usuário quiser beep no futuro, é feature trivial de adicionar via electron-store config.

### Default State on First Launch

**Decision:** Wake word **ligado** por default no primeiro launch.

**Rationale:** "Assistente pessoal para uso próprio" — usuário único, sabe o que instalou, já deu permissão de mic no prompt do SO. Opt-in desligado adicionaria fricção ("por que não funciona?"). Kill switch no tray (Phase 23) permite desligar quando quiser — opt-out explícito é suficiente. Configuração persiste em electron-store entre sessões.

### Post-Wake VAD Timeout

**Decision:** **3 segundos** de janela de captura pós-detecção (mínimo da range 3-5s permitida por WAKE-06).

**Rationale:** Favorece responsividade sobre folga. Falsos positivos ou "eu quis falar e desisti" destravam rápido — orb não fica preso 5s. Para quem pensa antes de falar, o VAD Silero detecta fala assim que começa e estende a sessão naturalmente. Configurável via `.env` se precisar ajustar (`WAKE_WORD_VAD_TIMEOUT_MS=3000`).

### Claude's Discretion

Áreas onde o planner/researcher tem autonomia pra decidir (não discutidas com o usuário por serem puramente técnicas):

- Frame size do AudioWorkletProcessor (typical 1280 samples @ 16kHz = 80ms)
- Debounce window pós-detecção (typical 2s pra evitar múltiplos triggers em sequência)
- ONNX session options (`executionProviders: ['wasm']`, `wasm.numThreads: 1`)
- Cold start strategy — preload durante `ready-to-show` vs lazy on first idle
- Diretório exato dos modelos (sugerido por research: `apps/desktop/resources/wakeword-models/`)
- Runtime path resolver pattern (`app.isPackaged ? process.resourcesPath : __dirname/../..`)
- Estrutura de IPC pra `wakeWord:toggle` (broadcast pattern vs request-response)
- Naming exato de eventos/callbacks no `VoiceInputManager`
- Nome dos canais IPC existentes que precisam renomear (se algum)

### Locked by Research (não revisitar)

Estas decisões já estão travadas pelo SUMMARY.md e research files, não abrir discussão:

- **Lib:** `onnxruntime-web@1.24.3` + openwakeword ONNX models (rejeitados: bumblebee-hotword-node, porcupine-node, snowboy, vosk)
- **Processo:** Renderer (não main) — reusa `getUserMedia`, zero IPC por chunk, preserva contextIsolation
- **Refactor first:** `VoiceInputManager` é o primeiro commit, antes de qualquer wake word code
- **Packaging:** `extraResources` no electron-builder, NÃO `asarUnpack`
- **CPU budget:** <2% sustained após 10min silêncio (blocker)
- **`backgroundThrottling: false`** obrigatório na BrowserWindow
- **Gate por OrbContext:** detecção só roda quando `state === 'idle'` (anti TTS self-trigger)
- **TTS player wrap:** `wakeword.pause()` em beforePlay, `wakeword.resume()` em afterPlay + 300ms
- **PTT sempre ganha:** política de arbitragem do `VoiceInputManager`

</decisions>

<specifics>
## Specific Ideas

### Environment Variables (new)

```bash
# apps/desktop/.env
WAKE_WORD_ENABLED=true              # Default ligado
WAKE_WORD_THRESHOLD=0.5             # Sensibilidade — sensível
WAKE_WORD_VAD_TIMEOUT_MS=3000       # 3s janela pós-wake
WAKE_WORD_MODEL=hey_jarvis_v0.1     # Nome do modelo (pra trocar no futuro)
```

### Model Files to Download (4 arquivos, ~4 MB total)

Baixar de [https://github.com/dscripka/openWakeWord/releases](https://github.com/dscripka/openWakeWord/releases) ou HuggingFace:

1. `melspectrogram.onnx` — front-end de features
2. `embedding_model.onnx` — shared embedding backbone
3. `silero_vad.onnx` — voice activity detection
4. `hey_jarvis_v0.1.onnx` — classifier final

Destino: `apps/desktop/resources/wakeword-models/`

### User-Visible Behavior (no final de Phase 22)

- Usuário instala o app → mic permission prompt do SO → concede → orb aparece em idle
- Primeira fala "Hey JARVIS" → orb vai pra listening em ≤500ms
- Usuário fala comando → JARVIS processa → responde (estado atual — já funciona)
- Após TTS terminar, orb volta pro idle e wake word retoma sozinho
- Se falar "Hey JARVIS" mas depois ficar em silêncio por 3s → orb volta pro idle sem ação
- Se pressionar Ctrl+Space (PTT) durante qualquer momento → wake word pausa, PTT captura, depois retoma
- Sem feedback visual específico de wake detectado além da transição idle→listening (isso fica pra Phase 23)

</specifics>

<canonical_refs>
## Canonical References

- **SUMMARY.md** — `.planning/research/SUMMARY.md` (síntese da pesquisa, travando decisões técnicas)
- **STACK.md** — `.planning/research/STACK.md` (rejeições detalhadas de libs)
- **ARCHITECTURE.md** — `.planning/research/ARCHITECTURE.md` (pipeline renderer, componentes)
- **PITFALLS.md** — `.planning/research/PITFALLS.md` (12 pitfalls específicos, mitigações)
- **REQUIREMENTS.md** — WAKE-01, WAKE-05, WAKE-06, WAKE-07, WAKE-08, WAKE-09
- **ROADMAP.md** — Phase 22 detalhes + critério de aceitação bloqueante de CPU
- [openWakeWord GitHub](https://github.com/dscripka/openWakeWord) — Apache-2.0, modelos ONNX
- [onnxruntime-web @1.24.3 npm](https://www.npmjs.com/package/onnxruntime-web)
- [Electron extraResources docs](https://www.electron.build/configuration/contents)
- [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)

</canonical_refs>

<deferred>
## Deferred Ideas

Ideas surfaced during discussion but explicitly out of scope for Phase 22:

- **Custom "jarvis" standalone wake word model** — Treinamento sintético com TTS + pipeline openwakeword Python. Estimated ~1 week. Seed plantada pra v1.5+ como milestone candidate.
- **Audible cue configurable** — `JARVIS_WAKE_BEEP=true` env var. Simples de adicionar depois se o usuário mudar de ideia.
- **Mic device selection** — Se o usuário tiver múltiplos mics. v1.4 usa system default. Deferred.
- **Custom threshold calibration UI** — Slider em Settings panel. Deferred (Settings UI está fora de escopo do v1.4).
- **Voice activity meter visual** — Barra de nível de áudio no orb. Fora de escopo — Settings feature.

</deferred>
