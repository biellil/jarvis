# Phase 62: Kokoro Offline TTS - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar Kokoro como 3º TTS provider local nativo ao pipeline TTS existente (Electron main). JARVIS fala 100% offline por padrão quando Kokoro selecionado, com fallback para Murf/ElevenLabs se não estiver em modo local-only. Escopo: KokoroTTSProvider implementando TTSProvider interface, download manual do modelo com progress bar, GPU auto-detect via ONNX Runtime, modo local-only sem fallback cloud, Settings UI atualizada. Fora de escopo: novos voice IDs configuráveis por usuário, multi-voice, síntese batch.

</domain>

<decisions>
## Implementation Decisions

### Download do modelo Kokoro (~350MB)

- **D-01:** Download é **explícito** — usuário seleciona "Kokoro (local)" no Select de provider e vê status "Não baixado" + botão "Download modelo". Não baixa automaticamente ao selecionar. Requer ação deliberada.
- **D-02:** Falha de download: botão "Retry" aparece na TtsSection após erro — mesmo padrão visual do Phase 50 (Whisper download). AbortController para cancelar download in-flight.
- **D-03:** Modelo não baixado + Kokoro selecionado = **sem TTS** (não faz fallback automático para cloud). JARVIS responde só por texto até modelo estar pronto.
- **D-04:** Download recomeça do zero em retry — sem resume com Range header. Arquivo parcial deletado antes de novo download.

### Comportamento local-only (TTS-OFF-05)

- **D-05:** Modo local-only: se Kokoro falha (crash, modelo corrompido, ONNX error), JARVIS responde por texto + toast de aviso. Nunca toca em cloud providers. Padrão consistente com WAKE-10 graceful degrade.
- **D-06:** UI local-only: **checkbox "Apenas local (sem fallback cloud)"** que aparece somente quando Kokoro está selecionado no Select. Escondido para Murf/ElevenLabs. Persiste via electron-store.
- **D-07:** Modo padrão (não local-only) com Kokoro: se Kokoro falha, `FallbackTTSProvider` usa Murf/ElevenLabs automaticamente (TTS-OFF-02).

### Kokoro + Streaming TTS (Phase 53)

- **D-08:** Kokoro é **compatível com streaming TTS** (Phase 53) desde o Phase 62 — `synthesize(sentence)` é stateless por chamada, mesma interface `TTSProvider`. O pipeline de streaming chama `synthesize()` por sentença — zero mudança de interface necessária.
- **D-09:** **Sem timeout** para síntese — GPU/CPU gera o áudio, JARVIS aguarda. Usuário escolheu local sabendo das implicações de hardware.
- **D-10:** **GPU auto-detect via ONNX Runtime** — mesmo padrão do Whisper (Phase 29/30): CUDA (Windows/Linux), CoreML/Metal (macOS), CPU fallback. `ort.env.wasm.numThreads` para CPU.

### Settings UI

- **D-11:** Campo "API Key" **desaparece** quando provider=kokoro (conditional render). Kokoro não precisa de API key.
- **D-12:** Status UI do modelo Kokoro na TtsSection: "Não baixado" + botão "Download" → progress bar com % → "Pronto (X MB)". Exato padrão visual do Phase 50 Whisper (WhisperSection.tsx como referência).
- **D-13:** `TtsProviderOption` union estendida para `'murf' | 'elevenlabs' | 'kokoro'`.

### Claude's Discretion

- Implementação interna do KokoroTTSProvider (lazy model load vs eager load no constructor)
- Localização do modelo no filesystem (app.getPath('userData') como padrão — consistente com whisper resources)
- Voice ID padrão para Kokoro (escolha do planner baseado em kokoro-js docs — pt-BR preferível se disponível)
- Gerenciamento de memória ONNX session (singleton vs per-call)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Phase 62 — goal e success criteria (5 critérios)
- `.planning/REQUIREMENTS.md` §"Offline TTS (Kokoro)" — TTS-OFF-01 a TTS-OFF-05

### TTS infrastructure atual (Electron main)
- `apps/desktop/src/main/voiceInput/tts/provider.ts` — interface `TTSProvider.synthesize(text)` e `TTSResult`
- `apps/desktop/src/main/voiceInput/tts/index.ts` — factory `createTTSProvider()`, `getActiveTtsProvider()`, `reloadActiveTtsProvider()`
- `apps/desktop/src/main/voiceInput/tts/fallback.ts` — `FallbackTTSProvider` (primary→secondary pattern)
- `apps/desktop/src/main/voiceInput/tts/murf.ts` — implementação Murf (referência de como implementar provider)
- `apps/desktop/src/main/voiceInput/tts/elevenlabs.ts` — implementação ElevenLabs

