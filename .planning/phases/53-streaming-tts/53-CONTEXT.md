# Phase 53: Streaming TTS - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

JARVIS inicia o playback de voz na primeira sentença completa sem esperar a resposta inteira do LLM. Escopo: chunking sentence-level no Electron, fila de playback sem gap, feature flag toggleable sem restart, barge-in compatível com voice mode atual. Fora de escopo: WebSocket TTS nativo, alinhamento word-level, pause/resume, novos providers, Murf streaming real.

</domain>

<decisions>
## Implementation Decisions

### Fluxo SSE → sentenças → TTS
- **D-01:** voiceHandler consome `/chat/stream` (SSE existente), acumula tokens em buffer, e ao detectar `[.!?]\s+` recorta a sentença e dispara `synthesize()` em paralelo (não-bloqueante). Continua bufferando tokens subsequentes.
- **D-02:** Chunking usa regex literal `[.!?]\s+` (spec STTS-01). Sem lista de exceções para abreviações/decimais no MVP — casos raros em respostas conversacionais.
- **D-03:** Latency target — Claude's discretion. Implementar caminho simples primeiro; medir; otimizar com pre-warm de conexão TTS apenas se >1s consistentemente.
- **D-04:** Ao final do stream SSE, qualquer texto residual no buffer (sem terminador) é flushado como última sentença.

