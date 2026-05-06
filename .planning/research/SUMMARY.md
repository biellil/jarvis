# Research Summary — JARVIS v2.3 LLM Providers & System Actions

**Researched:** 2026-05-06

---

## Stack Additions

| Package | Version | Purpose |
|---------|---------|---------|
| `@langchain/google-genai` | 2.1.30 | Google Gemini LLM provider via LangChain abstraction |
| `@google/genai` | 1.52.0 | Official Gemini SDK (replaces deprecated @google/generative-ai) |
| `p-queue` | 8.4.0 | Priority queue for embedding tasks with AbortController support |
| `open` | 11.0.0 | Cross-platform file opener fallback (xdg-open/start/open) |
| `loudness` | 0.4.2 | System volume control — headless, macOS/Windows/Linux |

**LM Studio Streaming Events:** Likely automatic via existing `langchain-openai@0.3.x`. Phase 1 research confirms before any code change.

**Não adicionar:** @google/generative-ai (deprecated Aug 2025), Bull+Redis (overkill), Spotify SDK (errado escopo), Socket.io (já tem ws).

---

## Feature Table Stakes

### LLM-PROV-01 — Google Gemini
- Configurável via Settings UI dropdown (já existe — adicionar "gemini" ao enum)
- GEMINI_API_KEY via env var / electron-store
- Streaming funciona (built-in no @langchain/google-genai)
- Fallback para LM Studio se API key ausente
- **Safety filter null check obrigatório** — Gemini retorna null content silenciosamente em violations (HTTP 200)

### LLM-PROV-02 — LM Studio Streaming Events
- Named events: chat.start, message.delta, chat.end, tts.chunk
- Feature flag; fallback para SSE padrão se modelo não suporta
- **Phase 1 de pesquisa** determina se langchain-openai auto-otimiza ou precisa subclass

### LLM-PRIO-01/02 — Embedding Priority
- Fire-and-forget atual (v1.8) **já satisfaz** LLM-PRIO-02 (graceful degrade)
- LLM-PRIO-01: adicionar AbortController ao p-queue para embedding baixa-prioridade
- MVP: p-queue com prioridade 1 (embed) vs 10 (chat); AbortSignal cleanup obrigatório

### FACT-10/11 — Modelo de Confirmação
- `requiresConfirmation` Set: apenas `['delete_file', 'move_file', 'rename_file']`
- Read-only (openFile, openFolder, viewContent) executam sem toast
- Zod schema precisa `actionType` enum para separação segura

### FACT-12 — Fallback Abre com Padrão do Sistema
- Electron `shell.openPath()` → fallback `shell.openExternal('file://...')` se erro
- `open@11.0.0` para CLI fallback fora do Electron
- **Canonicalizar path via `path.resolve()` antes de openPath** — symlink traversal risk

### SYSCTRL-01 — Volume do Sistema
- `loudness@0.4.2`: getVolume, setVolume, getMuted, setMuted
- LangGraph tool: "aumenta volume", "diminui volume", "muta"
- Electron main process; IPC para renderer feedback

### SYSCTRL-02 — Controles de Mídia
- Electron `globalShortcut`: MediaPlayPause, MediaNextTrack, MediaPreviousTrack
- LangGraph tool: "próxima música", "pause", "anterior"
- **macOS requer Accessibility permissions** — reutilizar padrão Phase 44 (toast acionável)
- Linux Wayland: limitações conhecidas; X11 como target principal

---

## Architecture Integration

Todos os 5 features seguem padrões v2.2 — **zero breaking changes, zero novos serviços**:

```
llm_factory.ts          ← add Gemini case (~20 LOC)
config/store.ts         ← add 'gemini' to LlmProvider union + GEMINI_API_KEY
apps/desktop/Settings   ← provider dropdown auto-picks from union (já dinâmico)
memory/writer.ts        ← wrap embed calls in p-queue with AbortController
pc-tools/open-file.ts   ← shell.openPath() + fallback open package (~8 LOC)
pc-tools/system.ts      ← add volume + media tools (~60 LOC)
main/actions/system.ts  ← Electron action handlers for volume/media (~40 LOC)
```

**Build order sugerido:**
1. Gemini provider (standalone, quick win)
2. Action confirmation model + file fallback (paralelo ao 1)
3. Volume + media controls
4. LM Studio Streaming Events (opcional — pesquisa primeiro)
5. Embedding priority com p-queue (condicional se soak test revelar blocking)

---

## Watch Out For

| Pitfall | Severity | Prevention |
|---------|----------|-----------|
| Gemini safety filter retorna null silenciosamente (HTTP 200) | HIGH | Null check em response.content; toast "JARVIS não pôde responder" |
| LM Studio streaming: modelo sem suporte → hang no pipeline de voz | HIGH | Timeout 500ms + fallback para SSE padrão; feature flag |
| AbortController memory leak no embedding queue | MEDIUM | Cleanup explícito pós-embed; EmbeddingQueue class dedicada; monitorar no soak test |
| shell.openPath path traversal via symlinks | HIGH | path.resolve() antes de qualquer openPath; nunca input raw do usuário |
| macOS media keys exigem Accessibility sem aviso | MEDIUM | Reutilizar padrão v1.9 Phase 44: toast acionável "Abrir System Settings" |
