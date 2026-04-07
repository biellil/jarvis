# Phase 13: Audio Endpoint + Voice Input - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Usuário pode usar push-to-talk (PTT) via hotkey configurável para gravar voz, que é convertida para WAV no renderer, transferida via IPC, e enviada para o endpoint POST /api/chat/audio que transcreve via WhisperTranscriber e retorna resposta — com o endpoint disponível também diretamente via curl.

**IN SCOPE:**
- Push-to-talk via hotkey global configurável (press-and-hold)
- MediaRecorder → WAV conversion no renderer
- IPC handler para transferir áudio (ArrayBuffer/Buffer)
- Gateway POST /api/chat/audio (multipart/form-data)
- FastAPI POST /chat/audio (transcrição + resposta)
- Orb state transitions durante gravação/processamento
- Permissão de microfone com feedback de erro

**NOT IN SCOPE (deferred):**
- Wake word integration no Electron (v1.0 já tem no Python CLI — integração Electron fica para fase futura)
- Streaming de áudio em tempo real
- Voice activity detection (VAD) no frontend
- Settings UI para modelo Whisper
- Histórico de comandos de voz

</domain>

<decisions>
## Implementation Decisions

### PTT Interaction
- **D-01:** PTT acionado via **hotkey global configurável** (não botão visual no widget)
- **D-02:** Configuração no **tray menu submenu** (igual Phase 12 hotkey do widget)
- **D-03:** Comportamento: **toggle mode** (REVISED) — apertar 1x → começa gravar, apertar 2x → para e envia. *Rationale: Electron globalShortcut não detecta keyup em hotkeys globais quando app não tem foco (research Phase 13). Press-and-hold real requer @mechakeys/iohook (dependency adicional com CPU concerns). Toggle é solução recomendada.*
- **D-04:** **Opções pré-definidas no menu:** Space, Ctrl+Space, CapsLock — apresentadas como radio buttons no submenu tray (igual Phase 12 hotkey widget)
- **D-05:** Hotkey salvo em **electron-store** (persiste entre sessões)
- **D-06:** Se hotkey falhar ao registrar → continua funcional via tray menu manual trigger

### Audio Format
- **D-07:** MediaRecorder grava em **webm/opus** (formato padrão web)
- **D-08:** **Converter para WAV no renderer** antes de enviar via IPC
- **D-09:** Conversão usando **AudioContext.decodeAudioData()** + PCM encoding
- **D-10:** FastAPI recebe **WAV pronto** para passar ao WhisperTranscriber
- **D-11:** Taxa de amostragem: **16kHz** (padrão Whisper, economiza bandwidth)

### Error Handling
- **D-12:** **NotAllowedError** (sem permissão de microfone): Orb vermelho + tooltip explicando erro
- **D-13:** **Network/timeout errors**: Orb vermelho + **retry automático** (2 tentativas antes de mostrar erro definitivo)
- **D-14:** **Tooltip de erro persiste** até: (a) usuário tentar gravar novamente (limpa erro), (b) usuário fechar widget, OU (c) timeout de 30s (auto-clear se não interagir). *Implementar via estado tooltipError no OrbContext com timer de cleanup.*
- **D-15:** Erros de conversão de áudio (AudioContext falha): Orb vermelho + tooltip "Erro ao processar áudio"

### Orb State Transitions
- **D-16:** Hotkey pressionado → orb muda para **listening** (âmbar pulsante)
- **D-17:** Hotkey solto → orb muda para **processing** (spin/pulse)
- **D-18:** Resposta recebida → orb muda para **responding** (ripple rings)
- **D-19:** Resposta mostrada no SpeechBubble → orb volta para **idle** após 2s

### Claude's Discretion
- **IPC Audio Transfer:** Formato exato do buffer (Uint8Array, ArrayBuffer, ou base64 string) — escolher o mais performático
- **Multipart Naming:** Nome do campo no form-data (audio, file, recording) — seguir convenção HTTP padrão
- **Gateway Proxy:** Se buffer áudio fica em memória ou salva temp file antes de proxiar pro FastAPI
- **FastAPI Temp Files:** Usar NamedTemporaryFile ou salvar em /tmp com cleanup automático
- **Retry Strategy:** Backoff entre retries (imediato, 1s, 3s) — balancear UX vs não sobrecarregar
- **Max Recording Duration:** Limite de tempo (30s? 60s? ilimitado?) — escolher baseado em UX e uso de memória

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Whisper Integration (Python v1.0)
- `src/jarvis/core/voice.py` — WhisperTranscriber já implementado, aceita audio_path (WAV)
- `src/jarvis/config.py` — model_size e language configuráveis via Settings

### IPC Architecture (Phase 9/12)
- `apps/desktop/src/shared/ipc-types.ts` — Padrão Result<T>, channel registry
- `apps/desktop/src/main/ipc/index.ts` — Registry pattern para handlers
- `apps/desktop/src/main/ipc/chat.ts` — Exemplo de handler IPC com fetch HTTP

### Electron APIs
- Electron globalShortcut API docs — register/unregister global hotkeys
- Electron electron-store docs — persistência de config (hotkey, preferências)
- Web MediaRecorder API docs — captura de áudio do microfone
- Web AudioContext API docs — decodificação e conversão de áudio

