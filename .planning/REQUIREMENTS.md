# Requirements — Milestone v2.2 LLM Actions & Polish

**Goal:** Habilitar o LLM a executar ações no PC do usuário via canal WebSocket bidirecional (abrir/fechar pasta/arquivo, visualizar inline), adicionar streaming TTS para reduzir latência percebida, expandir Settings com LM Studio URL + LLM provider + wake word sensitivity, polir macOS tray icon, e validar Always-Listening em soak test 8h.

---

## v2.2 Requirements

### LLM Actions (LACT)

- [ ] **LACT-01** — Usuário pode pedir ao JARVIS para abrir uma pasta no explorador de arquivos
- [ ] **LACT-02** — Usuário pode pedir ao JARVIS para fechar uma pasta/janela do explorador
- [ ] **LACT-03** — Usuário pode pedir ao JARVIS para abrir um arquivo no app padrão do sistema
- [ ] **LACT-04** — Usuário pode pedir ao JARVIS para fechar um arquivo/app aberto
- [ ] **LACT-05** — Usuário pode pedir ao JARVIS para visualizar o conteúdo de um arquivo texto inline no chat (< 1MB)
- [ ] **LACT-06** — JARVIS solicita confirmação via toast não-bloqueante antes de executar qualquer ação de arquivo/pasta (timeout 10s = aborta silenciosamente)
- [ ] **LACT-07** — Ações de arquivo são restritas a paths dentro de home, Downloads, Documents, Desktop (whitelist com validação Zod no backend)
- [ ] **LACT-08** — Todas as ações de arquivo são registradas no audit log SQLite (timestamp, path, ação, resultado, LLM model)
- [ ] **LACT-09** — Canal backend→Electron via WebSocket (`/api/actions`) com clientId único por instância Electron, persistido em electron-store

### Streaming TTS (STTS)

- [ ] **STTS-01** — TTS inicia playback na primeira sentença completa sem esperar resposta completa do LLM (chunking por `[.!?]\s+` no Electron)
- [ ] **STTS-02** — Feature flag `STREAMING_TTS=true/false` ativa/desativa streaming sem restart (default: false em v2.2 inicial; flip para true após smoke test)

### Settings Extras (SEXT)

- [ ] **SEXT-01** — Usuário pode configurar a URL do LM Studio na UI (campo texto com validação `http://host:port`, aplicado via IPC sem restart)
- [ ] **SEXT-02** — Usuário pode trocar o provider LLM (Claude/OpenAI/LM Studio) na UI com aviso de context overflow antes de confirmar (recontagem de tokens com tokenizer do novo provider)
- [ ] **SEXT-03** — Usuário pode ajustar sensibilidade do wake word via slider 0.0–1.0 (default 0.5, aplicado via IPC sem restart)

### macOS Polish (MCOS)

- [ ] **MCOS-01** — Ícone da tray no macOS respeita modo claro/escuro do sistema via template image (`iconTemplate.png` + `iconTemplate@2x.png`, black+alpha)

### Quality Assurance (QA)

- [ ] **QA-01** — Script de soak test 8h valida que Always-Listening não tem memory leak: heap growth <100MB, RSS growth <200MB, event loop p99 <50ms, AudioContext count = 1 estável

---

## Future Requirements (Deferred to v2.3)

- Offline TTS Kokoro Node.js port
- PTT hotkey global macOS/Linux
- STT latência <500ms p95
- Vision pipeline migração TS
- Linux Wayland support
- Speech bubble redesign + History/context panel

---

## Out of Scope (v2.2)

| Feature | Reason |
|---------|--------|
| LLM pode modificar/deletar arquivos | Capacidade destrutiva — apenas read-only em v2.2; defer para v2.3+ |
| Word-level alignment metadata no streaming TTS | Complexidade alta para retorno marginal; sentence-level é o sweet spot |
| Múltiplos Electron clients simultâneos com seleção de device | Single-client MVP para v2.2; multi-device em v2.3+ |
| Pause/resume de TTS mid-playback | Complexidade não justificada; usuário pode interromper falando novamente |
| PCM/WAV formato customizado para TTS | MP3 cobre 99% dos casos; PCM seria otimização de Phase 2 |
| Sandbox file picker (`dialog.showOpenDialog`) iniciado pelo LLM | Defer — fluxo de "JARVIS abre o que pedi" já cobre uso pessoal |
| Suporte a Murf streaming real | Murf não suporta streaming nativo — fallback para full-audio |

---

## Traceability

_(Preenchido pelo roadmapper após criar ROADMAP.md)_
