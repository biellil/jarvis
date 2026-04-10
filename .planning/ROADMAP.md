# Roadmap: JARVIS

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-05)
- ✅ **v1.1 Monorepo + API** — Phases 6-8 (shipped 2026-04-06)
- ✅ **v1.2 Desktop UI** — Phases 9-13 (shipped 2026-04-07)
- 📋 **v1.3 Migração Python → TypeScript** — Phases 14-21 (active)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-04-05</summary>

- [x] Phase 1: Foundation (4/4 plans) — completed 2026-04-02
- [x] Phase 2: Memory (6/6 plans) — completed 2026-04-04
- [x] Phase 3: Voice Pipeline (6/6 plans) — completed 2026-04-04
- [x] Phase 4: PC Control (3/3 plans) — completed 2026-04-05
- [x] Phase 5: Advanced Features (2/2 plans) — completed 2026-04-05

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Monorepo + API (Phases 6-8) — SHIPPED 2026-04-06</summary>

- [x] **Phase 6: FastAPI Core** — Python HTTP layer expondo chat, streaming SSE e health probes (completed 2026-04-05)
- [x] **Phase 7: Monorepo + Express Gateway** — pnpm workspace e gateway Node/TS proxiando para FastAPI (completed 2026-04-06)
- [x] **Phase 8: Docker Compose** — Containerização de ambos os serviços com saúde, volumes e rede (completed 2026-04-06)

</details>

<details>
<summary>✅ v1.2 Desktop UI (Phases 9-13) — SHIPPED 2026-04-07</summary>

- [x] **Phase 9: Electron Scaffold** — apps/desktop bootstrapped no monorepo com arquitetura de segurança correta (contextBridge, IPC skeleton) (completed 2026-04-06)
- [x] **Phase 10: Frameless Widget Window** — janela transparente, always-on-top, posicionada e com tray icon funcional (completed 2026-04-06)
- [x] **Phase 11: Orb Animation** — orb visual com máquina de estados CSS-only cobrindo idle, listening, processing e responding (completed 2026-04-06)
- [x] **Phase 12: Hotkey + Text Chat** — ativação por hotkey global e input de texto com cadeia IPC completa validada (completed 2026-04-07)
- [x] **Phase 13: Audio Endpoint + Voice Input** — endpoint multipart nos três tiers e push-to-talk end-to-end funcional (completed 2026-04-07)

</details>

### 📋 v1.3 Migração Python → TypeScript (Phases 14-21)

- [x] **Phase 14: TypeScript Backend Scaffolding** — Configurar apps/backend-ts no monorepo com Node.js 22.x, Docker e health checks (completed 2026-04-07)
- [x] **Phase 15: Multi-LLM Factory + LangChain Integration** — Implementar factory multi-LLM com LangChain.js 1.x para LM Studio, Claude e OpenAI
 (completed 2026-04-07)
- [x] **Phase 16: Memory Layer (SQLite + ChromaDB + Embeddings)** — Migrar persistência para Drizzle ORM + better-sqlite3 + ChromaDB + Transformers.js embeddings (completed 2026-04-08)
- [x] **Phase 17: ChatSession + Agent Runtime** — Implementar ChatSession com @langchain/langgraph e streaming SSE (completed 2026-04-08)
- [ ] **Phase 18: PC Control Tools — Backend (Payloads + Audit + SSE)** — Backend TS expõe 9 tools como payloads, audit log e eventos SSE
- [ ] **Phase 18.5: PC Control Tools — Electron Executor** — Cliente Electron consome payloads via SSE e executa as ações no PC
- [ ] **Phase 19: Voice Pipeline — Backend (STT + TTS Provider Abstraction)** — POST /chat/audio com STT/TTS via interface de provider; ElevenLabs default TTS, nodejs-whisper default STT
- [ ] **Phase 19.5: Voice Pipeline — Electron (Capture + Playback)** — Mic capture, upload via gateway, playback do TTS retornado
- [ ] **Phase 20: E2E Validation & Python Comparison** — Validar paridade TypeScript vs Python com testes E2E e comparação de outputs
- [ ] **Phase 21: Cutover & Python Deprecation** — Migrar tráfego 100% para TypeScript e deprecar backend Python

## Phase Details