### Gateway & FastAPI Patterns (Phase 6/7)
- `apps/gateway/src/routes/chat.ts` — Padrão de proxy para FastAPI
- FastAPI multipart/form-data docs — receber uploads de arquivo
- `src/jarvis/api/app.py` — FastAPI app structure, lifespan

### Orb State Management (Phase 11)
- `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` — setState para transições
- `apps/desktop/src/renderer/components/Orb/Orb.css` — Estados: idle, listening, processing, responding

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **WhisperTranscriber:** `src/jarvis/core/voice.py` — transcribe() async, recebe audio_path, retorna texto
- **IPC Pattern:** `main/ipc/chat.ts` handler + `shared/ipc-types.ts` types + `preload/index.ts` contextBridge exposure
- **OrbContext:** `useOrbContext()` hook com setState('listening' | 'processing' | 'responding' | 'idle')
- **Tray Menu:** `src/main/tray.ts` createTray() — adicionar submenu de PTT hotkey aqui (igual Phase 12 hotkey submenu)
- **electron-store:** Já usado para salvar posição do widget (Phase 10) e hotkey widget (Phase 12) — reutilizar para PTT hotkey

### Established Patterns
- **IPC Handlers:** Handler em `main/ipc/{feature}.ts` → registrado em `setupIpcHandlers()` → exposto via preload → tipado em `shared/ipc-types.ts`
- **Result<T> Pattern:** Nunca throw em IPC handlers, sempre retornar `{ success: boolean, data?, error? }`
- **Security:** `contextIsolation: true`, `nodeIntegration: false` — IPC é a ÚNICA ponte entre renderer e main
- **Gateway Proxy:** POST /api/{endpoint} → fetch(`http://localhost:8000/{endpoint}`) com headers + body passthrough
- **FastAPI Async:** Endpoints usam async def, chamadas bloqueantes (Whisper) usam asyncio.to_thread()

### Integration Points
- **Electron globalShortcut:** `globalShortcut.register(accelerator, callback)` e `.unregister()` — igual Phase 12, mas press-and-hold precisa keydown/keyup
- **MediaRecorder:** `navigator.mediaDevices.getUserMedia({ audio: true })` → `new MediaRecorder(stream)` → ondataavailable
- **AudioContext:** Converter blob para WAV: `audioContext.decodeAudioData(arrayBuffer)` → encode PCM → Uint8Array/Buffer
- **IPC Audio:** `ipcRenderer.invoke(channel, audioBuffer)` → main process recebe Buffer → envia via fetch multipart
- **FastAPI File Upload:** `file: UploadFile = File(...)` → `await file.read()` → salvar temp → passar path pro WhisperTranscriber

</code_context>

<specifics>
## Specific Ideas

**PTT Hotkey Menu Structure (tray):**
```
JARVIS
├─ Show
├─ Hide
├─ Configure Widget Hotkey ▶ (Phase 12)
│  ├─ Ctrl+Shift+J    ✓
│  └─ ...
├─ Configure PTT ▶ (Phase 13)
│  ├─ Space
│  ├─ Ctrl+Space    ✓
│  ├─ CapsLock (hold)
│  └─ Custom...
└─ Quit
```

**Orb Visual Feedback Flow:**
1. Idle (azul suave pulsando)
2. PTT hotkey pressed → Listening (âmbar pulsante) + tooltip "Gravando..."
3. PTT hotkey released → Processing (spin/pulse azul)
4. Response arrives → Responding (ripple rings violeta)
5. After 2s → Idle

**Error States:**
- Microfone bloqueado: Orb vermelho + tooltip "Permissão de microfone negada. Libere nas configurações do sistema."
- Network fail (1ª tentativa): Orb vermelho brevemente, retry silencioso
- Network fail (2ª tentativa): Orb vermelho brevemente, retry silencioso
- Network fail (3ª tentativa): Orb vermelho permanente + tooltip "Erro ao conectar. Verifique a conexão."

</specifics>

<deferred>
## Deferred Ideas

### Wake Word Integration (Electron)
- **Usuário mencionou:** Querer ativação por comando de voz ("jarvis oi como está o clima hoje")
- **Status:** v1.0 já tem wake word "Hey JARVIS" via openwakeword no Python CLI
- **Deferred to:** Phase futura (14 ou v1.3) — integrar openwakeword com Electron requer audio stream contínuo + VAD, fora do escopo de Phase 13
- **Rationale:** Phase 13 foca em PTT básico funcionando. Wake word no Electron adiciona complexidade (always-listening, battery drain, privacy concerns)

### Streaming de Áudio
- Enviar chunks de áudio durante gravação (não esperar finalizar) para feedback mais rápido
- Requer streaming SSE bidirecional ou WebSockets — fora do escopo

### Voice Activity Detection (VAD)
- Detectar silêncio e parar gravação automaticamente
- Útil para UX, mas adiciona processamento no frontend

### Settings UI
- Configurar modelo Whisper (base, small, medium) via UI
- Escolher idioma de transcrição
- Deferred: configuração via .env suficiente por enquanto

</deferred>

---

*Phase: 13-audio-endpoint-voice-input*
*Context gathered: 2026-04-07*
