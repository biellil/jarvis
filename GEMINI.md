# JARVIS - Gemini CLI Context

Este arquivo fornece contexto e diretrizes essenciais para o desenvolvimento do projeto **JARVIS**, um assistente pessoal inteligente voltado para privacidade e uso local.

## 🚀 Visão Geral do Projeto

JARVIS (Just A Rather Very Intelligent System) é um assistente pessoal multi-interface (Terminal e Electron) que integra capacidades de voz, texto, memória semântica e controle de PC.
- **Stack:** 100% TypeScript (Node.js 22 LTS).
- **Core Value:** Experiência de conversação natural com memória de longo prazo persistente e execução de ações locais.
- **Privacidade:** Processamento local por padrão (LM Studio, ChromaDB, Whisper offline).

## 🏗️ Arquitetura (Monorepo pnpm)

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Electron  │  ───▶ │   Gateway   │  ───▶ │ Backend TS  │
│  (desktop)  │ HTTP  │  (Express)  │ HTTP  │  (Express)  │
│   Port 3001 │       │  Port 3000  │       │  Port 8001  │
└─────────────┘       └─────────────┘       └─────────────┘
  UI/UX + Audio I/O     Proxy + Auth         LLM + Memory
  PC Action Execution   Forwarding           Voice Pipeline
```

- **`apps/backend-ts`**: Cérebro do sistema. Gerencia LangChain, LangGraph, Drizzle ORM (SQLite), ChromaDB (Vector Store), STT (Whisper) e TTS.
- **`apps/gateway`**: Ponto de entrada unificado, lida com validação Zod e roteamento SSE.
- **`apps/desktop`**: Interface Electron (React + Tailwind). Responsável por capturar áudio, exibir o Orb animado e executar comandos no SO.

## 🛠️ Stack Tecnológica Principal

- **Runtime:** Node.js 22 LTS + TypeScript.
- **Orquestração de IA:** LangChain.js 1.x + LangGraph JS.
- **Memória:** Drizzle ORM + better-sqlite3 + ChromaDB JS.
- **Voz:** `nodejs-whisper` (STT), ElevenLabs/Speecht5 (TTS), `onnxruntime-web` (Wake Word).
- **Frontend:** Electron 41 + React 19 + Tailwind 4.
- **Build/Test:** electron-vite + vitest + pnpm.

## 📋 Comandos de Desenvolvimento

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia backend, gateway e desktop em paralelo (recomendado). |
| `pnpm dev:backend` | Inicia apenas o backend-ts (Porta 8001). |
| `pnpm dev:gateway` | Inicia apenas o gateway (Porta 3000). |
| `pnpm dev:desktop` | Inicia apenas a janela do Electron. |
| `pnpm build` | Gera o build de todos os workspaces. |
| `pnpm test` | Executa vitest em todo o projeto. |
| `pnpm typecheck` | Executa checagem de tipos (tsc). |

## 🧠 Fluxo de Trabalho e Convenções

### Get Shit Done (GSD) Workflow
O projeto segue rigorosamente o workflow **GSD** para planejamento e execução. Artefatos de planejamento residem em `.planning/`.
- **Pesquisa:** `/gsd-research-phase` antes de grandes mudanças.
- **Planejamento:** `/gsd-plan-phase` gera documentos `PLAN.md`.
- **Execução:** `/gsd-execute-phase` para implementação atômica.

### Commits e Estilo
Use **Conventional Commits** com emojis e mensagens em **pt-BR**:
- ✨ `feat`: Nova funcionalidade.
- 🐛 `fix`: Correção de bug.
- ♻️ `refactor`: Refatoração de código.
- 📝 `docs`: Alterações na documentação.
- ✅ `test`: Adição/atualização de testes.
- 🔧 `chore`: Atualização de build/deps.

### Princípios de Ouro
1. **Electron é "Burro":** O desktop lida com I/O e execução de ações. Toda lógica de IA/ML deve residir no Backend-TS.
2. **Abstração Multi-LLM:** Nunca faça hardcode de providers. Use a factory de LLM configurada via `.env`.
3. **Privacidade Primeiro:** Dados de conversa e áudio devem permanecer locais sempre que possível.

## 📂 Arquivos Chave de Contexto

- `README.md`: Visão geral e setup rápido.
- `CLAUDE.md`: Instruções detalhadas para agentes de IA (regras de commit, stack, etc).
- `.planning/PROJECT.md`: Requisitos, decisões arquiteturais e roadmap.
- `.planning/STATE.md`: Estado atual do projeto e milestone ativo.
- `apps/backend-ts/src/index.ts`: Entry point do backend.
- `apps/desktop/src/main/index.ts`: Entry point do processo principal Electron.

## ⚠️ Segurança e Integridade

- **`.env`:** Nunca comite arquivos `.env`. Use `.env.example` como template.
- **Dependencies:** Respeite o `pnpm-lock.yaml`. Evite adicionar bibliotecas banidas (ex: Porcupine/Picovoice devido a requisitos de AccessKey).
- **Tool Execution:** No desktop, ações no PC (File Manager, App Launcher) exigem confirmação visual e audit log no SQLite.
