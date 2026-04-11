# Phase 19: Voice Pipeline — Backend (STT + TTS Provider Abstraction) — Context

**Gathered:** 2026-04-09
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 19 (interativo)

<domain>
## Phase Boundary

Esta fase entrega o **lado backend** do pipeline de voz. O Electron (Fase 19.5) captura áudio e toca TTS, mas **toda IA/ML mora aqui**. Backend recebe áudio bruto, transcreve via STT provider, manda transcrição pra `ChatSession`, gera resposta TTS via TTS provider, devolve áudio + texto.

**Princípio arquitetural fundamental (locked nesta discussão):**

> **Electron é cliente burro de UI/UX. Backend é cérebro com TODA IA/ML.**
> Electron faz: capture do mic, IPC, dialogs, playback de áudio, executar subprocess local (Fase 18.5).
> Electron NÃO faz: STT, TTS, wake word, embeddings, qualquer modelo ML.
> Razão: backend roda em VPS/servidor, recursos centralizados; PC do user só precisa de hardware básico de áudio I/O.

**Dentro de escopo (Fase 19):**
- Endpoint `POST /chat/audio` (multipart com campo `audio`) que espelha `src/jarvis/api/routes/chat.py`.
- Interface `STTProvider` com:
  - `LocalSTTProvider` (nodejs-whisper, modelo `base` default, override via `WHISPER_MODEL` env var)
  - Esqueleto pronto pra `CloudSTTProvider` (ElevenLabs/OpenAI) sem precisar refator quando adicionar
- Interface `TTSProvider` com:
  - `ElevenLabsTTSProvider` (default — qualidade top, requer `ELEVENLABS_API_KEY`)
  - `LocalTTSProvider` (Transformers.js Speecht5 fallback)
  - Trocável via `TTS_PROVIDER=elevenlabs|local` env var
  - Fallback automático: se cloud falhar (timeout, sem key, 5xx), tenta local
- Wiring no `ChatSession.send(text)` para incluir TTS na resposta — `{message, audioBase64}` ou multipart equivalente.
- Audit log: tabela nova ou estendida `voice_calls` com latência, bytes, provider, sucesso/erro.
- Testes vitest mockando os providers (sem chamar nodejs-whisper real nem ElevenLabs real) + smoke test integration que processa um WAV pequeno fixture.

**Fora de escopo (Fase 19):**
- **Wake word** — deferido. PTT da Fase 13 já existe e cobre o caso. Voltar em v1.4 com opção decente Node.
- **Streaming TTS sentence-by-sentence** — TTS é gerado de uma vez ao final da resposta. Streaming entra como otimização v1.4.
- **Captura de áudio no Electron** — Fase 19.5.
- **Player de áudio no Electron** — Fase 19.5.
- **Cancelamento de playback overlap** — Fase 19.5.

</domain>

<decisions>
## Implementation Decisions

### Q1 — STT no backend (não no Electron)
**Backend.** Electron faz upload via `POST /chat/audio` multipart. Backend chama `sttProvider.transcribe(audioBuffer)`. Razão:
- Centraliza IA num lugar só (princípio arquitetural)
- Paridade com Python pra Fase 20
- Cloud STT é trocável depois sem refatorar Electron

Custo: bandwidth de áudio sobe na rede. WebM/Opus a 32kbps = ~40KB por 10s, totalmente OK.

### Q2 — TTS Provider Abstraction com cloud default
**TTSProvider interface:**
```typescript
interface TTSProvider {
  synthesize(text: string): Promise<Buffer>; // WAV bytes
  readonly name: string;
}
```

**Implementações:**
- `ElevenLabsTTSProvider` — chama API HTTP da ElevenLabs (`https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`). Requer `ELEVENLABS_API_KEY` env var. Voice ID configurável via `ELEVENLABS_VOICE_ID` (default: alguma voz pt-BR popular).
- `LocalTTSProvider` — usa `@xenova/transformers` (Transformers.js) com modelo Speecht5. Roda local no backend. Mais lento e qualidade pior, mas zero custo.