### Phase 6: FastAPI Core
**Goal**: O core Python do JARVIS está acessível via HTTP com suporte a respostas completas, streaming SSE token-a-token e health probes para orquestradores externos
**Depends on**: Nothing (primeira fase do v1.1 — Python core v1.0 já está completo)
**Requirements**: API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. `curl -X POST http://localhost:8000/chat -d '{"message":"oi"}' -H 'Content-Type: application/json'` retorna resposta JSON completa com o texto do JARVIS
  2. `curl -N "http://localhost:8000/chat/stream?message=oi"` exibe tokens chegando incrementalmente em tempo real (Server-Sent Events), não uma resposta buffered
  3. `curl http://localhost:8000/health` retorna `{"status":"ok"}` indicando que o serviço está vivo
  4. `curl http://localhost:8000/health/ready` retorna status indicando se ChromaDB e SQLite estão operacionais e prontos para receber requests
  5. Todos os 234 testes existentes continuam passando após a adição do FastAPI — `python -m jarvis` CLI funciona idêntico ao v1.0
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — FastAPI app scaffold, lifespan, Settings, health endpoints (API-03, API-04)
- [x] 06-02-PLAN.md — send_stream(), POST /chat (API-01), GET /chat/stream SSE (API-02)

### Phase 7: Monorepo + Express Gateway
**Goal**: O projeto tem estrutura pnpm workspaces com um gateway Express/TypeScript que recebe requests externos, valida payloads e proxia para FastAPI sem buffering de stream
**Depends on**: Phase 6 (FastAPI deve estar rodando para o gateway ter algo para proxiar)
**Requirements**: MONO-01, GW-01, GW-02, GW-03, GW-04, GW-05
**Success Criteria** (what must be TRUE):
  1. `pnpm install` executado na raiz do repositório instala todas as dependências Node de todos os pacotes do workspace sem erros
  2. `curl -X POST http://localhost:3000/api/chat -d '{"message":"oi"}' -H 'Content-Type: application/json'` retorna a resposta do JARVIS proxiada pelo gateway Express
  3. `curl -N "http://localhost:3000/api/chat/stream?message=oi"` exibe tokens chegando incrementalmente através do proxy Express — sem buffering, sem delay até o final
  4. `curl http://localhost:3000/api/health` retorna saúde agregada do gateway e do Python service
  5. Um request com payload inválido (ex: sem campo `message`) retorna erro estruturado `{"error":..., "code":..., "message":...}` com HTTP 4xx — nunca chega ao Python
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — pnpm workspace scaffold, Express app factory, Zod validation, error normalization (MONO-01, GW-04, GW-05)
- [x] 07-02-PLAN.md — Proxy routes: POST /api/chat, GET /api/chat/stream SSE, GET /api/health agregado (GW-01, GW-02, GW-03)

### Phase 8: Docker Compose
**Goal**: Ambos os serviços (Python FastAPI e Node gateway) rodam em containers orquestrados por Docker Compose, com persistência de dados entre restarts e o gateway só iniciando após o Python estar saudável
**Depends on**: Phase 7 (ambos os serviços devem funcionar localmente antes de containerizar)
**Requirements**: DOCKER-01, DOCKER-02, DOCKER-03, DOCKER-04, DOCKER-05
**Success Criteria** (what must be TRUE):
  1. `docker compose up --wait` sobe ambos os serviços e reporta ambos como healthy sem intervenção manual
  2. `curl -X POST http://localhost:3000/api/chat -d '{"message":"oi"}' -H 'Content-Type: application/json'` responde corretamente com ambos os serviços rodando em containers
  3. `docker compose down && docker compose up --wait` preserva histórico de conversas e memória semântica — dados do SQLite e ChromaDB persistem no volume `./data`
  4. O gateway nunca inicia se o Python service não passar no health check — `docker compose logs gateway` não mostra tentativas de conexão enquanto Python ainda está inicializando
  5. `docker build` não inclui `.env`, `.venv/`, `node_modules/`, `data/` nem `.planning/` na imagem — verificável via `docker image inspect` e ausência de segredos no layer
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — Dockerfile.python multi-stage, Dockerfile.node multi-stage, .dockerignore (DOCKER-01, DOCKER-02, DOCKER-05)
- [x] 08-02-PLAN.md — docker-compose.yml com health checks, depends_on, volumes, networking + smoke test (DOCKER-03, DOCKER-04)

