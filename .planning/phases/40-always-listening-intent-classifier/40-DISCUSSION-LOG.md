# Phase 40: Always-Listening + Intent Classifier - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 40-always-listening-intent-classifier
**Areas discussed:** Arquitetura main↔renderer, Intent classifier pt-BR, Degradation UX, Cold start + model loading

---

## Arquitetura main↔renderer

### Onde roda o loop principal de Always-Listening?

| Option | Description | Selected |
|--------|-------------|----------|
| Renderer (espelha WakeWord) | AlwaysListeningStrategy no main = coordinator stub; loop real (getUserMedia + AudioWorklet + Silero VAD) no renderer reusando WakeWordEngine patterns | ✓ |
| Main (node-record-lpcm16) | Loop 100% no main com mic capture nativo. Estado encapsulado mas duplica caminho de mic, dependency nova, conflitos de handle | |
| Hybrid (audio renderer, lógica main) | Audio capture renderer + lógica VAD/classifier no main via IPC frame-level. Centraliza modelo mas alto volume IPC | |

**User's choice:** Renderer (Recommended)
**Notes:** User pediu vantagens/desvantagens detalhadas antes de decidir. Após análise, confirmou recommended.

### Onde hospedar o intent classifier ONNX (~100MB)?

| Option | Description | Selected |
|--------|-------------|----------|
| Renderer (junto do VAD) | Carrega DistilBERT junto do VAD; reusa onnxruntime-web; classifica antes de cruzar IPC | ✓ |
| Main (Node Transformers.js) | Modelo persiste se renderer reload, mas duplica deps e exige IPC pra classificar | |

**User's choice:** Renderer (Recommended)

### Como o pre-roll de 500ms conecta ao whisper STT?

| Option | Description | Selected |
|--------|-------------|----------|
| Concatena ao utterance final | Snapshot do ring + chunks ativos → 1 WAV único → STT existente. Padrão Alexa/Google, cumpre VLISTEN-03 | ✓ |
| Envia separado como warmup chunk | Pre-roll roda em paralelo com captura ativa. Risco de quebrar word boundary | |
| Pre-roll dropado após VAD trigger | Ring buffer só pra capturar fonemas pré-trigger; depois descartado. Viola VLISTEN-03 | |

**User's choice:** Concatena ao utterance (Recommended)
**Notes:** User perguntou onde STT roda. Esclareci: main faz STT via whisper.cpp local; renderer só monta o WAV e envia via IPC.

### Que events o renderer manda pro main durante Always-Listening?

| Option | Description | Selected |
|--------|-------------|----------|
| Só utterance final | 1 event 'always-listening:utterance' quando classifier aprovar (contém WAV pra STT) | ✓ |
| Utterance + speech-start | 2 events para orb pulsar antes do STT terminar | |
| Utterance + classifier-rejected | 1 event quando aprova + 1 quando rejeita pra audit log | |

**User's choice:** Só utterance final (Recommended)
**Notes:** Inicialmente user escolheu "Frame-level contínuo" mas isso conflitava com renderer-loop (frame-level só fazia sentido na arquitetura Hybrid). Re-formulei a pergunta com opções coerentes ao renderer-loop e user confirmou Só utterance final.

---

## Intent classifier pt-BR

### Output shape do classifier

| Option | Description | Selected |
|--------|-------------|----------|
| Binário | 'intent' | 'no_intent' com score 0–1. Direto ao ponto, suficiente pro use case | ✓ |
| Multi-class | greeting/question/command/idle. Útil se Phase 41+ quiser UI feedback do tipo. YAGNI no MVP | |

**User's choice:** Binário (Recommended)

### Qual modelo HuggingFace ONNX usar?

| Option | Description | Selected |
|--------|-------------|----------|
| Xenova/multilingual-e5-small | 118M params, ~120MB, multilingual nativo (pt-BR), cosine similarity contra few-shot | ✓ |
| Xenova/distilbert-base-multilingual-cased | 134M, ~270MB. Zero-shot via NLI prompts. Maior | |
| neuralmind/bert-base-portuguese-cased (BERTimbau) | BERT pt-BR nativo (~440MB). Sem ONNX oficial — precisa converter | |

**User's choice:** Xenova/multilingual-e5-small (Recommended)

### Como configurar o threshold de confiança do classifier?

| Option | Description | Selected |
|--------|-------------|----------|
| Constante hardcoded (0.6) com env override | Const TS = 0.6; INTENT_THRESHOLD env override | ✓ |
| Settings UI slider já na Phase 40 | Slider 0.4–0.9 em Settings junto com VAD slider | |
| Adaptativo (auto-calibra com EMA) | Threshold ajusta automaticamente. Sofisticado mas opaco | |

**User's choice:** Constante hardcoded (Recommended)

### Pre-filter por STT confidence antes do classifier?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim: skip se STT confidence < 0.5 | Whisper.cpp confidence; transcripts garbled descartados antes do classifier | ✓ |
| Não: classifier sempre roda | Simplicidade máxima, sem branch | |
| Sim mas via length threshold (≥3 palavras) | Mais simples mas não cobre transcripts curtos válidos | |

**User's choice:** Sim: skip classifier se STT confidence < 0.5 (Recommended)

---

## Degradation UX