### Settings & store patterns
- `apps/desktop/src/main/store.ts` — `StoreSchema` com `ttsProvider`, `ttsApiKey` (estender para 'kokoro' + `ttsLocalOnly`)
- `apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx` — UI atual (Provider Select, API Key, Voice ID, Streaming toggle)
- `apps/desktop/src/main/ipc/settings.ts` — padrão IPC apply-without-restart (Phase 52)

### Phase 50 Whisper download (padrão a replicar)
- `.planning/phases/50-whisper-pre-download-ux/50-CONTEXT.md` — decisões de download UX (progress bar, retry, hot-swap)
- `apps/desktop/src/main/whisper/whisperResources.ts` — padrão de path resolution via `app.getPath('userData')`
- `apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx` — UI de download com progress (referência direta para KokoroSection)

### Phase 53 Streaming TTS (compatibilidade)
- `.planning/phases/53-streaming-tts/53-CONTEXT.md` — D-01 a D-12 (interface streaming, barge-in, feature flag)
- `apps/desktop/src/main/voiceInput/voiceHandler.ts` — onde streaming/non-streaming bifurcam

### GPU detection pattern (Phase 29/30)
- `apps/desktop/src/main/whisper/vramDetection.ts` — VRAM-based model selection (padrão CUDA/Metal/CPU a replicar para ONNX)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`TTSProvider` interface**: `synthesize(text: string): Promise<TTSResult>` — `KokoroTTSProvider` implementa exatamente essa interface, zero mudança de contrato.
- **`FallbackTTSProvider`**: já implementa primary→secondary fallback. Phase 62 usa `new FallbackTTSProvider(kokoro, murf)` para TTS-OFF-02 quando não local-only.
- **`reloadActiveTtsProvider()`**: singleton com reload — reutilizar para aplicar troca de provider sem restart.
- **`WhisperSection.tsx` + `whisperResources.ts`**: padrão completo de download com progress bar, retry, hot-swap — replicar 1:1 para KokoroSection.
- **`app.getPath('userData')`**: path canônico para modelo Kokoro (consistente com whisper resources).

### Established Patterns
- **Apply-without-restart**: electron-store + IPC channel + reload singleton — padrão obrigatório (Phase 52).
- **Graceful degrade em falha TTS**: log warning + resposta sem áudio (WAKE-10 precedent) — manter para modo local-only.
- **ONNX Runtime GPU detection**: padrão de execution provider selection já existe em whisper.cpp bindings — consultar vramDetection.ts para adaptar ao ONNX Runtime JS.
- **Conditional render em Settings**: `apiKeyError ?? ''` / Field.Error empty string pattern — padrão da TtsSection existente.

### Integration Points
- `createTTSProvider()` em `tts/index.ts` — adicionar `case 'kokoro'`: retorna `KokoroTTSProvider` ou `FallbackTTSProvider(kokoro, murf)` dependendo de local-only flag
- `StoreSchema` em `store.ts` — adicionar `ttsProvider` com 'kokoro', `kokoroLocalOnly: boolean`
- `TtsProviderOption` em `shared/ipc-types.ts` — estender union para `'kokoro'`
- `TtsSection.tsx` — adicionar `<SelectItem value="kokoro">Kokoro (local)</SelectItem>`, conditional render API Key, adicionar KokoroDownloadStatus component

</code_context>

<specifics>
## Specific Ideas

- "Sem TTS até baixar" — usuário não quer fallback automático antes do download. JARVIS responde por texto com aviso amigável.
- "GPU via ONNX auto-detect" — usuário usa GPU e não quer timeout. ONNX Runtime auto-seleciona CUDA/Metal/CPU.
- "Botão explícito de Download" — padrão deliberado, não surpresa de 350MB ao selecionar.
- "Checkbox apenas local aparece só quando Kokoro selecionado" — UI limpa, contextual.

</specifics>

<deferred>
## Deferred Ideas

- **Voice ID configurável para Kokoro** — escolha do modelo de voz via UI. Defer v3.1.
- **Resume download com Range header** — robustez para conexões lentas. Defer; restart simples suficiente para MVP.
- **Multi-voice (troca dinâmica de speaker)** — fora do escopo desta phase.
- **Timeout configurável para síntese** — usuário não quer timeout; pode revisitar se hardware extremamente lento aparecer como problema.

</deferred>

---

*Phase: 62-kokoro-offline-tts*
*Context gathered: 2026-05-07*
