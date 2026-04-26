# JARVIS — Just A Rather Very Intelligent System

Assistente pessoal inteligente que roda no seu PC. Conversa por voz e texto, lembra de tudo entre sessões, executa ações no computador. Multi-LLM via LM Studio / OpenAI / Claude.

> **Status:** v1.3 completo — stack TypeScript-only. Backend Python removido.

---

## Arquitetura

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Electron  │  ───▶ │   Gateway   │  ───▶ │ Backend TS  │
│  (desktop)  │ HTTP  │  (Express)  │ HTTP  │  (Express)  │
│   porta —   │       │  porta 3000 │       │  porta 8001 │
└─────────────┘       └─────────────┘       └─────────────┘
  UI/UX + áudio I/O     Proxy + auth         LLM + memory
  execução de ações     forward              voice pipeline
  no PC local
```

**Princípio de ouro:** Electron é cliente burro (UI/UX + I/O + execução de ações locais). Backend centraliza **toda IA/ML** (LLM, STT, TTS, embeddings).

Dependências externas:
- **LM Studio** (ou OpenAI/Anthropic) — provider de LLM
- **ChromaDB** — vector store pra memória semântica (roda embedded ou como server)

---

## Stack

| Camada | Tech |
|---|---|
| Runtime | Node 22 LTS + TypeScript ESM |
| Frontend | Electron 41 + React 19 + Tailwind 4 |
| Agent framework | LangChain.js 1.x + `@langchain/langgraph` 1.x |
| Memory | Drizzle ORM + better-sqlite3 + ChromaDB |
| Embeddings | `@xenova/transformers` (all-MiniLM-L6-v2) |
| STT | `nodejs-whisper` (modelo base, offline) |
| TTS | ElevenLabs (cloud, default) + Transformers.js Speecht5 (fallback local) |
| Build | electron-vite + vitest + pnpm |

---

## Pré-requisitos

- **Node 22+** (LTS)
- **pnpm 9+**
- **LM Studio** rodando com um modelo carregado (ou API key de OpenAI/Anthropic)
- **ffmpeg** (pro pipeline de voz — `apt install ffmpeg` / `brew install ffmpeg` / choco windows)
- **ChromaDB** (opcional, só pra memory + voice — `pip install chromadb`)
- Linux (Mac/Windows funcionam mas alguns componentes — como PC tools executor — são Linux-only por ora)

---

## Platform Support

### Windows

Fully supported. Default development platform.

### macOS

Supported. JARVIS runs as a menu bar app — no Dock icon. First launch will prompt for **Microphone** and **Accessibility** permissions in System Settings → Privacy & Security.

### Linux (X11)

JARVIS targets X11 on Linux. A compositing window manager is required for the
transparent orb window to render correctly. Without a compositor, the orb
appears as a black rectangle.

**Enable compositor (if not already running):**
- GNOME, KDE, Cinnamon: compositor enabled by default
- Minimal X11 setups: install and run Picom:
  ```bash
  sudo apt install picom
  picom -b
  ```
- Then launch JARVIS normally.

> Wayland support is planned for v2 (PLAT-08).

---

## Setup inicial

```bash
git clone https://github.com/biellil/jarvis.git
cd jarvis
pnpm install
```

Gera uma API key pra compartilhar entre os apps:

```bash
openssl rand -hex 32
```

Copia o valor e coloca no `.env` na raiz do projeto (ver `.env.example`):

```bash
cp .env.example .env
# edita .env com seu editor favorito
```

Campos obrigatórios:
- `JARVIS_API_KEY` — a chave gerada acima
- `LM_STUDIO_URL` — URL do LM Studio (ex: `http://localhost:1234/v1`)
- `LLM_MODEL` — nome do modelo carregado no LM Studio

Campos opcionais mas úteis:
- `ELEVENLABS_API_KEY` — se quiser TTS cloud de qualidade
- `TTS_PROVIDER=local` — se não quiser usar cloud (fallback Transformers.js, qualidade ruim pt-BR)

---

## Rodando em dev

Todos os 3 apps (backend, gateway, desktop) carregam o `.env` do root automaticamente — backend e gateway via `node --env-file`, desktop via `process.loadEnvFile()` no main process. Não precisa mais de `source .env`.

### Comando único (recomendado)

Da raiz do projeto:

```bash
pnpm dev
```

Sobe **backend-ts + gateway + desktop** em paralelo, com output intercalado por `--stream`. Um `Ctrl+C` derruba os 3.

### Comandos individuais

Se precisar rodar só um app (ex: debugar):

```bash
pnpm dev:backend   # só backend-ts (porta 8001)
pnpm dev:gateway   # só gateway (porta 3000)
pnpm dev:desktop   # só a janela Electron
```

Isso abre a janela do JARVIS. Conversa via texto ou PTT (push-to-talk com `Ctrl+Space`).

### ChromaDB (opcional)

