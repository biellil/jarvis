# Research Summary — JARVIS v2.2 LLM Actions & Polish

**Researched:** 2026-05-05

---

## Stack Additions

| Package | Version | Purpose |
|---------|---------|---------|
| `ws` | 8.20.0+ | WebSocket server para canal backend→Electron actions |
| `express-ws` | 6.0.0+ | Integração ws com Express (route syntax) |
| `@elevenlabs/elevenlabs-js` | 0.3.0+ | SDK oficial ElevenLabs com `.stream()` para TTS streaming |
| `heapdump` | 0.8.0+ | Snapshots V8 heap (soak test) |
| `memwatch-next` | 0.6.0+ | Alertas de leak pós-GC (soak test) |

**Não adicionar:** Socket.io (overkill), Murf npm package (inexiste — usar fetch direto), kokoro (fora de escopo v2.2).

---

## Feature Table Stakes

### LLM → Electron Actions
- LLM pode abrir pasta, abrir arquivo, visualizar arquivo (texto < 1MB inline)
- Confirmação via toast antes de executar ("JARVIS quer abrir X. Permitir?")
- Whitelist de paths: apenas home, Downloads, Documents, Desktop
- Rejeitar executáveis (.exe, .sh, .bat, .app) — somente documentos
- Error states: arquivo não encontrado, permissão negada, fora do whitelist
- Audit log no SQLite (quem pediu, qual arquivo, sucesso/falha)

### Streaming TTS
- TTS começa a tocar antes de gerar o áudio completo
- Chunking por sentença (`[.!?]\s+`) — não palavra a palavra
- Formato MP3 (padrão ElevenLabs); fallback para full-audio se provider não suportar
- TTFB esperado: ~200-300ms (ElevenLabs), ~130ms (Murf Falcon)
- Murf.ai **não suporta streaming real** — continua full-audio como fallback

### Settings Extras
- LM Studio URL: input text, validar `http://host:port`, aplicar via IPC sem restart
- LLM provider switch: aviso de context overflow antes de trocar (tokenizers diferem 10-20%)
- Wake word sensitivity: slider 0.0–1.0 (default 0.5), aplicar via IPC sem restart

### macOS Tray Icon
- PNG template: black+alpha, 22×22 (1x) e 44×44 (2x Retina)
- Nomenclatura: `iconTemplate.png` + `iconTemplate@2x.png` — Electron auto-inverte para dark mode
- Zero código extra — Electron lida automaticamente

### Always-Listening Soak Test
- Script 8h capturando: heap, RSS, event loop lag p99, contagem de AudioContext abertos
- Critérios de pass: heap growth <100MB, RSS <200MB, event loop p99 <50ms
- Não é feature de usuário — validação interna de QA

---

## Architecture Decisions

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| Canal actions backend→Electron | **WebSocket** (`/api/actions`) | SSE é unidirecional; WS permite push do backend sem nova requisição do cliente |
| Roteamento multi-device | `Map<clientId, WebSocket>` em memória | clientId gerado no Electron (crypto.randomUUID + electron-store); gateway proxy transparente |
| Streaming TTS pipeline | **Sentence chunking no Electron** → `.stream()` por sentença | Menor latência percebida; overlap: sentença N tocando enquanto N+1 é gerada |
| Audio playback chunks | **Web Audio API** `decodeAudioData` + buffer queue | Menor overhead que MediaSource Extensions; ~20ms por chunk |
| Confirmação de ações | Toast não-bloqueante com timeout 10s | Não interrompe voz; se sem resposta, aborta silenciosamente |

---

## Top Pitfalls

| Pitfall | Risco | Prevenção |
|---------|-------|-----------|
| LLM gera path fora do whitelist | Acesso a arquivos do sistema | Validação Zod + regex antes de enviar ao Electron; rejeitar no backend |
| Action chega após SSE fechar | Perda silenciosa de comando | WebSocket mantém conexão independente do chat; auto-reconnect no Electron |
| Buffer underrun no TTS streaming | Áudio com glitches entre sentenças | Pre-buffer 500ms + ring buffer watermarks antes de iniciar playback |
| Provider switch com context overflow | Nova LLM vê contexto truncado | Recontar tokens com tokenizer do novo provider; avisar usuário antes de trocar |
| AudioContext acumulando em soak test | Leak de 50-100 MB após 8h | Singleton AudioContext; fechar explicitamente em cleanup |
| Transformers.js tensors não liberados | Leak de 500 MB+ após 1000 inferências | Disposal explícito ou fallback para keyword matching sem Transformers.js |

---

## Phase Order Recommendation

1. **macOS tray icon** — asset only, zero risco
2. **Settings extras** — extensão da UI existente (v2.1), baixo risco
3. **Streaming TTS** — mudança arquitetural moderada, alto impacto UX
4. **LLM→Electron actions** — maior complexidade, nova arquitetura WS
5. **Soak test** — validação pós-features estáveis