**Seleção:** env var `TTS_PROVIDER` aceita `elevenlabs` (default) ou `local`. Se cloud selecionado mas API key ausente, log warning e cai pra local.

**Fallback automático:** Se `ElevenLabsTTSProvider.synthesize()` lançar (timeout, 5xx, network), o wrapper externo tenta `LocalTTSProvider` e logga warning. Audit log marca qual provider deu certo.

### Q3 — Wake word skip
**Skip nesta fase.** Usa PTT (Push-to-talk) que já existe na Fase 13. Voltar em v1.4 com `openwakeword-node` decente ou subprocess Python.

### Q1' — STT Provider Abstraction
**STTProvider interface (mesmo padrão de TTS):**
```typescript
interface STTProvider {
  transcribe(audio: Buffer, opts?: {language?: string}): Promise<string>;
  readonly name: string;
}
```

**Implementações:**
- `LocalSTTProvider` — usa `nodejs-whisper` com modelo `base` default. Modelo override via `WHISPER_MODEL=base|small|medium|large-v3-turbo`. Cache do modelo em `~/.cache/jarvis/whisper-models/`.
- Esqueleto pra `CloudSTTProvider` (placeholder, não implementado nesta fase) — vai entrar como follow-up se você quiser ElevenLabs/OpenAI Speech-to-Text futuramente.

**Seleção:** env var `STT_PROVIDER` aceita `local` (default) ou `cloud` (não disponível ainda — log warning e usa local).

### Q4 — Modelo Whisper local: `base`
Default `base` (142MB, ~1x realtime CPU, qualidade decente pt-BR). Override via `WHISPER_MODEL` env var.

### Q5 — Format de áudio: WebM/Opus
**Mantém WebM/Opus.** Electron já produz via MediaRecorder; backend Python já aceita; nodejs-whisper suporta nativamente (faz conversão interna pra PCM via ffmpeg).

Pode precisar de `ffmpeg` instalado no servidor — documentar como dependência sistema.

### Endpoint design

**Request:**
```
POST /chat/audio HTTP/1.1
Authorization: Bearer <JARVIS_API_KEY>
Content-Type: multipart/form-data; boundary=...

--boundary
Content-Disposition: form-data; name="audio"; filename="rec.webm"
Content-Type: audio/webm

<binary audio bytes>
--boundary--
```

**Response (sucesso):**
```json
{
  "transcription": "qual a previsão do tempo amanhã",
  "message": "Não tenho acesso a previsão do tempo, mas posso te ajudar com outra coisa!",
  "audio_base64": "<base64 WAV bytes>",
  "tts_provider": "elevenlabs",
  "stt_provider": "local"
}
```

**Errors:**
- `400` — sem campo `audio`, audio vazio, ou audio em formato não suportado
- `429` — sessão ocupada (mesmo lock global da Fase 17)
- `500` — falha de transcrição ou síntese (com `error` no body explicando)

**Por que base64 em vez de multipart na response?**
- Simples de parsear no Electron (`atob()` + `Uint8Array`)
- Resposta cabe num único JSON (texto + áudio juntos)
- Overhead de ~33% no tamanho é OK pra single user
- Multipart na response seria mais eficiente mas adiciona complexidade no Electron parser

### Lock global e 429
**Mantém o `SessionLock` da Fase 17.** O endpoint `POST /chat/audio` adquire o mesmo lock que `POST /chat`. Razão: STT + LLM + TTS é uma operação stateful que não pode ser concorrente com outras conversas. Single-user, single-session.

### Audit log de voz
Tabela nova `voice_calls` no SQLite:
```sql
CREATE TABLE voice_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES conversations(id),
  timestamp TEXT NOT NULL,
  audio_bytes INTEGER NOT NULL,
  transcription TEXT,
  stt_provider TEXT NOT NULL,
  stt_latency_ms INTEGER,
  tts_provider TEXT,
  tts_latency_ms INTEGER,
  tts_bytes INTEGER,
  success INTEGER NOT NULL,
  error TEXT
);
```