Se for usar memória semântica ou voice pipeline, roda em outro terminal:

```bash
chroma run --host 127.0.0.1 --port 8000 --path /tmp/jarvis-chroma
```

### Outros comandos úteis

```bash
pnpm build      # build de todos os apps
pnpm test       # roda vitest em todos
pnpm typecheck  # tsc --noEmit em todos (quem tiver o script)
```

---

## Validação rápida (sem abrir Electron)

Depois do backend + gateway rodando:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JARVIS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "oi, tudo bem?"}'
```

Se responder `{"message": "..."}`, tá tudo funcionando.

---

## Estrutura do projeto

```
jarvis/
├── apps/
│   ├── backend-ts/          # Backend TypeScript (v1.3)
│   │   └── src/
│   │       ├── llm/         # Factory multi-LLM
│   │       ├── memory/      # Drizzle + ChromaDB + embeddings
│   │       ├── session/     # ChatSession + LangGraph ReAct
│   │       ├── voice/       # STT + TTS providers
│   │       └── routes/      # Express routes
│   │
│   ├── gateway/             # Express proxy (port 3000)
│   │
│   └── desktop/             # Electron app
│       └── src/
│           ├── main/        # Node main process (IPC, backend client, action executor)
│           ├── preload/     # contextBridge
│           └── renderer/    # React UI
│
├── .planning/               # GSD (Get Shit Done) workflow artifacts
│   ├── PROJECT.md           # Visão e constraints
│   ├── ROADMAP.md           # Fases e success criteria
│   ├── STATE.md             # Estado atual do projeto
│   └── phases/              # CONTEXT + PLAN + SUMMARY por fase
│
├── CLAUDE.md                # Instruções para o Claude Code agent
├── .env.example             # Template de configuração
└── README.md                # Este arquivo
```

### Prompt do agente e tools

Tudo que define o comportamento do agente vive em [apps/backend-ts/src/session/](apps/backend-ts/src/session/):

| Arquivo | O que é |
|---|---|
| [system-prompt.ts](apps/backend-ts/src/session/system-prompt.ts) | System prompt do JARVIS (personalidade, regras, contexto injetado) |
| [tools.ts](apps/backend-ts/src/session/tools.ts) | Definição/registro das tools expostas ao LLM |
| [tool-dispatch.ts](apps/backend-ts/src/session/tool-dispatch.ts) | Roteamento das chamadas de tool pro executor correto |
| [pc-tools.ts](apps/backend-ts/src/session/pc-tools.ts) | Tools de controle do PC (apps, janelas, screenshot, etc.) |
| [chat-session.ts](apps/backend-ts/src/session/chat-session.ts) | Loop ReAct — orquestra LLM + tools + memória |

A camada multi-LLM (factory + config + capabilities) fica em [apps/backend-ts/src/llm/](apps/backend-ts/src/llm/).

---

## Problemas comuns

### `JARVIS_API_KEY env var is required`
Esqueceu de rodar `set -a; source .env; set +a` no terminal atual. Roda antes de `pnpm dev`.

### `Connection refused` no LM Studio
LM Studio não tá rodando, ou ngrok caiu. Verifica `LM_STUDIO_URL` no `.env`.

### Electron abre mas nada responde
Backend ou gateway não tá up. Verifica os 3 terminais.

### `ChromaDB connection refused`
Só é necessário se for usar memória semântica ou voice. Roda `chroma run --host 127.0.0.1 --port 8000` em outro terminal.

### Porta em uso
- Backend: 8001
- Gateway: 3000
- ChromaDB: 8000 (quando usado)

Mata processos órfãos: `lsof -ti:3000 | xargs kill` (Linux/Mac) ou `netstat -ano | findstr :3000` (Windows).

### `ffmpeg not found` no backend
Voice pipeline precisa de ffmpeg no PATH. Instala:
- Linux: `apt install ffmpeg`
- macOS: `brew install ffmpeg`
- Windows: `choco install ffmpeg` ou baixa em https://ffmpeg.org

---

## Desenvolvimento

Este projeto usa **[Get Shit Done (GSD)](https://github.com/anthropics/claude-code)** — um workflow de planejamento estruturado com `/gsd-discuss-phase`, `/gsd-plan-phase`, `/gsd-execute-phase`, etc. Veja `.planning/` pra artefatos de cada fase.

### Rodando testes

```bash
# backend
cd apps/backend-ts && pnpm test

# gateway
cd apps/gateway && pnpm test

# desktop
cd apps/desktop && pnpm test
```

### Commits

Use Conventional Commits + emoji em **pt-BR** (ver [CLAUDE.md](./CLAUDE.md) pra tabela completa):

```
✨ feat: nova feature
🐛 fix: bug fix
♻️ refactor: refatoração
📝 docs: documentação
✅ test: testes
🔧 chore: chore
```

---

## Licença

Uso próprio. Sem licença pública por enquanto.
