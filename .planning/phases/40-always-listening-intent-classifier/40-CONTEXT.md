# Phase 40: Always-Listening + Intent Classifier - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 40 entrega a **`AlwaysListeningStrategy`** completa — implementação concreta da Strategy stub-ada na Phase 39 ([voiceMode/index.ts:106](apps/desktop/src/main/voiceMode/index.ts#L106)). Inclui: loop contínuo de mic + Silero VAD detectando fim de fala (silence threshold 300–800ms configurável), ring buffer pre-roll de 500ms preservando primeiros fonemas, intent classifier local (Transformers.js + Xenova/multilingual-e5-small ONNX) filtrando falsos positivos, e Settings UI slider para VAD threshold com preview em tempo real.

**Não inclui:** Tray menu de mode switch (Phase 41), orb visual per-mode (Phase 42), implementação do PttOnlyStrategy (Phase 43), VPTT-03 hotkey override em Always-Listening (Phase 43 quando `forceFlush` for adicionado à interface), permission re-check macOS (Phase 44), config migration (Phase 44).

</domain>

<decisions>
## Implementation Decisions

### Arquitetura Execution Location
- **D-01:** `AlwaysListeningStrategy` no main é coordinator stub espelhando `WakeWordStrategy` (Phase 39). Loop real de captura (getUserMedia + AudioWorklet + Silero VAD via onnxruntime-web + ring buffer + classifier) vive no **renderer**, reusando AudioContext/Worklet patterns de [WakeWordEngine.ts](apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts). Main controla lifecycle via IPC: `'always-listening:start' | 'always-listening:stop'`.
- **D-02:** Intent classifier ONNX hospedado no **renderer**, junto do VAD. Reusa `onnxruntime-web` já em dependency. Classifica antes de cruzar IPC pra main (utterances rejeitadas nem chegam ao backend STT). Trade-off: re-load se renderer crashar/reload (raríssimo em prod), mas evita dependency duplicada (`onnxruntime-node`).
- **D-03:** Pre-roll ring buffer (500ms = 8000 samples @ 16kHz, Float32Array circular) vive no renderer. Quando VAD detecta speech end + classifier aprova → renderer concatena `[snapshot do ring] + [chunks ativos da utterance]` em 1 WAV único → envia via IPC pro main rodar `voiceHandler.handleAudio` (pipeline existente STT→LLM→TTS).
- **D-04:** Contrato IPC main↔renderer é **utterance-level apenas**: 1 event `'always-listening:utterance'` por fala detectada e aprovada (payload: WAV buffer). Volume IPC mínimo, payload bounded ~5–100KB. Eventos extras (speech-start pra orb feedback, classifier-rejected pra audit) ficam para Phase 42 quando UI pedir explicitamente.

### Intent Classifier Behavior
- **D-05:** Classifier output é **binário** — `intent | no_intent` com score 0–1. Sem multi-class (greeting/question/command/idle). YAGNI no MVP — único consumer hoje é a decisão "envia pro pipeline ou descarta". Multi-class fica deferred para quando Phase 41+ consumir tipo de intent.
- **D-06:** Modelo é **`Xenova/multilingual-e5-small`** (118M params, ~120MB ONNX) — multilingual nativo (suporta pt-BR sem fine-tuning), inference 30–80ms CPU. Estratégia: cosine similarity entre embedding da transcript e embeddings de few-shot examples pt-BR pré-computados na build time (não inference time).
- **D-07:** Threshold de confiança é **constante hardcoded `INTENT_THRESHOLD = 0.6`** com override via env var `INTENT_THRESHOLD=0.7`. Settings UI fica para v1.10 (`VPOLISH-03`) se user reportar false positives reais. Sem threshold adaptativo no MVP.
- **D-08:** **Pre-filter por STT confidence**: skip classifier se `whisper.cpp` retornar confidence < 0.5 (ou se transcript for vazio/só pontuação). Mitigação direta de Pitfall #5 — transcripts garbled não são scored pelo classifier (CPU saving + accuracy guard contra noise).

