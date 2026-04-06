# Requirements: JARVIS

**Defined:** 2026-04-06
**Core Value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## v1.2 Requirements

Requirements for v1.2 Desktop UI. Each maps to roadmap phases.

### Audio API

- [ ] **AUDIO-01**: FastAPI aceita `POST /chat/audio` com arquivo de áudio, transcreve via WhisperTranscriber e retorna resposta do ChatSession como JSON
- [ ] **AUDIO-02**: Gateway Express expõe `POST /api/chat/audio` que faz proxy multipart para FastAPI sem parsear o body

### Desktop App (Electron)

- [ ] **DESK-01**: `apps/desktop` scaffoldado no monorepo pnpm com electron-vite + React + TypeScript, com contextIsolation: true, nodeIntegration: false e preload.ts com contextBridge tipado
- [ ] **DESK-02**: BrowserWindow frameless + transparent + always-on-top + skipTaskbar, sem flash branco no load (show: false + ready-to-show)
- [ ] **DESK-03**: Posicionamento automático no canto inferior direito no Windows via `screen.getPrimaryDisplay().workArea` (DPI-aware, taskbar-aware)
- [ ] **DESK-04**: Tray icon com menu contextual Show/Hide/Quit — fallback de ativação e minimize to tray
- [ ] **DESK-05**: Posição da janela persiste entre sessões via electron-store

### Ativação

- [ ] **ACTV-01**: Hotkey global `Ctrl+Shift+J` registra via globalShortcut com checagem de valor de retorno + fallback automático + tray como alternativa obrigatória se ambos falharem
- [ ] **ACTV-02**: Caixa de texto pequena aparece ao ativar o widget — Enter envia mensagem via IPC → main → `POST /api/chat` → resposta aciona transição de estado do orb
- [ ] **ACTV-03**: Push-to-talk grava áudio via MediaRecorder no renderer, converte para PCM via AudioContext.decodeAudioData(), transfere como ArrayBuffer via IPC e envia via `POST /api/chat/audio`

### Orb Animation

- [ ] **ORB-01**: Estado idle — pulsação azul suave animada por CSS keyframes no compositor thread (sem JS animation loop)
- [ ] **ORB-02**: Estado listening — pulso âmbar, ativado durante gravação de voz ou enquanto usuário digita
- [ ] **ORB-03**: Estado processing — animação de pulse/spin indicando aguardo de resposta da API
- [ ] **ORB-04**: Estado responding — ripple rings azuis irradiando do orb enquanto a resposta está sendo processada; volta a idle ao concluir

## v1.3+ Requirements (Deferred)

### Response Display
- **DISP-01**: Texto da resposta exibido em bubble ao lado do orb (typewriter SSE streaming)
- **DISP-02**: TTS playback no widget (resposta falada via kokoro pipeline)

### Platform Expansion
- **PLAT-01**: Suporte a macOS — posicionamento canto superior direito
- **PLAT-02**: Suporte a Linux — fallback para tray quando globalShortcut não disponível (Wayland)

### Voice Enhancement
- **VOIC-01**: Amplitude visualization no orb durante gravação (AnalyserNode WebAudio)
- **VOIC-02**: Wake word activation a partir do Electron (openwakeword em subprocess Node)

### Settings
- **SETT-01**: UI de configuração de hotkey e preferências via electron-store

## Out of Scope

| Feature | Reason |
|---------|--------|
| Texto de resposta em bubble | v1.2 usa só animação — simplicidade primeiro |
| TTS playback no widget | Pipeline TTS complexa — v1.3 |
| WebGL shaders no orb | CSS achieves 95% quality at 10% effort |
| Histórico de conversa no Electron | Python core já gerencia via SQLite + ChromaDB |
| Auto-update (electron-updater) | Requer code signing — complexidade desnecessária agora |
| Settings UI | electron-store via .env por enquanto |
| Always-on microphone / VAD | Privacy concern + battery drain |
| Mac/Linux em v1.2 | Windows first — quirks de plataforma isolados |
| Multi-window para input de texto | Z-ordering issues, IPC mais complexo |

## Traceability

Atualizado durante criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUDIO-01 | — | Pending |
| AUDIO-02 | — | Pending |
| DESK-01 | — | Pending |
| DESK-02 | — | Pending |
| DESK-03 | — | Pending |
| DESK-04 | — | Pending |
| DESK-05 | — | Pending |
| ACTV-01 | — | Pending |
| ACTV-02 | — | Pending |
| ACTV-03 | — | Pending |
| ORB-01 | — | Pending |
| ORB-02 | — | Pending |
| ORB-03 | — | Pending |
| ORB-04 | — | Pending |

**Coverage:**
- v1.2 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14 ⚠️

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after initial definition*