### Phase 9: Electron Scaffold
**Goal**: O pacote apps/desktop existe no monorepo pnpm com a arquitetura de segurança correta do Electron — contextIsolation ativo, nodeIntegration desativado, preload tipado com contextBridge — pronto para receber código de feature sem herdar falhas estruturais
**Depends on**: Phase 7 (monorepo pnpm já existe — apps/desktop se adiciona ao workspace existente)
**Requirements**: DESK-01
**Success Criteria** (what must be TRUE):
  1. `pnpm --filter desktop dev` inicia o Electron e abre uma janela mostrando o renderer React sem erros no terminal ou no DevTools console
  2. O renderer pode chamar `window.jarvis.sendText('teste')` e o main process recebe o valor via ipcMain — confirmável nos logs — sem que `nodeIntegration` esteja habilitado
  3. `contextIsolation: true` e `nodeIntegration: false` estão explícitos no código do BrowserWindow e qualquer tentativa de acessar `require` diretamente no renderer lança erro
  4. A estrutura de diretórios `src/main/`, `src/preload/`, `src/renderer/` existe e electron-vite compila os três entry points separadamente sem warnings
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md — Package structure, electron-vite config, TypeScript config, shared IPC types, Tailwind design tokens (DESK-01)
- [x] 09-02-PLAN.md — Main process with security settings, preload contextBridge, React renderer, IPC handlers, tests (DESK-01)

### Phase 10: Frameless Widget Window
**Goal**: O widget aparece na tela como uma janela frameless transparente always-on-top posicionada no canto inferior direito — sem flash branco no load, com tray icon operacional e posição que persiste entre sessões
**Depends on**: Phase 9 (BrowserWindow e arquitetura de segurança estabelecidos)
**Requirements**: DESK-02, DESK-03, DESK-04, DESK-05
**Success Criteria** (what must be TRUE):
  1. Ao iniciar o app, o widget aparece no canto inferior direito da tela de trabalho (acima da taskbar) sem nenhum flash branco — comportamento verificável visualmente
  2. O widget permanece visível sobre todas as outras janelas abertas, incluindo janelas maximizadas, sem precisar de clique para reaparecer no topo
  3. O ícone de tray aparece na bandeja do sistema com menu contextual contendo Show, Hide e Quit — clicar em cada opção executa a ação correspondente
  4. Fechar e reabrir o app restaura a janela exatamente na posição onde estava quando foi fechada — verificável arrastando a janela e reiniciando
  5. O widget não aparece na taskbar nem no alt+tab durante operação normal
**Plans**: 2 plans

Plans:
- [x] 10-01-PLAN.md — Position module, frameless window config, draggable container (DESK-02, DESK-03, DESK-05)
- [x] 10-02-PLAN.md — Tray icons, tray module with Show/Hide/Quit menu (DESK-04)

### Phase 11: Orb Animation
**Goal**: O orb exibe quatro estados visuais distintos — idle, listening, processing, responding — animados inteiramente por CSS keyframes no compositor thread, sem JS animation loop, com transições suaves entre estados via troca de classe CSS
**Depends on**: Phase 9 (renderer React funcionando com structure de componentes estabelecida)
**Requirements**: ORB-01, ORB-02, ORB-03, ORB-04
**Success Criteria** (what must be TRUE):
  1. No estado idle, o orb exibe pulsação azul suave e contínua — animação não para mesmo após vários minutos sem interação
  2. Ao acionar o estado listening (programaticamente via DevTools ou hotkey), o orb muda para pulso âmbar visivelmente diferente do idle em menos de 300ms
  3. Ao acionar o estado processing, o orb exibe animação de pulse/spin claramente distinta dos outros estados, indicando aguardo
  4. Ao acionar o estado responding, o orb exibe ripple rings irradiando do centro; ao transicionar de volta para idle, o orb retorna ao azul suave sem corte abrupto
  5. Em DevTools Performance, as animações de idle e responding rodam em compositor thread (sem paint records no trace durante animação steady-state)
**Plans**: 2 plans

Plans:
- [x] 11-01-PLAN.md — Orb component with state-based CSS classes
- [x] 11-02-PLAN.md — CSS keyframes animations and state context

