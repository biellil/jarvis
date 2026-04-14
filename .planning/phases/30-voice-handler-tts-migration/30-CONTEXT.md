# Phase 30: Voice Handler + TTS Migration - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar `voiceHandler.ts` no processo main do Electron que orquestra o pipeline completo de voz: buffer de áudio recebido via IPC → normalizar → transcrever com whisper.cpp local → enviar texto ao gateway `/api/chat` → TTS HTTP → devolver áudio ao renderer. Inclui seleção automática de modelo whisper por VRAM detectada e migração dos providers TTS do `apps/backend-ts` para o main do Electron.

Não inclui: refactor de `sendAudioAndHandle` no renderer (Phase 31), remoção de endpoints no gateway/backend-ts (Phase 32).

</domain>

<decisions>
## Implementation Decisions

### VRAM Detection (STT-02)

- **D-01:** VRAM detectado via `app.getGPUInfo('complete')` do Electron, chamado no startup do app, resultado cacheado em module scope (mesmo padrão de `gpuDetection.ts`).
- **D-02:** Campo relevante: `auxAttributes.gpuMemoryMB` (Chromium) ou equivalente por vendor. Thresholds fixos por STT-02: >8192 MB → `large`, 4096–8192 MB → `base`, <4096 MB → `tiny` (CPU fallback).
- **D-03:** Quando `gpuMemoryMB` retorna 0 ou undefined (GPU integrada, driver incompleto), fallback para `base` — modelo já validado em Phase 29, comportamento seguro e conservador.
- **D-04:** Seleção de modelo logada em startup com backend detectado e VRAM medido para confirmabilidade (STT-02 success criteria).

### Modelos Whisper (Build-time)

- **D-05:** Todos os 3 modelos bundled no build via `extraResources` do electron-builder: `ggml-tiny.bin` (~75 MB), `ggml-base.bin` (~142 MB), `ggml-large-v3.bin` (~1.5 GB).
- **D-06:** Modelos ficam em `process.resourcesPath/models/whisper/` (read-only) — `whisperResources.ts` atualizado para usar `resourcesPath` em vez de `userData`.
- **D-07:** Script de pré-download roda durante `pnpm build` (beforePack hook ou prebuild script) para garantir que os binários existem antes do electron-builder empacotar.
- **D-08:** Modelo selecionado via VRAM detection é passado diretamente ao `@fugood/whisper.node` — sem download em runtime.

### TTS Migration (TTS-01, TTS-02, TTS-03)

