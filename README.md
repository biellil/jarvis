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
- **Para gerar binários Windows em Linux:** `wine` + `mono-devel` + `libfuse2t64` (Ubuntu 24.04 Noble: habilitar i386 antes via `sudo dpkg --add-architecture i386 && sudo apt update`). Veja §Build & Install para instalação completa.

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

## Build & Install

Como gerar e instalar binários distribuíveis do JARVIS em Windows, macOS e Linux. Distribuição usa `electron-builder` e roda local (sem CI/GitHub Actions em v3.1).

### Build local

Gera binários para uma plataforma específica a partir do monorepo:

```bash
pnpm dist          # gera para o OS atual (Linux=AppImage, macOS=DMG, Windows=NSIS+portable)
pnpm dist:linux    # Linux AppImage (requer host Linux)
pnpm dist:win      # Windows NSIS installer + portable (Linux host com wine, ou Windows host)
pnpm dist:mac      # macOS DMG universal arm64+x64 (requer host macOS 12+)
```

Cada comando roda um pre-flight script (`scripts/preflight-dist.mjs`) que valida deps antes de chamar `electron-builder`.

**Pré-requisito para cross-build Windows em Linux (Ubuntu 24.04 Noble):**

```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y wine wine32 wine64 mono-devel libfuse2t64
wine --version    # esperado: wine-9.x
```

> `mono-devel` é **opcional** — NSIS funciona sem (NSIS só precisa de wine). `mono-devel` só é exigido para o target `Squirrel.Windows` (não usado por JARVIS). `libfuse2t64` é necessário para rodar AppImages no próprio host de dev.

> macOS DMG só pode ser buildado em macOS 12+ (limitação Apple — Codesign tooling é Mac-only). Em Linux/Windows host, `pnpm dist:mac` falha-fast com mensagem clara.

### Onde os binários ficam

Após `pnpm dist:*`, artifacts vão para `apps/desktop/release-v2/`:

| Target | Arquivo (padrão) |
|--------|------------------|
| Windows NSIS installer | `JARVIS Setup <version>.exe` |
| Windows portable | `JARVIS <version>.exe` |
| macOS DMG universal | `JARVIS-<version>-universal.dmg` |
| Linux AppImage | `JARVIS-<version>.AppImage` |

### Instalação no Windows

**NSIS installer (`JARVIS Setup <version>.exe`):**

1. Duplo-clique em `JARVIS Setup <version>.exe`.
2. **SmartScreen warning** (esperado — binário não é code-signed em v3.1):
   - Windows 11 24H2 mostra "Microsoft Defender SmartScreen prevented an unrecognized app from starting"
   - Clique em **More info**
   - Clique em **Run anyway**