### Phase 12: Hotkey + Text Chat
**Goal**: O usuário pode ativar o widget com Ctrl+Shift+J e enviar uma mensagem de texto que percorre a cadeia IPC completa (renderer → preload → main → gateway → FastAPI) e retorna resposta, com o orb transitando de estado durante o ciclo
**Depends on**: Phase 10 (janela funcional), Phase 11 (orb com máquina de estados), Phase 9 (IPC skeleton)
**Requirements**: ACTV-01, ACTV-02
**Success Criteria** (what must be TRUE):
  1. Pressionar Ctrl+Shift+J em qualquer contexto (janela de outro app em foco, desktop, terminal) mostra/oculta o widget — verificável sem clicar no widget primeiro
  2. Se Ctrl+Shift+J estiver tomado por outro app, o widget registra um fallback automático e o tray icon ainda ativa o widget — o app não silencia a falha
  3. Com o widget ativo, digitar uma mensagem na caixa de texto e pressionar Enter faz o orb transicionar para processing imediatamente, antes da resposta chegar
  4. A resposta do JARVIS retorna e o orb volta para idle — a mensagem trafegou por renderer → IPC → main → POST /api/chat → FastAPI → resposta — verificável nos logs do gateway
**Plans**: 4 plans

Plans:
- [x] 12-01-PLAN.md — Global hotkey registration and tray submenu configuration
- [x] 12-02-PLAN.md — Text input UI component with button toggle
- [x] 12-03-PLAN.md — IPC handler with gateway HTTP integration
- [x] 12-04-PLAN.md — Speech bubble display and orb state orchestration

### Phase 13: Audio Endpoint + Voice Input
**Goal**: Push-to-talk via hotkey → MediaRecorder → WAV conversion → IPC → multipart upload → WhisperTranscriber → response
**Depends on**: Phase 12 (cadeia IPC completa e ciclo de resposta validados via texto), Phase 9 (arquitetura de segurança com permissão de microfone)
**Requirements**: AUDIO-01, AUDIO-02, ACTV-03
**Success Criteria** (what must be TRUE):
  1. `curl -X POST http://localhost:3000/api/chat/audio -F "audio=@test.wav"` retorna resposta JSON com o texto transcrito e a resposta do JARVIS — verificável sem o Electron aberto
  2. `curl -X POST http://localhost:8000/chat/audio -F "audio=@test.wav"` retorna resposta JSON diretamente no FastAPI — gateway e FastAPI expõem o endpoint de forma independente
  3. No widget Electron, segurar o botão de push-to-talk aciona o estado listening no orb; soltar o botão para de gravar e o orb transiciona para processing enquanto aguarda a API
  4. A resposta de voz retorna e o orb volta para idle — o áudio gravado trafegou por MediaRecorder → PCM conversion → IPC → POST /api/chat/audio → WhisperTranscriber → ChatSession
  5. O app solicita permissão de microfone ao usuário na primeira vez que push-to-talk é usado — nunca rejeita silenciosamente com NotAllowedError sem feedback
**Plans**: 4 plans

Plans:
- [x] 13-01-PLAN.md — Install dependencies and create test scaffolds (AUDIO-01, AUDIO-02, ACTV-03)
- [x] 13-02-PLAN.md — Implement backend audio endpoints (AUDIO-01, AUDIO-02)
- [x] 13-03-PLAN.md — Frontend audio recording with IPC handler (ACTV-03)
- [x] 13-04-PLAN.md — PTT hotkey integration and orb states (ACTV-03)

### Phase 14: TypeScript Backend Scaffolding
**Goal**: apps/backend-ts existe no monorepo com infraestrutura completa, servidor HTTP rodando em 8001, e Docker Compose configurado
**Depends on**: Nothing (primeira fase do v1.3)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06
**Success Criteria** (what must be TRUE):
  1. Developer pode executar `pnpm --filter backend-ts dev` e ver servidor HTTP em http://localhost:8001
  2. GET /health retorna {"status":"ok"} com status 200
  3. Native modules (better-sqlite3, @nut-tree-fork/nut-js) importam sem erros após `pnpm install`
  4. Docker Compose levanta backend-ts na porta 8001 com health check passando
  5. TypeScript compila em strict mode sem erros
**Plans**: 2 plans

Plans:
- [x] 14-01-PLAN.md — Package structure, Express server, health endpoint, tests (INFRA-01, INFRA-02, INFRA-04)
- [x] 14-02-PLAN.md — Docker multi-stage build, Docker Compose integration, .npmrc verification (INFRA-03, INFRA-05, INFRA-06)

