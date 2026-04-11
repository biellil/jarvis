# Phase 19.5: Voice Pipeline — Electron (Capture + Playback) — Context

**Gathered:** 2026-04-09
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 19.5 (interativo)

<domain>
## Phase Boundary

Fase final do pipeline de voz — fecha o loop end-to-end. Backend (Fase 19) já expõe `POST /chat/audio` com STT/TTS via provider abstraction. Esta fase refatora o `chat:send-audio` IPC do Electron (que já existe desde Fase 13 mas está desatualizado) pra falar com o novo backend e tocar o áudio TTS retornado.

**Princípio arquitetural (reiterado):** Electron = UI/UX + I/O. **Zero IA/ML no Electron.** Toda síntese e transcrição moram no backend.

**Dentro de escopo:**
- Atualizar o `chat:send-audio` IPC handler em `apps/desktop/src/main/ipc/chat.ts` pra:
  - Usar `backendConfig` do `backend-client.ts` (URL + API key) — igual o fluxo de texto da Fase 18.5
  - Injetar header `Authorization: Bearer <API_KEY>`
  - Corrigir content-type do upload pra `audio/webm` (o renderer grava WebM/Opus via MediaRecorder, o código atual marca WAV incorretamente)
  - Parsear a resposta nova do backend `{transcription, message, audio_base64, audio_format, stt_provider, tts_provider}`
  - Devolver pro renderer via IPC um shape que inclui o `audio_base64` e `audio_format`
- Adicionar **player de áudio no renderer** usando Web Audio API:
  - Recebe `audio_base64` + `audio_format` do IPC
  - Decodifica via `AudioContext.decodeAudioData()` (suporta MP3 e WAV nativo)
  - Toca via `AudioBufferSourceNode`
  - **Cancela áudio anterior** se nova resposta chegar antes do término
- Tratamento de erros estruturado: `NO_SPEECH`, `STT_FAILED`, `TTS_FAILED` e outros → toast/alert visual no renderer (não mistura com chat)
- PTT existente continua funcionando — zero mudança no hotkey (Fase 13)
- Testes vitest mockando fetch + Web Audio API

**Fora de escopo:**
- **Refactor do fluxo de texto** — Fase 18.5 já fez.
- **Wake word** — deferido (PTT cobre).
- **Streaming de áudio TTS** (tocar conforme chega) — backend gera tudo de uma vez, streaming entra em v1.4.
- **Gravação de áudio** — `MediaRecorder` já está implementado no renderer desde Fase 13, mantém.
- **Transcrição visível em tempo real** — o `transcription` do response entra como mensagem do user no chat, mas não tem feedback "gravando..." especial.
- **Cancelamento de request em andamento** (se usuário apertar PTT novamente enquanto aguarda) — idempotência via lock backend já cuida.

</domain>

<decisions>
## Implementation Decisions

### Q1 — Playback no renderer (Web Audio API)
**1a.** Main devolve o `audio_base64` e `audio_format` via IPC. Renderer decodifica e toca.

Implementação:
```typescript
// renderer player
async function playTTSResponse(base64: string, format: 'mp3' | 'wav') {
  // cancel previous
  currentSource?.stop();
  currentSource = null;

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const buffer = await audioContext.decodeAudioData(bytes.buffer);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.onended = () => { if (currentSource === source) currentSource = null; };
  source.start();
  currentSource = source;
}
```

Razão: zero deps, native browser, MP3 e WAV suportados. Main process fica burro (só passa bytes adiante).

### Q2 — Cancelar áudio anterior
**2a.** Nova resposta chegando antes do fim da anterior: `currentSource?.stop()` e começa o novo. Usuário só ouve a resposta mais recente.

### Q3 — Content-type `audio/webm` (fix)
**3a.** Corrige o bug atual que marca `audio/wav` — o `MediaRecorder` do renderer grava `audio/webm;codecs=opus`. Backend já suporta via nodejs-whisper + ffmpeg.

Impacto: o `Blob` no `chat:send-audio` IPC handler e o `formData.append('audio', blob, 'recording.webm')` ficam com filename `.webm`.

### Q4 — Erros como toast/alert no renderer
**4a.** Erros do backend (`NO_SPEECH`, `STT_FAILED`, `TTS_FAILED`, `EMPTY_AUDIO`, 429, 500) viram toast/alert visual no renderer, **não** como mensagem do agente no chat.

Razão: erro de voz é técnico ("não ouvi você"), não é conversa. Misturar com mensagens do agente confunde histórico.

Implementação: o IPC handler devolve `{success: false, error: {code, message}}` e o renderer App.tsx exibe via um componente Toast simples (ou `alert()` como fallback MVP).

Mapping de códigos de erro pro usuário:
| Backend code | Mensagem pt-BR |
|---|---|
| `EMPTY_AUDIO` | "Não recebi nenhum áudio. Tenta de novo." |
| `NO_SPEECH` | "Não consegui ouvir sua mensagem. Fala mais perto do microfone?" |
| `STT_FAILED` | "Erro ao transcrever áudio. Tenta de novo." |
| `LLM_FAILED` | "Erro ao processar sua mensagem." |
| `TTS_FAILED` | "Resposta pronta, mas não consegui gerar o áudio." (texto ainda aparece no chat) |
| `HTTP 429` | "JARVIS está ocupado. Aguarde um instante." |
| `HTTP 500` | "Erro interno. Tenta de novo em alguns segundos." |
| Network | "Sem conexão com o servidor." |

### Backend config via backend-client (Fase 18.5)
Usa `loadBackendConfig()` do `apps/desktop/src/main/backend-client.ts` pra obter `JARVIS_BACKEND_URL` e `JARVIS_API_KEY`. URL do endpoint: `${backendUrl}/api/chat/audio`.