### Degradation & Fallback UX
- **D-09:** **Classifier load fail (modelo corrompido, disk error, init exception)**: `AlwaysListeningStrategy.start()` throw → `VoiceModeManager.setMode()` cai no path "Strategy not ready" existente ([voiceMode/index.ts:198-203](apps/desktop/src/main/voiceMode/index.ts#L198-L203)) que retorna `false` mantendo o último modo funcional. Phase 40 **adiciona** um event `'voiceMode:degraded'` (payload: `{attemptedMode, reason: 'classifier-load-fail', message}`) que tray (Phase 41) consome para emitir toast acionável.
- **D-10:** **Classifier inference timeout (>300ms — Pitfall #3)**: `Promise.race([classifier.classify(), timeout(300)])`. Em timeout, **assume `intent=true`** e envia utterance pro pipeline (send-anyway). Log `warn` com latência medida. Side-effect aceito: ~1–5% utterances passam sem filtro em momentos de CPU congestionado, mas user nunca perde fala.
- **D-11:** **Sem toggle de disable do classifier no MVP**. Classifier sempre ativo em always-listening. Adicionar toggle se Phase 44 hardening pedir baseado em telemetria (auto-disable se >5% rejected em 1h fica deferred).
- **D-12:** **Audit log opt-in via env var `ALWAYS_LISTENING_AUDIT=true`** → escreve JSONL estruturado em `${userData}/always-listening-audit.jsonl` com `{timestamp, transcript, sttConfidence, classifierScore, verdict}`. **Off por default** (privacy-first). Nada cruza pra cloud, nunca. Útil pra dev/power user calibrar threshold ou debugar false positives.

### Cold Start & Model Loading
- **D-13:** **Lazy load em memória**: modelo só é instanciado em RAM quando user troca pra always-listening pela 1ª vez na sessão. Após carregado, fica residente até `dispose()` (mode switch saindo de always-listening). Custo de 1ª utterance (~200–500ms cold start) mitigado pelo send-anyway timeout (D-10).
- **D-14:** **Storage em userData** (`${app.getPath('userData')}/models/multilingual-e5-small/`), **não bundled no installer**. Mantém installer leve. Padrão Transformers.js usa esse path automaticamente via `env.cacheDir`.
- **D-15:** **Pre-download silencioso em background no first-launch** do app — após `app.whenReady()`, dispara fetch do modelo do Hugging Face em background sem bloquear UI nem startup. Always-listening fica pronto antes do user pedir (típico ~30–60s em conexão decente). Progresso visível só em log debug.
- **D-16:** **DL fail UX**: emite mesmo `'voiceMode:degraded'` event de D-09 com `reason: 'classifier-download-fail'`. Tray emite toast: "Sem internet pra baixar classifier de intent. Voltei pro Wake Word — tente Always-Listening de novo quando estiver online." Próximo switch pra always-listening retenta DL automaticamente.

### Claude's Discretion

Áreas onde Claude tem flexibilidade na implementação:
- **VAD silence threshold default value** (dentro do range 300–800ms VLISTEN-04). Recomenda 500ms (alinha com OpenAI/Alexa/Google standard mencionado em research).
- **Few-shot examples pt-BR** pré-computados — Claude escolhe o set inicial (~20–30 exemplos cobrindo: comandos típicos, perguntas, greetings, vs ruído/conversa casual). Lista vive em arquivo TS dedicado tipo `intentExamples.pt-BR.ts` versionado.
- **Settings UI slider design** — pattern já estabelecido em v1.7 ([settingsWindow.ts](apps/desktop/src/main/settingsWindow.ts) + renderer Settings panel). Claude segue pattern existente (slider numeric + label + reset to default).
- **Module structure** — `voiceMode/strategies/alwaysListening.ts` (single file) ou `voiceMode/strategies/alwaysListening/{index, vadLoop, classifier, ringBuffer}.ts` (folder). Folder se passar de ~250 linhas.
- **Ring buffer implementação** — `ringbufferjs` 2.0 conforme research, ou implementação manual com Float32Array circular (research traz exemplo). Claude escolhe baseado em maturidade da lib + footprint.
- **Naming do IPC event** — `'always-listening:utterance'` é o canônico, mas Claude pode escolher namespace consistente com IPC contracts existentes em [shared/ipc-types.ts](apps/desktop/src/shared/ipc-types.ts).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §"Always-Listening Mode (VLISTEN)" — VLISTEN-01..04 são as fontes de verdade
- `.planning/milestones/v1.9-ROADMAP.md` §"Phase 40: Always-Listening + Intent Classifier" — goal, success criteria, depends-on (Phase 39)

### Research (v1.9)
- `.planning/research/SUMMARY.md` §"Phase 40" — stack recomendada, build order, riscos identificados
- `.planning/research/PITFALLS.md` §"Pitfall 1: VAD Threshold Miscalibration" — slider configurável + 3-environment test
- `.planning/research/PITFALLS.md` §"Pitfall 2: Audio Buffer Memory Leak" — ringbufferjs fixed-size + soak test 8h (Phase 44)
- `.planning/research/PITFALLS.md` §"Pitfall 3: Intent Classifier Cold Start" — eager load + timeout fallback (D-10, D-13)
- `.planning/research/PITFALLS.md` §"Pitfall 5: Intent Classifier Language Bias (pt-BR)" — few-shot examples pt-BR + STT confidence pre-filter (D-06, D-08)

### Phase 39 carry-forward (foundation)
- `.planning/phases/39-voice-mode-state-machine/39-CONTEXT.md` — decisões D-01..D-08 da Phase 39 (Strategy interface minimal, lifecycle lazy, payload rich)
- `apps/desktop/src/main/voiceMode/index.ts` — VoiceCaptureStrategy interface (D-03 da Phase 39); AlwaysListeningStrategy entra em [voiceMode/index.ts:106](apps/desktop/src/main/voiceMode/index.ts#L106) substituindo o factory throw

### Codebase patterns
- `apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts` — pattern de Silero VAD via onnxruntime-web no renderer; AudioContext + AudioWorklet lifecycle; mel/embedding pipeline reference
- `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` — encoding WAV + IPC pra main + handle response audio
- `apps/desktop/src/main/voiceInput/voiceHandler.ts` — pipeline STT→LLM→TTS no main que recebe o WAV via IPC `chat:send-audio`
- `apps/desktop/src/main/voiceInput/whisperResources.ts` — `getWhisperInstance` + `transcribeData` (verificar se expõe confidence pra D-08)
- `apps/desktop/src/main/store.ts` — electron-store wrapper; adicionar campo `vadSilenceThresholdMs?: number` (default 500) ao StoreSchema
- `apps/desktop/src/shared/ipc-types.ts` — adicionar `AlwaysListeningUtterancePayload` type + `'always-listening:utterance'` channel + `VoiceModeDegradedEvent` type
- `apps/desktop/src/main/settingsWindow.ts` — pattern de Settings UI pra adicionar slider VLISTEN-04

### Project context
- `CLAUDE.md` — git commit conventions (português, emoji + Conventional Commits)
- `.planning/PROJECT.md` §"Privacy-first" — classifier local default (não cloud), audit log off default, áudio descartado após STT

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **WakeWordEngine pattern** ([WakeWordEngine.ts](apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts)): AudioContext + AudioWorklet @ 16kHz, mel pipeline, Silero VAD via onnxruntime-web. AlwaysListeningStrategy renderer-side reusa esse pattern (mesma sample rate, mesmo VAD model, mesma session loading).
- **VoiceCaptureStrategy interface** ([voiceMode/index.ts:25-34](apps/desktop/src/main/voiceMode/index.ts#L25-L34)): 4 métodos `start/stop/dispose/getStatus`. AlwaysListeningStrategy implementa direto sem extender interface (D-03 Phase 39: minimal interface).
- **Strategy factory pattern** ([voiceMode/index.ts:104-108](apps/desktop/src/main/voiceMode/index.ts#L104-L108)): substituir o throw factory de `'always-listening'` por `() => new AlwaysListeningStrategy(deps)`.
- **electron-store wrapper** ([store.ts](apps/desktop/src/main/store.ts)): pattern existente de campo opcional + default — aplicar idêntico para `vadSilenceThresholdMs`.
- **voiceHandler.handleAudio pipeline** ([voiceHandler.ts](apps/desktop/src/main/voiceInput/voiceHandler.ts)): WAV → whisper.cpp → LLM → TTS. AlwaysListeningStrategy reusa via IPC `chat:send-audio` ou novo `always-listening:utterance` que despacha pro mesmo handler.
- **Renderer encoding** ([encodeFloat32ToWav.ts](apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.ts)): converter Float32Array (do AudioWorklet) pra WAV buffer (ringBuffer + utterance chunks).

### Established Patterns
- **VoiceCaptureStrategy minimal interface (Phase 39 D-03)**: NÃO adicionar `forceFlush()` agora. Phase 43 adicionará à interface quando implementar VPTT-03. Phase 40 só implementa start/stop/dispose/getStatus.
- **Lazy lifecycle (Phase 39 D-04)**: VoiceModeManager dispose() da Strategy antiga ao trocar; instancia nova só quando ativada. AlwaysListeningStrategy DEVE liberar tudo (AudioContext, mic stream, classifier model, ring buffer) em dispose() — pré-requisito do soak test 8h da Phase 44.
- **Setting field naming**: `vadSilenceThresholdMs` (camelCase ms suffix) consistente com outros fields ms-typed do store.
- **IPC channel naming**: `<feature>:<event>` namespace (existing: `wake-word:detected`, `chat:send-audio`). Novo: `always-listening:utterance`.
- **Default via `??` no read** (`store.get('vadSilenceThresholdMs') ?? 500`): idiom já em uso em store.ts.

### Integration Points
- **VoiceModeManager** ([voiceMode/index.ts:106](apps/desktop/src/main/voiceMode/index.ts#L106)): factory de `'always-listening'` muda do throw stub para `() => new AlwaysListeningStrategy(deps)`. AlwaysListeningStrategy precisa de injected deps: store accessor para vadSilenceThresholdMs, BrowserWindow ref para enviar IPC start/stop.
- **Settings UI**: novo slider em Settings panel renderer, novo handler IPC em [ipc/settings.ts](apps/desktop/src/main/ipc/settings.ts) para SAVE/GET de vadSilenceThresholdMs, propagação em tempo real pro renderer Always-Listening loop via IPC `'always-listening:vad-threshold'`.
- **Phase 41 (Tray)**: nada bloqueante — Phase 40 só expõe API que VoiceModeManager já tem. Phase 41 pode rodar em paralelo (já planejado em ROADMAP).
- **Phase 42 (Orb feedback)**: vai querer escutar 'vad:speech-start' pra pulsar — Phase 40 NÃO emite isso (D-04). Phase 42 adicionará secondary event quando precisar.
- **Phase 43 (VPTT-03 hotkey override)**: precisa de `forceFlush()` na AlwaysListeningStrategy. Phase 43 estende a interface + implementa o método; Phase 40 não antecipa.
- **Phase 44 (Hardening)**: soak test 8h da AlwaysListeningStrategy + permission re-check em macOS antes de start(). Phase 40 não trata permission ativamente.

</code_context>

<specifics>
## Specific Ideas

- **Few-shot examples pt-BR** devem cobrir explicitamente: comandos curtos ("abre", "fecha", "liga"), perguntas WH ("que horas", "como tá", "qual"), greetings (oi/olá/ei JARVIS), confirmações ("sim", "ok", "tá bom") COMO POSITIVOS, e ruído típico ("uh", "hmm", "deixa", filler words) COMO NEGATIVOS. Pre-computar embeddings na build time para evitar recomputar a cada classify call.
- **Pitfall #2 (memory leak)** é responsabilidade da Phase 40 mesmo que soak test seja Phase 44 — usar `ringbufferjs` fixed-size, dispose() correto do AudioContext + mic stream, sem accumular Float32Array fora do ring buffer.
- **VAD threshold real-time apply**: slider em Settings deve aplicar mudança sem reiniciar always-listening — IPC handler chama método na strategy ativa que reconfigura `negativeFramesToClose` do Silero VAD em runtime.
- **Send anyway em timeout (D-10)**: log estruturado pra diferenciar utterances classificadas vs send-anyway (`{verdict: 'classified-intent' | 'classified-no-intent' | 'timeout-send-anyway'}`) — útil pra telemetria futura.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-class intent labels (greeting/question/command/idle)** — reconsiderar quando UI consumir tipo de intent (ex: orb pulsar diferente por tipo). Não há consumer hoje.
- **Settings UI slider para classifier threshold** — adicionar quando user reportar false positives reais (Pitfall #1 mitigation já cobre via VAD threshold slider).
- **Toggle "Filtragem de intent" em Settings** (VAD-only mode dentro de always-listening) — reconsiderar em Phase 44 se telemetria mostrar classifier degradando muito.
- **Auto-disable classifier se >5% rejeitadas em 1h** — Phase 44 hardening (precisa estado persistente novo).
- **Versionamento de modelo + auto-update em background** (Híbrido C) — adicionar quando houver 2+ versões do modelo.
- **`vad:speech-start` event para orb feedback** — Phase 42 adicionará quando UI precisar pulsar antes do STT terminar.
- **`forceFlush()` na Strategy interface (VPTT-03)** — Phase 43 adicionará à interface comum + implementará na AlwaysListeningStrategy.
- **macOS permission re-check antes de Strategy.start()** — Phase 44 hardening (Pitfall #6).
- **Few-shot examples editáveis pelo user via Settings** — power user feature, sem demanda agora.
- **Telemetry opt-in pra utterances <500ms ou >30s** (threshold mal calibrado detection) — Phase 44 ou v1.10.

</deferred>

---

*Phase: 40-always-listening-intent-classifier*
*Context gathered: 2026-04-25*