### Se o classifier ONNX falha em carregar?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-revert pra wake-word + toast | VoiceModeManager reverte automaticamente; toast acionável | ✓ |
| Fallback pra VAD-only (sem classifier) | Continua em always-listening sem filtragem. Risco de false positives | |
| Permanecer em estado erro + bloquear | Strategy.start() throw; user sem feedback | |

**User's choice:** Auto-revert pra wake-word + toast (Recommended)

### Se classifier inference passa do timeout (>300ms)?

| Option | Description | Selected |
|--------|-------------|----------|
| Send anyway + log warn | Promise.race com timeout 300ms; em timeout assume intent=true (Pitfall #3 pattern) | ✓ |
| Discard + toast warning | Descarta utterance + toast. User perde fala | |
| Eager re-load do modelo + retry | Latency stack horrível (~500ms+) | |

**User's choice:** Send anyway + log warn (Recommended)

### User pode desabilitar o classifier manualmente em Settings?

| Option | Description | Selected |
|--------|-------------|----------|
| Não no MVP | Classifier sempre ativo em Always-Listening | ✓ |
| Sim: toggle 'Filtragem de intent' | Checkbox em Settings; default ON | |
| Auto-disable se >5% utterances rejeitadas em 1h | Telemetria local + auto-fallback. Pertence à Phase 44 | |

**User's choice:** Não no MVP (Recommended)

### Audit log de utterances pra debugging?

| Option | Description | Selected |
|--------|-------------|----------|
| Off por default + opt-in via env | ENV var ALWAYS_LISTENING_AUDIT=true habilita JSONL em userData | ✓ |
| Sempre ativo, log em userData | Captura tudo automaticamente. Privacy-questionable | |
| Sem audit log (só console.log debug) | Mínimo, nada persistido | |

**User's choice:** Off por default + opt-in via env (Recommended)

---

## Cold start + model loading

### Quando o modelo ONNX é carregado em memória?

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy on first switch | Modelo carrega quando user troca pra always-listening pela 1ª vez. Pre-warm em background | ✓ |
| Eager no app startup | Carrega no main bootstrap. 1ª utterance rápida sempre. +120MB RAM permanente | |
| Eager na switch sem pre-warm | Bloqueia setMode() pra esperar load. Spinner por 200–500ms | |

**User's choice:** Lazy on first switch (Recommended)

### Onde armazenar o arquivo ONNX em disco?

| Option | Description | Selected |
|--------|-------------|----------|
| userData on-demand download | Modelo baixado em userData/models/ na 1ª switch | ✓ |
| Pre-baixado no installer | Modelo embarcado em resources/. App total +120MB | (inicial) |
| User escolhe via Settings | Toggle 'Pre-baixar modelo' antes de habilitar always-listening | |

**User's choice:** userData on-demand download (após clarificação)
**Notes:** User inicialmente escolheu "Pre-baixado no installer" + "Pre-DL background no first-launch" simultaneamente, o que conflitava. Apresentei opções A (bundled), B (download first-launch), C (híbrido). User escolheu **B**: installer leve + download background no first-launch → consistente com userData on-demand storage.

### Como tratar falha de download do modelo?

| Option | Description | Selected |
|--------|-------------|----------|
| Toast + revert pra wake-word | Mesma estratégia do load fail (consistente) | ✓ |
| Retry com backoff exponencial | 3 tentativas (1s, 5s, 15s) antes de revert | |
| Bloquear switch + dialog modal | UX explicativa mas viola Phase 39 D-01 | |

**User's choice:** Toast + revert pra wake-word (Recommended)

### Pre-baixar modelo durante install/first-launch ou só quando user pedir?

| Option | Description | Selected |
|--------|-------------|----------|
| Só quando user pedir | Download dispara só na 1ª switch | (inicial) |
| Pre-DL background no first-launch | Após primeiro app open, baixa silenciosamente em background | ✓ |
| Settings UI: botão 'Baixar modelo agora' opt-in | Power user feature explícita | |

**User's choice:** Pre-DL background no first-launch (após clarificação)

---

## Claude's Discretion

- VAD silence threshold default value (recomenda 500ms — alinha com Alexa/Google standard)
- Few-shot examples pt-BR — Claude escolhe o set inicial (~20–30 exemplos)
- Settings UI slider design — segue pattern v1.7 existente
- Module structure — single file vs folder baseado em tamanho final
- Ring buffer — `ringbufferjs` 2.0 vs implementação manual com Float32Array
- IPC event naming — namespace consistente com contracts existentes

## Deferred Ideas

- Multi-class intent labels (greeting/question/command/idle) — reconsiderar quando UI consumir tipo
- Settings UI slider para classifier threshold — quando user reportar false positives reais
- Toggle "Filtragem de intent" em Settings — Phase 44 se hardening pedir
- Auto-disable classifier se >5% rejeitadas em 1h — Phase 44 hardening
- Versionamento de modelo + auto-update background — quando houver 2+ versões
- `vad:speech-start` event para orb feedback — Phase 42 quando UI precisar
- `forceFlush()` na Strategy interface — Phase 43 (VPTT-03)
- macOS permission re-check antes de Strategy.start() — Phase 44 (Pitfall #6)
- Few-shot examples editáveis pelo user via Settings — sem demanda
- Telemetry opt-in pra threshold miscalibration detection — Phase 44 ou v1.10