### Response shape no IPC
Atualizar `SendAudioResponse` em `apps/desktop/src/shared/ipc-types.ts`:

**Antes (Fase 13):**
```typescript
export type SendAudioResponse =
  | { success: true; data: { reply: string } }
  | { success: false; error: string };
```

**Depois (Fase 19.5):**
```typescript
export type SendAudioResponse =
  | { success: true; data: {
      transcription: string;
      message: string;
      audioBase64: string;
      audioFormat: 'mp3' | 'wav';
      sttProvider: string;
      ttsProvider: string;
    } }
  | { success: false; error: { code: string; message: string } };
```

Isso é breaking change pro renderer — `App.tsx` precisa ser atualizado pra consumir o shape novo.

### Transcrição → chat
A `transcription` que volta do backend **representa o que o usuário disse**. O App.tsx deve inserir ela como `HumanMessage` no chat antes do `message` do agent. Sem ela, usuário vê só a resposta e não sabe o que foi entendido.

### Retry e timeout
Mantém o retry com backoff que já existe no handler atual (Fase 13). Timeout sobe pra 60s (áudio + STT + LLM + TTS é mais lento que texto puro). Não retry em 4xx (`400`, `401`, `429`).

### Auth fail-fast
Se `loadBackendConfig()` falhar no bootstrap do main (Fase 18.5 já faz isso), o handler `chat:send-audio` nem registra. Alternativamente, se a config existe mas `JARVIS_API_KEY` vier vazio no runtime, devolve `{success: false, error: {code: 'NO_API_KEY', message: 'API key do JARVIS não configurada'}}`.

### AudioContext lifecycle
Criar **um único** `AudioContext` no startup do renderer (ou lazy no primeiro uso). Reusar em todas as respostas. Não criar-e-destruir por request (caro e gera warnings do browser).

Navegadores modernos exigem interação do user pra iniciar `AudioContext` — no Electron isso geralmente "só funciona", mas se der problema, iniciar no primeiro click/keydown (fallback).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Electron existente
- `apps/desktop/src/main/ipc/chat.ts` — handler atual (Fase 13, precisa refactor)
- `apps/desktop/src/main/backend-client.ts` — `loadBackendConfig()`, `postToolCallResult()` (Fase 18.5)
- `apps/desktop/src/shared/ipc-types.ts` — `SendAudioResponse` type, precisa atualizar
- `apps/desktop/src/preload/index.ts` — expor shape novo via `window.jarvis.chat.sendAudio`
- `apps/desktop/src/renderer/src/App.tsx` — onde consumir o retorno e disparar o player
- `apps/desktop/src/main/ptt-hotkey.ts` — PTT da Fase 13 (não modificar)
- `apps/desktop/src/renderer/src/hooks/useAudioRecorder.ts` (ou similar) — MediaRecorder existente

### Backend (Fase 19) — referência do shape
- `apps/backend-ts/src/routes/chat-audio.ts` — endpoint POST /chat/audio
- `apps/backend-ts/src/voice/voice-handler.ts` — error codes (VoiceError.code)

### Gateway (Fase 19 plan 08)
- `apps/gateway/src/routes/chat.ts` — proxy `POST /api/chat/audio` com auth forward

### Web APIs
- `AudioContext.decodeAudioData()` — MDN
- `AudioBufferSourceNode` — MDN

</canonical_refs>

<specifics>
## Specific Ideas

- **Toast component:** pode ser um simples state no `App.tsx` (`[error, setError]` + `<div className="toast">` que some após 5s via `setTimeout`). Não precisa de lib nova. Se preferir, `react-hot-toast` é leve e popular.
- **Base64 decode performance:** pra áudios grandes (>500KB base64), o loop `for` byte-a-byte pode ser lento. Alternativa moderna: `Uint8Array.from(atob(base64), c => c.charCodeAt(0))` ou `Buffer.from(base64, 'base64')` se disponível no renderer (Electron tem node integration desligada por padrão — checar).
- **Preload precisa passar base64 via IPC:** strings de 500KB+ via IPC são OK (Electron usa structured clone). Mas se ficar lento, dá pra codificar como `Uint8Array` direto (preload precisa expor via contextBridge com type `Uint8Array`).
- **Error toast auto-hide:** 5s default, clicável pra fechar manual.
- **`currentSource?.stop()` antes de `decodeAudioData`**: cancela o áudio antigo **imediatamente**, mesmo se o novo ainda tá decodificando. UX correto.
- **Tests no renderer:** mockar `AudioContext` + `decodeAudioData` retornando AudioBuffer fake. Testar: play start, cancel on new, onended clear.
- **Tests no main:** mockar `global.fetch` + `loadBackendConfig()` — valida URL, auth header, content-type webm, parsing do response, retry em 5xx, no retry em 4xx.

</specifics>

<deferred>
## Deferred Ideas

- **Streaming TTS (tocar enquanto chega)** — v1.4. Backend geraria frase a frase via SSE.
- **Feedback visual "gravando..."** durante captura — v1.4, UX polish.
- **Visualização de waveform** enquanto grava ou toca — v1.4.
- **Cancel request em flight** (usuário aperta PTT enquanto aguarda resposta anterior) — complicado porque o backend já aceitou. Deferido.
- **Controle de volume do TTS** — usa volume do sistema por ora. UI de slider fica pra v1.4.
- **Histórico de conversas por voz** com replay dos clipes — v1.4.
- **Detecção de silêncio automático** (parar gravação quando user para de falar) — PTT manual já resolve.
- **Multi-device sync** (começar no PC, continuar no celular) — v1.4+.

</deferred>

---

*Phase: 19_5-voice-electron*
*Context gathered: 2026-04-09 via /gsd-discuss-phase*