### Playback queue no renderer
- **D-05:** Renderer usa **Web Audio API com `AudioBufferSourceNode`**. Decoda cada chunk mp3 → `AudioBuffer` via `audioContext.decodeAudioData()`, agenda `source.start(when)` com sample-accurate scheduling (`when = lastEnd`). Garante zero silêncio entre sentenças (success criteria #2).
- **D-06:** Main → renderer via IPC `tts:chunk` por sentença, payload `{ turnId, idx, audioBase64, format, isLast }`. Padrão consistente com IPC existente. Renderer enfileira por `turnId`.
- **D-07:** Orb visual transiciona `thinking → speaking` no callback `source.onstart` (ou no momento agendado para o primeiro AudioBuffer começar a tocar) — não antes. Honesto com o usuário.

### Provider streaming + Murf fallback
- **D-08:** Streaming = **per-sentença HTTP `synthesize()`** para AMBOS os providers (Murf e ElevenLabs). Mesmo código path. Murf não regride — apenas troca uma chamada longa por várias curtas paralelas, melhorando latency percebida.
- **D-09:** WebSocket TTS nativo do ElevenLabs **não** será implementado nesta fase. Defer para v2.3+. ROI baixo dado que sentence-level HTTP já atende success criteria <1s.

### Feature flag + barge-in
- **D-10:** `STREAMING_TTS` mora em **electron-store** com toggle em Settings UI (padrão Phase 52 SEXT). Boolean, default `false` na v2.2 inicial. Sem env var override.
- **D-11:** Toggle aplica **no próximo turno** — flag é lida no início de cada `handleVoiceTurn()`. Turno em andamento termina no modo em que começou. Sem corner cases mid-stream.
- **D-12:** Barge-in (wake word ou PTT durante playback streaming): aborta `fetch` SSE (AbortController), descarta `synthesize()` in-flight (promises ignoradas via flag de cancelamento por turnId), chama `source.stop()` em todos `AudioBufferSourceNode` agendados/tocando. Reaproveita eventos de voice mode existentes (Phase 39).

### Claude's Discretion
- Latency budget exato e necessidade de pre-warm (D-03)
- Estratégia de gestão de `AudioContext` (singleton vs per-turn) — manter consistente com pipeline existente
- Estrutura interna do buffer/chunker (state machine vs string splitter)

### Folded Todos
*Nenhum.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Phase 53 — goal e success criteria
- `.planning/REQUIREMENTS.md` §STTS — STTS-01 (chunking `[.!?]\s+` no Electron) e STTS-02 (feature flag sem restart)
- `.planning/REQUIREMENTS.md` §"Out of Scope (v2.2)" — Murf streaming real, word-level alignment, pause/resume, PCM custom

### Backend SSE (já existente)
- `apps/backend-ts/src/routes/chat.ts` — endpoint `GET /chat/stream` SSE, lock por turno, `data: <token>\n\n`
- `apps/backend-ts/src/routes/chat.test.ts` — contract tests do SSE
- `apps/backend-ts/src/llm/factory.ts` — `streaming: true` em todos os 3 providers
- `apps/backend-ts/src/llm/capabilities.ts` — capability matrix de streaming

### TTS providers (Electron main)
- `apps/desktop/src/main/voiceInput/tts/provider.ts` — interface `TTSProvider.synthesize(text)`
- `apps/desktop/src/main/voiceInput/tts/index.ts` — factory `createTTSProvider()` com fallback
- `apps/desktop/src/main/voiceInput/tts/murf.ts` — provider Murf
- `apps/desktop/src/main/voiceInput/tts/elevenlabs.ts` — provider ElevenLabs
- `apps/desktop/src/main/voiceInput/voiceHandler.ts` — fluxo full-response atual (a ser estendido com path streaming)

### Settings & feature flag pattern
- `apps/desktop/src/main/store.ts` — electron-store schema (referência para adicionar `streamingTts`)
- `apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx` — onde adicionar o toggle
- `apps/desktop/src/main/ipc/settings.ts` — padrão IPC para flips sem restart (Phase 52)

### Voice mode & barge-in
- `.planning/phases/39-voice-mode-state-machine/39-CONTEXT.md` — state machine `idle/listening/thinking/speaking`
- Eventos existentes de wake-word/PTT que devem disparar cancelamento

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Backend `/chat/stream`**: SSE com token-level streaming já existe nos 3 providers (LM Studio/OpenAI/Claude) via `streaming: true` no factory. Phase 53 só consome — nada a fazer no backend.
- **`TTSProvider.synthesize(text)`**: interface estável, retorna `{ audio: Buffer, format }`. Não precisa de mudança de assinatura para sentence-level.
- **Padrão IPC sem restart (Phase 52 SEXT)**: `electron-store` + IPC channel + reload no main. Replicar para `streamingTts`.
- **Voice mode state machine (Phase 39)**: estados `thinking → speaking` e eventos de barge-in já modelados.

### Established Patterns
- **Graceful degrade em TTS**: voiceHandler atual loga e devolve `audioBase64: null` em falha (WAKE-10 precedent). Manter — falha em UMA sentença não deve quebrar o turno; pular para próxima.
- **Provider abstraction**: nunca chamar Murf/ElevenLabs direto — sempre via `TTSProvider`. Streaming preserva isso (apenas chama `synthesize` mais vezes).
- **Reinicialização live**: módulo TTS já tem `_currentTtsProvider` mutável atualizado via `reinitializeTTS()`. Padrão a seguir para `streamingTts` flag (singleton lido por turno).

### Integration Points
- `voiceHandler.handleVoiceTurn()` — bifurca em `if (streamingEnabled) { streamingFlow() } else { existingFlow() }`. Existing flow intacto = sem regressão.
- IPC novo `tts:chunk` — adicionar em `apps/desktop/src/shared/ipc-types.ts`.
- Renderer audio queue — provavelmente em `apps/desktop/src/renderer/src/voice/` (verificar Phase 39 layout).

</code_context>

<specifics>
## Specific Ideas

- "Per-sentença HTTP para ambos providers, mesmo código path" — usuário priorizou simplicidade e paridade Murf/ElevenLabs sobre latency mínima.
- Barge-in deve "aproveitar voiceMode existente" — sinal de que não há apetite por nova máquina de estados; reutilizar eventos atuais.
- Latency `<1s` é success criteria, não obsessão — usuário deixou para Claude decidir se pre-warm vale a complexidade.

</specifics>

<deferred>
## Deferred Ideas

- **WebSocket TTS streaming nativo (ElevenLabs `eleven_turbo_v2`)** — defer v2.3+. Latency otimization, ROI baixo dado que sentence-level HTTP já atende.
- **Lista de exceções para chunking** (Dr., etc., decimais) — defer; revisitar se telemetria mostrar quebras audíveis.
- **Pre-warm de conexão TTS** — Claude's discretion na implementação; se descartado no MVP, fica como backlog.
- **Murf streaming real** — Out of scope explícito (REQUIREMENTS).
- **Word-level alignment metadata** — Out of scope explícito.
- **Pause/resume mid-playback** — Out of scope explícito.

### Reviewed Todos (not folded)
*Nenhum todo cross-referenced.*

</deferred>

---

*Phase: 53-streaming-tts*
*Context gathered: 2026-05-05*