### Phase 15: Multi-LLM Factory + LangChain Integration
**Goal**: createLLM() factory conecta com LM Studio, Claude e OpenAI via LangChain.js 1.x com config-based switching e paridade total com Python
**Depends on**: Phase 14
**Requirements**: LLM-TS-01, LLM-TS-02, LLM-TS-03
**Success Criteria** (what must be TRUE):
  1. User pode alternar entre LM Studio, Claude e OpenAI via .env sem mudar código
  2. LM Studio client conecta em http://localhost:1234/v1 (ou LM_STUDIO_URL customizado) e recebe respostas
  3. Todas @langchain/* packages compartilham @langchain/core 1.x (verificado no startup)
  4. Integration test chama LM Studio e recebe resposta de chat válida
**Plans**: 3 plans

Plans:
- [x] 15-01-PLAN.md — Install LangChain.js 1.x packages, Zod config validation, test setup (LLM-TS-01, LLM-TS-03)
- [x] 15-02-PLAN.md — Factory function with provider switching, LM Studio integration, error handling (LLM-TS-01, LLM-TS-02)
- [x] 15-03-PLAN.md — Version validation, capability detection, startup integration (LLM-TS-01, LLM-TS-03)

### Phase 16: Memory Layer (SQLite + ChromaDB + Embeddings)
**Goal**: Mensagens persistem no SQLite via Drizzle ORM e buscas semânticas funcionam via ChromaDB com embeddings Transformers.js
**Depends on**: Phase 14
**Requirements**: MEM-TS-01, MEM-TS-02, MEM-TS-03, MEM-TS-04, MEM-TS-05, MEM-TS-06, MEM-TS-07
**Success Criteria** (what must be TRUE):
  1. MemoryManager salva mensagem no SQLite e ela persiste após restart do servidor
  2. Semantic search retorna mensagens relevantes com threshold de similaridade configurável
  3. Database schema TypeScript (Drizzle) é idêntico ao schema Python (4 tabelas: conversations, messages, tool_calls, user_profile)
  4. Embeddings gerados via Xenova/all-MiniLM-L6-v2 têm >95% cosine similarity com embeddings Python (mesmo input)
  5. User profile persiste e é injetado automaticamente no contexto de cada conversa
**Plans**: 5 plans

Plans:
- [x] 16-01-PLAN.md — Drizzle deps, schema, db client, migrations (MEM-TS-01, MEM-TS-03)
- [x] 16-02-PLAN.md — MemoryStore + ToolLogger classes with CRUD parity (MEM-TS-02, MEM-TS-03)
- [x] 16-03-PLAN.md — Transformers.js embeddings singleton + Python parity script (MEM-TS-05)
- [x] 16-04-PLAN.md — MemoryVectors via ChromaDB JS with threshold filter (MEM-TS-04, MEM-TS-06)
- [x] 16-05-PLAN.md — Profile extraction + MemoryManager facade (MEM-TS-07)

### Phase 17: ChatSession + Agent Runtime
**Goal**: ChatSession integra LLM + memory + @langchain/langgraph para agent ReAct loop com streaming SSE
**Depends on**: Phase 15, Phase 16
**Requirements**: LLM-TS-04, LLM-TS-05, LLM-TS-06, LLM-TS-07
**Success Criteria** (what must be TRUE):
  1. User envia mensagem via POST /chat e recebe resposta completa do agent em JSON
  2. User conecta em GET /chat/stream e recebe tokens SSE incrementalmente
  3. Conversation history persiste no SQLite após cada mensagem
  4. Semantic retrieval injeta memórias relevantes no contexto do agent automaticamente
  5. Agent executa loop ReAct (Reason → Act → Observe) sem travar
**Plans**: 4 plans
**UI hint**: yes

Plans:
- [ ] 17-01-PLAN.md — ChatSession skeleton: history, SYSTEM_PROMPT, MemoryManager wiring, send() simples (LLM-TS-04, LLM-TS-06)
- [ ] 17-02-PLAN.md — Tool recall_memory + createReactAgent integrado no ChatSession (LLM-TS-05, LLM-TS-07)
- [ ] 17-03-PLAN.md — sendStream async generator via llm.stream() (LLM-TS-05)
- [ ] 17-04-PLAN.md — Endpoints POST /chat + GET /chat/stream SSE, SessionLock, wiring startup (LLM-TS-04, LLM-TS-05, LLM-TS-06, LLM-TS-07)

### Phase 18: PC Control Tools — Backend (Payloads + Audit + SSE)
**Goal**: Backend TS expõe 9 tools LangChain que retornam payloads `{action, args}`, registra audit log no dispatch e emite eventos `action` via SSE para o cliente Electron executar
**Depends on**: Phase 17
**Requirements**: TOOL-TS-01, TOOL-TS-02, TOOL-TS-03, TOOL-TS-04, TOOL-TS-05, TOOL-TS-06, TOOL-TS-07, TOOL-TS-08, TOOL-TS-09
**Architectural divergence vs Python**: Python `ActionExecutor` roda subprocess no backend. TS divide responsabilidades: backend gera payloads, cliente (Fase 18.5) executa. Decisão tomada em /gsd-discuss-phase 18 (2026-04-08).
**Success Criteria** (what must be TRUE):
  1. As 9 tools LangChain (`open_app`, `close_app`, `list_files`, `search_files`, `move_file`, `delete_file`, `set_volume`, `set_brightness`, `list_processes`) estão registradas no `createReactAgent` da `ChatSession`
  2. Cada tool retorna um payload `{action, args}` idêntico ao equivalente Python (validado via snapshot test)
  3. Cada chamada de tool é registrada no SQLite via `ToolLogger` com `outcome='dispatched'` e timestamp
  4. SSE de `/chat/stream` emite eventos `event: action\ndata: {payload}\n\n` quando o agent invoca uma tool
  5. Endpoint `POST /tool-calls/:id/result` aceita `{success, output, error}` do cliente e atualiza o audit log com o outcome real
  6. Tools de leitura (list/search) retornam payload sem nenhum side effect; tools destrutivas marcam `requires_confirmation: true` no payload
**Plans**: 5 plans

Plans:
- [ ] 18-01-PLAN.md — 9 PC tools LangChain + fixtures Python + snapshot tests (TOOL-TS-01..TOOL-TS-07)
- [ ] 18-02-PLAN.md — ToolLogger.logDispatch/updateOutcome + schema migration (TOOL-TS-08)
- [ ] 18-03-PLAN.md — Wrap PC tools + plug no createReactAgent + setDispatchListener hook (TOOL-TS-08, TOOL-TS-09)
- [ ] 18-04-PLAN.md — sendStream via agent.stream + SSE event: action no /chat/stream (TOOL-TS-09)
- [ ] 18-05-PLAN.md — POST /tool-calls/:id/result endpoint + wiring createApp (TOOL-TS-08)

### Phase 18.5: PC Control Tools — Electron Executor
**Goal**: Cliente Electron consome eventos `action` via SSE, executa as 9 ações em handlers Linux nativos, pede confirmação via dialog nativo para destrutivas e reporta outcome de volta ao backend
**Depends on**: Phase 18
**Requirements**: TOOL-TS-01..TOOL-TS-09 (lado cliente)
**Success Criteria** (what must be TRUE):
  1. Renderer reconhece `event: action` no SSE de `/chat/stream` e despacha via IPC para o main process
  2. Main process tem handlers Linux para as 9 actions usando `child_process` (`pactl`, `xdg-open`, `brightnessctl`, `fs.promises`, etc)
  3. Actions com `requires_confirmation: true` exibem `dialog.showMessageBox()` nativo antes de executar
  4. Após execução (sucesso ou falha), o Electron faz `POST /tool-calls/:id/result` reportando outcome ao backend
  5. Falhas (subprocess error, permissão, comando inexistente) viram erro estruturado e não derrubam o renderer
  6. Smoke test E2E: usuário pede "abre o calculator" → backend emite action → Electron executa → backend grava outcome
**Fallback**: Se a integração Electron travar (subprocess sem display, IPC quebrando, permissões), abre-se uma sub-fase 18.5.x replicando o `ActionExecutor` Python no backend TS como fallback server-side.
**Plans**: 6 plans
- [ ] 18_5-01-PLAN.md — Parser SSE + reconnect backoff no main process
- [ ] 18_5-02-PLAN.md — Backend client autenticado (API key + postToolCallResult)
- [ ] 18_5-03-PLAN.md — 9 action handlers Linux com execFile + validators
- [ ] 18_5-04-PLAN.md — Action executor: dedup TTL, confirmação, queue serial, reporting
- [ ] 18_5-05-PLAN.md — Refactor ipc/chat.ts + bootstrap main/index.ts
- [ ] 18_5-06-PLAN.md — Gateway proxy tool-calls + forward Authorization no chat stream

### Phase 19: Voice Pipeline — Backend (STT + TTS Provider Abstraction)
**Goal**: Backend TS expõe `POST /chat/audio` com STT/TTS via interface de provider — STT local (nodejs-whisper) por default, TTS cloud (ElevenLabs) por default, ambos trocáveis via env var. Wake word fica deferido (PTT já existe na Fase 13).
**Depends on**: Phase 17
**Architectural principle**: Electron é cliente burro de UI/UX. Toda IA/ML mora no backend.
**Requirements**: VOICE-TS-01, VOICE-TS-02, VOICE-TS-05 (VOICE-TS-03 wake word deferido pra v1.4)
**Success Criteria** (what must be TRUE):
  1. `POST /chat/audio` aceita upload multipart de áudio WebM/Opus, transcreve via `STTProvider`, manda transcrição pra `ChatSession` e devolve resposta
  2. `STTProvider` interface tem implementação `LocalSTTProvider` (nodejs-whisper modelo `base` default, override via `WHISPER_MODEL` env var) e fica pronta pra adicionar `CloudSTTProvider` (ElevenLabs/OpenAI) sem refator
  3. `TTSProvider` interface tem implementação `ElevenLabsTTSProvider` (default, requer `ELEVENLABS_API_KEY`) e `LocalTTSProvider` (Transformers.js Speecht5 fallback). Trocável via `TTS_PROVIDER=elevenlabs|local` env var
  4. Endpoint retorna áudio TTS junto da resposta de texto (formato WAV bytes em base64 no JSON ou multipart)
  5. Audit log registra cada transcrição e síntese (latência, tamanho do áudio, provider usado)
  6. Falha do provider cloud (timeout, sem API key, 5xx) faz fallback automático para local provider e logga warning
**Plans**: 8 plans

Plans:
- [ ] 19-01-PLAN.md — STTProvider interface + LocalSTTProvider (nodejs-whisper) + ffmpeg check (VOICE-TS-01)
- [ ] 19-02-PLAN.md — TTSProvider interface + ElevenLabsTTSProvider via fetch (VOICE-TS-02)
- [ ] 19-03-PLAN.md — LocalTTSProvider via Transformers.js Speecht5 + WAV encoder (VOICE-TS-02)
- [ ] 19-04-PLAN.md — FallbackTTSProvider wrapper + createTTSProvider() factory (VOICE-TS-02)
- [ ] 19-05-PLAN.md — Tabela voice_calls + migration Drizzle + MemoryStore.logVoiceCall/updateVoiceCall (VOICE-TS-05)
- [ ] 19-06-PLAN.md — VoiceHandler orquestra STT → ChatSession → TTS → audit (VOICE-TS-01, VOICE-TS-02, VOICE-TS-05)
- [ ] 19-07-PLAN.md — POST /chat/audio router com multer + SessionLock + bootstrap (VOICE-TS-01, VOICE-TS-02, VOICE-TS-05)
- [ ] 19-08-PLAN.md — Gateway proxy POST /api/chat/audio para backend TS (VOICE-TS-01, VOICE-TS-02, VOICE-TS-05)

### Phase 19.5: Voice Pipeline — Electron (Capture + Playback)
**Goal**: Electron captura áudio do microfone, faz upload pro backend via gateway, recebe resposta com áudio TTS e toca nos speakers. Zero processamento de IA local.
**Depends on**: Phase 19
**Requirements**: VOICE-TS-04 (PTT integration)
**Success Criteria** (what must be TRUE):
  1. Renderer captura áudio via MediaRecorder em formato WebM/Opus (mantém implementação atual)
  2. Main process empacota áudio em multipart e POST pra `/api/chat/audio` via gateway (autenticado com API key)
  3. Resposta do backend `{message, audio_base64}` é processada — texto vai pro renderer chat, áudio é decodificado e tocado via Web Audio API ou similar
  4. PTT hotkey existente (Fase 13) continua funcionando — apertar tecla começa capture, soltar termina e envia
  5. Player de áudio cancela playback anterior se nova resposta chegar (evita overlap)
**Plans**: 4 plans
- [ ] 19_5-01-PLAN.md — Refactor chat:send-audio IPC handler (auth, webm, shape novo, error mapping)
- [ ] 19_5-02-PLAN.md — Atualizar SendAudioResponse types + preload
- [ ] 19_5-03-PLAN.md — ttsPlayer Web Audio API + simplificar useAudioRecorder pra webm bruto
- [ ] 19_5-04-PLAN.md — Integração App.tsx (transcription/message no chat + TTS playback + Toast pt-BR)

### Phase 20: E2E Validation & Python Comparison
**Goal**: TypeScript backend produz outputs idênticos ao Python backend para mesmos inputs (100% paridade validada)
**Depends on**: Phase 18, Phase 18.5, Phase 19, Phase 19.5
**Requirements**: VAL-01, VAL-02, VAL-03, VAL-04, VAL-05, VAL-06, VAL-07
**Success Criteria** (what must be TRUE):
  1. E2E test suite envia 20 inputs distintos para Python (8000) e TypeScript (8001) e compara outputs
  2. Text responses são semanticamente equivalentes (允许 minor wording differences due to LLM non-determinism)
  3. Tool calls são idênticos (mesmo tool, mesmos inputs, mesmo resultado)
  4. SQLite state após N requests é idêntico (mesmas mensagens, mesmo user profile)
  5. ChromaDB embeddings têm >95% cosine similarity para mesmos inputs
  6. TypeScript latency é ≤110% do Python (performance overhead acceptable)
  7. Gateway feature flag `X-Backend-Version: ts` roteia requests para TypeScript backend corretamente
**Plans**: 2 plans

Plans:
- [ ] 20-01-PLAN.md — Gateway middleware backendRouter.ts + feature flag X-Backend-Version (VAL-07)
- [ ] 20-02-PLAN.md — Script e2e-compare.ts com comparacao texto/tools/SQLite/ChromaDB/performance (VAL-01 a VAL-06)

### Phase 21: Cutover & Python Deprecation
**Goal**: Backend TypeScript recebe 100% do tráfego de produção e backend Python é removido do monorepo
**Depends on**: Phase 20
**Requirements**: VAL-08, VAL-09, VAL-10
**Success Criteria** (what must be TRUE):
  1. Gateway roteia 100% traffic para backend TypeScript (porta 8001) por padrão — sem feature flag
  2. Nenhum arquivo Python permanece no monorepo (src/jarvis/, Dockerfile.python removidos)
  3. Docker Compose contém apenas gateway + backend-ts
  4. README.md e .env.example sem referências ao Python backend
**Plans**: 3 plans

Plans:
- [ ] 21-01-PLAN.md — Gateway hardcode TypeScript: deletar backendRouter.*, simplificar config.ts e routes/chat.ts (VAL-08, VAL-09)
- [ ] 21-02-PLAN.md — Remover Python do monorepo: src/jarvis/, Dockerfile.python, docker-compose.yml (VAL-10)
- [ ] 21-03-PLAN.md — Limpar documentacao: README.md e .env.example sem vars Python-only (VAL-08, VAL-09, VAL-10)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2026-04-02 |
| 2. Memory | v1.0 | 6/6 | Complete | 2026-04-04 |
| 3. Voice Pipeline | v1.0 | 6/6 | Complete | 2026-04-04 |
| 4. PC Control | v1.0 | 3/3 | Complete | 2026-04-05 |
| 5. Advanced Features | v1.0 | 2/2 | Complete | 2026-04-05 |
| 6. FastAPI Core | v1.1 | 2/2 | Complete | 2026-04-05 |
| 7. Monorepo + Express Gateway | v1.1 | 2/2 | Complete | 2026-04-06 |
| 8. Docker Compose | v1.1 | 2/2 | Complete | 2026-04-06 |
| 9. Electron Scaffold | v1.2 | 2/2 | Complete | 2026-04-06 |
| 10. Frameless Widget Window | v1.2 | 2/2 | Complete | 2026-04-06 |
| 11. Orb Animation | v1.2 | 2/2 | Complete | 2026-04-06 |
| 12. Hotkey + Text Chat | v1.2 | 4/4 | Complete | 2026-04-07 |
| 13. Audio Endpoint + Voice Input | v1.2 | 4/4 | Complete | 2026-04-07 |
| 14. TypeScript Backend Scaffolding | v1.3 | 2/2 | Complete    | 2026-04-07 |
| 15. Multi-LLM Factory + LangChain Integration | v1.3 | 3/3 | Complete   | 2026-04-07 |
| 16. Memory Layer (SQLite + ChromaDB + Embeddings) | v1.3 | 5/5 | Complete   | 2026-04-08 |
| 17. ChatSession + Agent Runtime | v1.3 | 0/4 | Planned | - |
| 18. PC Control Tools Migration | v1.3 | 0/0 | Not started | - |
| 19. Voice Pipeline (STT + TTS + Wake Word) | v1.3 | 0/0 | Not started | - |
| 20. E2E Validation & Python Comparison | v1.3 | 0/0 | Not started | - |
| 21. Cutover & Python Deprecation | v1.3 | 0/3 | Planned | - |