### Claude's Discretion
- **Placement dos TTS providers:** Claude decide onde colocar os providers migrados no desktop (ex: `apps/desktop/src/main/voiceInput/tts/`) — cópia direta dos arquivos do backend-ts, adaptada para ESM do Electron.
- **TTS failure no voiceHandler:** Seguir precedente WAKE-10 — graceful degrade para texto visível (retornar `audioBase64: null` com `reply` preenchido, não erro estrito).
- **Estrutura do voiceHandler.ts:** Claude decide a estrutura interna (classe vs. funções puras, injeção de deps para testabilidade, etc.).
- **IPC response shape:** Manter `SendAudioResponse.data` compatível com o renderer existente (`transcription`, `message`, `audioBase64`, `audioFormat`, `sttProvider`, `ttsProvider`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### IPC & Entry Point
- `apps/desktop/src/main/ipc/chat.ts` — handleSendAudio com stub USE_WHISPER_CPP; voiceHandler.ts é chamado daqui quando flag=true
- `apps/desktop/src/shared/ipc-types.ts` — SendAudioResponse type (manter compatibilidade com renderer)

### Voice Input Infrastructure (Phase 29, já pronto)
- `apps/desktop/src/main/voiceInput/gpuDetection.ts` — GPU backend detection cacheado; Phase 30 adiciona VRAM measurement complementar
- `apps/desktop/src/main/voiceInput/whisperResources.ts` — resolver de path do modelo; **precisa ser atualizado** para suportar múltiplos modelos e `resourcesPath`
- `apps/desktop/src/main/voiceInput/audioNormalizer.ts` — normaliza WebM 48kHz → WAV 16kHz mono para whisper.cpp

### TTS (a ser migrado)
- `apps/backend-ts/src/voice/tts/index.ts` — factory createTTSProvider + exports (referência para recriar no Electron main)
- `apps/backend-ts/src/voice/tts/murf.ts` — MurfTTSProvider (Murf.ai REST, header `api-key`, response.encodedAudio, env: MURF_API_KEY, MURF_VOICE_ID)
- `apps/backend-ts/src/voice/tts/elevenlabs.ts` — ElevenLabsTTSProvider (ElevenLabs REST, header `xi-api-key`, env: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID)
- `apps/backend-ts/src/voice/tts/fallback.ts` — FallbackTTSProvider wrapper
- `apps/backend-ts/src/voice/tts/provider.ts` — TTSProvider interface + TTSResult type

### Requirements & Architecture
- `.planning/REQUIREMENTS.md` — STT-02, STT-05, TTS-01, TTS-02, TTS-03, ARCH-05 (requirements diretos desta phase)
- `.planning/STATE.md` §Key Constraints This Milestone — restrições críticas do v1.6

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `audioNormalizer.ts::normalizeAudioToWav(webmBuffer)` — pronto para uso direto em voiceHandler.ts
- `gpuDetection.ts::getDetectedBackend()` — retorna backend cacheado; voiceHandler.ts pode compor com nova VRAM detection
- `ipc/chat.ts::retryWithBackoff` — padrão de retry existente reutilizável para chamadas TTS HTTP
- `backend-client.ts` — padrão de configuração de URL/apiKey via deps injection

### Established Patterns
- Injeção de dependências via `setupXxxHandlers(deps)` (chat.ts, settings.ts) — voiceHandler.ts deve seguir este padrão para testabilidade
- Module-scope caching para resultados de detecção (gpuDetection.ts) — aplicar para VRAM e seleção de modelo
- `USE_WHISPER_CPP` lido uma única vez no module scope — não relido por chamada

### Integration Points
- `ipc/chat.ts::handleSendAudio` — ponto de entrada; stub atual (`NOT_IMPLEMENTED`) será substituído por chamada ao voiceHandler
- `apps/desktop/electron-builder.config.js` (ou `.ts`) — adicionar `extraResources` para os modelos whisper
- `apps/desktop/src/main/index.ts` — startup do app onde `initializeGpuDetection()` é chamado; VRAM detection e model selection cache devem rodar aqui também

</code_context>

<specifics>
## Specific Ideas

- VRAM detection call: `await app.getGPUInfo('complete')` retorna objeto com `gpuDevice[]` e `auxAttributes`; campo `gpuMemoryMB` está em `auxAttributes` no Chromium (pode ser string ou number dependendo da versão)
- `@fugood/whisper.node` v1.0.16 — ASAR unpack já configurado em Phase 29 (`asarUnpack: ["node_modules/@fugood/**"]`)
- Modelo `ggml-large-v3.bin` disponível em: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin`
- Modelo `ggml-tiny.bin` disponível em: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin`
- Murf usa header `api-key` (NÃO `Authorization: Bearer`) — detalhe crítico ao migrar
- ElevenLabs retorna áudio binário direto (content-type: audio/mpeg) ao contrário de Murf que retorna base64 em JSON

</specifics>

<deferred>
## Deferred Ideas

- Onde colocar TTS foi considerado mas deixado para Claude decidir (implementação, não decisão de produto)
- Streaming TTS (token-by-token) — deferred to v1.7+ (saiu de escopo do milestone inteiro)
- Offline TTS local (Kokoro) — deferred to v1.7+
- Settings UI para seleção manual de modelo — deferred (Phase 30 faz seleção automática apenas)

</deferred>

---

*Phase: 30-voice-handler-tts-migration*
*Context gathered: 2026-04-14*