Toda invocação grava uma linha pra debugging e métricas (qual provider tá sendo usado, quanto demora cada componente).

Acessível via método `MemoryStore.logVoiceCall(...)`.

### `/chat/audio` é via gateway
Mesmo padrão dos outros endpoints — gateway proxy `/api/chat/audio` → backend `/chat/audio`. Fase 19.5 vai bater no `/api/chat/audio` (gateway), não direto no backend.

### ChatSession integration
`POST /chat/audio` flow:
1. Recebe áudio via multipart.
2. Adquire lock. Retorna 429 se ocupado.
3. Chama `sttProvider.transcribe(audio)`. Pode falhar → 500 com erro.
4. Loga linha em `voice_calls` com transcription parcial.
5. Chama `chatSession.send(transcription)` (mesmo método de POST /chat — devolve string).
6. Chama `ttsProvider.synthesize(reply)`. Se cloud falhar, fallback automático pra local.
7. Atualiza linha de `voice_calls` com tts info.
8. Devolve `{transcription, message, audio_base64, tts_provider, stt_provider}`.
9. Libera lock no `try/finally`.

**Importante:** o `/chat/audio` reusa `ChatSession.send()` (síncrono) — não usa `sendStream()`. Razão: TTS precisa do texto inteiro pra sintetizar; streaming token-a-token + síntese frase-a-frase é otimização (deferida).

### Provider abstraction como módulo
Estrutura sugerida:
```
apps/backend-ts/src/voice/
  ├── stt/
  │   ├── provider.ts          # interface STTProvider
  │   ├── local.ts             # LocalSTTProvider (nodejs-whisper)
  │   └── index.ts             # createSTTProvider() factory lendo env
  ├── tts/
  │   ├── provider.ts          # interface TTSProvider
  │   ├── elevenlabs.ts        # ElevenLabsTTSProvider
  │   ├── local.ts             # LocalTTSProvider (Transformers.js)
  │   └── index.ts             # createTTSProvider() factory + fallback wrapper
  └── voice-handler.ts         # orquestra STT → ChatSession → TTS
```

### Deps a adicionar
- `nodejs-whisper` (STT local) — verifica se já está no package.json ou adiciona
- `@xenova/transformers` (Transformers.js — TTS local) — **já está** instalado da Fase 16 (embeddings)
- `multer` ou similar pra parsing de multipart no Express
- Sem deps pra ElevenLabs — fetch nativo bate na API REST

### ffmpeg como dependência sistema
nodejs-whisper precisa de ffmpeg pra conversão WebM→PCM. Documentar:
- Linux: `apt install ffmpeg`
- macOS: `brew install ffmpeg`
- Windows: chocolatey ou binário standalone

Validação no startup: se `ffmpeg` não estiver no PATH, log warning (não fatal — pode rodar em modo só texto).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Python — referência de paridade
- `src/jarvis/core/voice.py` — `WhisperTranscriber` (faster-whisper, modelo `base`, lazy loading, async-safe)
- `src/jarvis/core/tts.py` — `KokoroTTS` (kokoro KPipeline, sentence streaming)
- `src/jarvis/api/routes/chat.py` — `POST /chat/audio` endpoint (linhas 85+)
- `src/jarvis/api/lifespan.py` — onde os providers são instanciados no startup
- (NÃO portar) `src/jarvis/core/wake_word.py` — wake word fica deferido

### TypeScript existente
- `apps/backend-ts/src/session/chat-session.ts` — `ChatSession.send(text)` que vai ser reusado
- `apps/backend-ts/src/session/lock.ts` — `SessionLock` que vai proteger `/chat/audio`
- `apps/backend-ts/src/routes/chat.ts` — referência de padrão (lock, 429, error handling)
- `apps/backend-ts/src/memory/store.ts` — `MemoryStore` que vai ganhar `logVoiceCall(...)`
- `apps/backend-ts/src/memory/schema.ts` — onde adicionar tabela `voice_calls`