3. Instalador roda automático (one-click). JARVIS instala em `%APPDATA%\Local\Programs\JARVIS\` (per-user, sem prompt admin) e cria atalhos no Menu Iniciar e Área de Trabalho.
4. **Desinstalação:** Painel de Controle → Apps & Features → "JARVIS" → Uninstall.

**Portable (`JARVIS <version>.exe`):**

1. Duplo-clique no `.exe` portable (qualquer pasta, USB, pendrive — não precisa instalar).
2. Mesmo warning SmartScreen — "More info" → "Run anyway".
3. JARVIS executa diretamente, sem instalação e sem privilégios admin. Settings persistem em `%APPDATA%\JARVIS\` (mesmo caminho da versão instalada — portable e installed compartilham config).

### Instalação no macOS

1. Duplo-clique em `JARVIS-<version>-universal.dmg` para montar.
2. Arraste `JARVIS.app` para `/Applications`.
3. **Gatekeeper bloqueia primeira execução** (binário não-signed):
   - **macOS 15 Sequoia ou mais novo:** após a primeira tentativa falhar com "JARVIS cannot be opened because Apple cannot check it for malicious software", vá em **System Settings → Privacy & Security**, role até o fim da página, clique no botão **Open Anyway** que aparece para JARVIS, confirme no diálogo seguinte.
   - **macOS 12-14 (Monterey / Ventura / Sonoma):** right-click em `JARVIS.app` no Finder → **Open** → **Open** no diálogo de confirmação.
4. Primeira execução pede permissão de microfone — conceda em **System Settings → Privacy & Security → Microphone**.

### Instalação no Linux

```bash
chmod +x JARVIS-<version>.AppImage
./JARVIS-<version>.AppImage --no-sandbox
```

**A flag `--no-sandbox` é necessária em Ubuntu 24.04+ (AppArmor 4.0 hardening).** Em distros mais antigas (Ubuntu 22.04 LTS, Fedora 38) a flag é opcional — o AppImage roda sem ela. Detalhes em [pitfall AppArmor user namespaces](https://tamim.blog/post/fix-appimage-sandbox-issues-ubuntu-24-04/).

**Ubuntu 24.04 Noble — erro `dlopen(): libfuse.so.2`:**

```bash
sudo apt install libfuse2t64
```

Alternativa sem instalar nada: `./JARVIS-<version>.AppImage --appimage-extract-and-run` (extrai squashfs para `/tmp/.mount_xxx`, dispensa FUSE).

### Configuração pós-install (`.env`)

Após primeira execução, JARVIS cria automaticamente um `.env` baseado em `.env.example`. Local por OS:

| OS | Caminho do `.env` |
|----|-------------------|
| Windows | `%APPDATA%\JARVIS\.env` |
| macOS | `~/Library/Application Support/JARVIS/.env` |
| Linux | `~/.config/JARVIS/.env` (respeita `$XDG_CONFIG_HOME`) |

Em Linux/macOS, o arquivo `.env` é criado com permissão `0o600` (owner-only — outros usuários do sistema não podem ler API keys).

**Atalho:** click no ícone do JARVIS na bandeja do sistema (tray) e selecione **"Abrir .env"** — abre o file manager do OS na pasta correta com o `.env` selecionado.

Edite `LLM_PROVIDER`, `OPENAI_API_KEY`, `LM_STUDIO_URL`, etc., e **reinicie o JARVIS** para aplicar mudanças (v3.1 não tem hot-reload — restart é literal).

### Limitações conhecidas (v3.1)

- Binários **não são code-signed** — daí SmartScreen warning em Windows e Gatekeeper bypass em macOS. Code signing foi deferido para v3.2 (DIST-FUT-02).
- **Não há auto-update** — atualização requer rebuild manual + reinstall. Deferido para v3.2 (DIST-FUT-01).
- **macOS DMG só builda em macOS 12+** — limitação Apple. Linux/Windows host falha-fast com mensagem clara.
- **Bundle size grande (~2-2.5 GB)** — JARVIS embute Whisper base + medium models para STT offline funcionar sem download adicional. Pode crescer no futuro com mais models on-demand.

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

## Soak Test (Validação de Release)

Antes de cada release que altere o modo Always-Listening, execute o soak test de 8 horas para validar que não há vazamento de memória:

```bash
# Requer --expose-gc para GC determinístico (recomendado)
npx tsx --expose-gc apps/desktop/scripts/soak-test.ts

# Sem --expose-gc (GC natural, menos preciso)
npx tsx apps/desktop/scripts/soak-test.ts
```

**Critério de PASS:** delta de `heapUsed` < 10 MB em 8 horas (após warm-up de 30s).

O script mede tanto `heapUsed` (JS heap) quanto `rss` (memória total do processo, inclui Whisper/ONNX). Se o RSS crescer >50 MB com heap estável, investigar vazamentos em módulos nativos.

> **Nota:** O soak test dura 8 horas reais. Não é executado no CI — apenas manualmente antes de releases que alterem o modo Always-Listening.

---

## Licença

Uso próprio. Sem licença pública por enquanto.
