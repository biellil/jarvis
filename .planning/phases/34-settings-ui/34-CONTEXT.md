# Phase 34: Settings UI - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Settings UI acessível pelo tray menu — janela separada onde o usuário configura PTT hotkey, TTS provider + API key, e modelo Whisper. Todas as configurações persistem via electron-store entre sessões. TTS provider/key aplica live-reload sem reiniciar o app.

</domain>

<decisions>
## Implementation Decisions

### Settings Window Architecture
- Dedicated `BrowserWindow` nativa — abre como janela separada via tray "Settings" item
- Tamanho: 480×520px, `resizable: false`, `frame: true` (native OS chrome — não frameless como o orb)
- Novo entry point `settings.html` / `settings.tsx` via Vite multi-page — isolado do orb renderer
- `win.hide()` ao fechar (não destrói) — reabre instantaneamente; criar só na primeira abertura

### Form UX & Save Behavior
- Botão "Save" explícito — usuário edita campos e clica Save para aplicar
- 3 seções verticais: **Push-to-Talk**, **Voice (TTS)**, **Transcription (Whisper)** — cada uma com label, controles e separador
- Feedback pós-save: toast "Settings saved" 2s + fechar janela automaticamente
- Hotkey input widget: `<input type="text" readonly>` + botão "Record" que captura a próxima tecla pressionada

### Settings Scope & Data Model
- API keys armazenadas em `electron-store` plaintext (`%APPDATA%/jarvis/config.json`) — padrão do store.ts
- Modelos Whisper: `["tiny", "base", "small", "medium", "large-v3-turbo"]` + `"auto"` como default — override em `whisperModelOverride` no store
- TTS providers: `["murf", "elevenlabs"]` — os dois já implementados. Store: `ttsProvider: "murf" | "elevenlabs"`, `ttsApiKey: string`
- Live-reload TTS: após salvar, main process chama `reinitializeTTS()` no VoiceHandler — sem reiniciar o app

### Claude's Discretion
- Estilo visual da janela (Tailwind, cores, espaçamento) — seguir padrão v1.6 do projeto
- Validação de campos (API key format, hotkey conflicts)
- IPC channel names para settings window ↔ main

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/desktop/src/main/store.ts` — `StoreSchema` + electron-store instance; já tem getters/setters para hotkey, pttHotkey, wakeWordPaused, orbPosition. Adicionar `ttsProvider`, `ttsApiKey`, `whisperModelOverride`
- `apps/desktop/src/main/tray.ts` — `HOTKEY_OPTIONS` e `PTT_HOTKEY_OPTIONS` constantes; `buildContextMenu()` já tem "Settings" menu item (stub a conectar)
- `apps/desktop/src/main/voiceInput/tts/` — `elevenlabs.ts`, `murf.ts`, `provider.ts`; abstração `TTSProvider` com `synthesize()`
- `apps/desktop/src/main/ipc/settings.ts` — atualmente só tem `setupSettingsHandlers()` para wakeWord; expandir com settings window IPC
- `apps/desktop/src/main/hotkey.ts` + `ptt-hotkey.ts` — `changeHotkey()` e `changePttHotkey()` já existem e chamam `globalShortcut.unregister/register`

### Established Patterns
- Main process usa `ipcMain.handle()` para request-response com renderer
- BrowserWindow segue pattern security-hardened de `index.ts` (contextIsolation, sandbox, preload)
- Store accessors são funções puras em `store.ts` — padrão a seguir para novos campos
- Vite multi-page: verificar `vite.config.ts` para padrão existente (splash screen pode ser referência)

### Integration Points
- Tray "Settings" item → `openSettingsWindow()` em main process
- Settings renderer → `ipcRenderer.invoke('settings:get')` / `settings:save`
- Main process recebe save → atualiza store → chama `changeHotkey()`, `changePttHotkey()`, `reinitializeTTS()`
- TTS reinit: `voiceInput/tts/index.ts` provavelmente expõe factory — verificar se aceita config dinâmica

</code_context>

<specifics>
## Specific Ideas

- Botão "Record" para hotkey captura a próxima tecla pressionada (SET-02)
- Após salvar TTS provider/key, TTS aplica imediatamente sem reiniciar app (SET-03 — "imediatamente após salvar")
- Override de modelo Whisper prevalece sobre auto-detection por VRAM (SET-04 — "override manual prevalece")

</specifics>

<deferred>
## Deferred Ideas

- OS keychain para API keys (segurança maior) — v2
- Campo "Custom URL" para TTS local — v2
- Settings adicionais (idioma, wake word sensitivity, tema) — fora do escopo SET-01 a SET-05

</deferred>