### Gateway
- `apps/gateway/src/routes/chat.ts` — adicionar proxy `/api/chat/audio`
- `apps/gateway/src/app.ts` — wiring

### ElevenLabs API
- Docs: https://elevenlabs.io/docs/api-reference/text-to-speech
- Endpoint: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- Header: `xi-api-key: {API_KEY}`
- Body: `{text, model_id, voice_settings}`
- Response: audio bytes (mp3 default, request WAV via Accept ou query param)
- Free tier: 10k characters/mês, mais que suficiente pra dev

### nodejs-whisper
- npm: https://www.npmjs.com/package/nodejs-whisper
- Modelo `base` padrão, baixa do CDN no primeiro uso
- Aceita WAV/MP3/WebM (precisa ffmpeg)
- Sync API: `await nodewhisper(audioPath, {modelName: 'base'})`

### Transformers.js Speecht5
- Já instalado (`@xenova/transformers` da Fase 16)
- Modelo: `Xenova/speecht5_tts`
- Pipeline: `await pipeline('text-to-speech', model)`
- Output: audio Float32Array — precisa converter pra WAV via lib auxiliar

</canonical_refs>

<specifics>
## Specific Ideas

- Voice ID padrão da ElevenLabs (pra pt-BR): pesquisar uma voz natural — algumas opções: `EXAVITQu4vr4xnSDxMaL` (Sarah), `21m00Tcm4TlvDq8ikWAM` (Rachel). Documentar a escolhida.
- ElevenLabs `model_id`: `eleven_multilingual_v2` (suporta pt-BR bem).
- ElevenLabs `voice_settings`: `{stability: 0.5, similarity_boost: 0.75}` — defaults razoáveis.
- Pra Speecht5 fallback, lembrar que ele é English-only de fato — qualidade em pt-BR vai ser bem ruim. Documentar como limitação. Talvez logar warning quando cair no fallback se transcription contiver acentos.
- Cache do modelo Whisper: `~/.cache/jarvis/whisper-models/`. Lazy load no primeiro request. Consequência: primeira request fica lenta (~10s baixando), depois é rápida. Documentar.
- Multer config: `limits.fileSize: 25 * 1024 * 1024` (25MB) — mais que suficiente pra clipes de voz de 1 minuto WebM/Opus.
- Audit `voice_calls` é fonte de truth pra métricas. Em algum momento dá pra criar dashboard.
- Tests: usar fixtures de áudio pequenas (.wav 1-2 segundos) salvas em `apps/backend-ts/test/fixtures/audio/`. Mockar `nodejs-whisper` pra retornar string fake nos testes unit; integration test pode chamar real se ffmpeg + modelo já tiverem cache.

</specifics>

<deferred>
## Deferred Ideas

- **Wake word** — PTT existe e funciona; wake word entra em v1.4 com lib decente pra Node ou subprocess Python.
- **Streaming TTS** sentence-by-sentence pra reduzir latência percebida.
- **Cloud STT (ElevenLabs/OpenAI Speech-to-Text)** — esqueleto da interface fica pronto, implementação concreta entra como follow-up se necessário.
- **Voice cloning** (ElevenLabs feature) — fora de escopo.
- **Speaker diarization** (separar quem tá falando) — fora de escopo, single user.
- **Voz local de qualidade** (Piper TTS, Mimic, Coqui) — Speecht5 é fallback consciente; voz local boa pode entrar futuramente.
- **VAD (Voice Activity Detection)** server-side — Electron já corta o áudio na captura, não precisa.
- **Real-time / streaming STT** (transcrever enquanto fala) — modo "ditado" futuro.
- **Multi-language detection** — automaticamente detectar idioma. Por ora, pt-BR fixo.

</deferred>

---

*Phase: 19-voice-backend*
*Context gathered: 2026-04-09 via /gsd-discuss-phase*
