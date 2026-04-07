# Requirements: JARVIS v1.3 Migração Python → TypeScript

**Milestone:** v1.3 Migração Python → TypeScript
**Goal:** Unificar toda a stack JARVIS no monorepo pnpm/node, migrando o backend Python para TypeScript gradualmente enquanto mantém ambos rodando em paralelo até validação completa.
**Last updated:** 2026-04-07

## v1.3 Requirements

### Scaffolding & Infrastructure

- [x] **INFRA-01**: apps/backend-ts existe no monorepo pnpm com package.json, tsconfig.json e pnpm scripts funcionais
- [x] **INFRA-02**: Node.js 22.x LTS verificado e TypeScript 5.6+ instalado com strict mode habilitado
- [x] **INFRA-03**: .npmrc configurado com `shamefully-hoist=true` para evitar falhas de build de native modules
- [x] **INFRA-04**: Express HTTP server responde em http://localhost:8001 com GET /health retornando {"status":"ok"}
- [x] **INFRA-05**: Dockerfile multi-stage para backend-ts (build + runtime) seguindo padrão do Python backend
- [x] **INFRA-06**: docker-compose.yml atualizado com serviço backend-ts na porta 8001 com health checks

### Multi-LLM & Agent Core

- [ ] **LLM-TS-01**: createLLM(provider, config) factory function suporta LM Studio, Claude e OpenAI via LangChain.js 0.3.x
- [ ] **LLM-TS-02**: LM Studio conecta via ChatOpenAI com basePath configurável via .env (LMSTUDIO_BASE_URL)
- [ ] **LLM-TS-03**: Validação no startup verifica que todas @langchain/* packages compartilham mesma versão de @langchain/core 0.3.x
- [ ] **LLM-TS-04**: ChatSession class com método send(message) async retorna resposta do LLM via streaming
- [ ] **LLM-TS-05**: @langchain/langgraph implementa ReAct agent loop (Reason → Act → Observe)
- [ ] **LLM-TS-06**: POST /chat retorna resposta JSON completa do agent
- [ ] **LLM-TS-07**: GET /chat/stream retorna Server-Sent Events com tokens incrementais

### Memory & Persistence

- [ ] **MEM-TS-01**: Drizzle ORM schema define tabelas conversations, messages, tool_calls, user_profile matching Python schema
- [ ] **MEM-TS-02**: better-sqlite3 conecta ao banco SQLite em ./data/jarvis.db com pragmas idênticos ao Python
- [ ] **MEM-TS-03**: MemoryManager class salva mensagens no SQLite com timestamp e conversation_id
- [ ] **MEM-TS-04**: ChromaDB JS client conecta ao banco em ./data/chroma com collection "memories"
- [ ] **MEM-TS-05**: Transformers.js gera embeddings via Xenova/all-MiniLM-L6-v2 (mesmo modelo que Python sentence-transformers)
- [ ] **MEM-TS-06**: Semantic search retorna mensagens relevantes via ChromaDB query com threshold de similaridade
- [ ] **MEM-TS-07**: User profile persiste no SQLite e é injetado no contexto de cada conversa

### PC Control Tools

- [ ] **TOOL-TS-01**: FileManager tool (read/write/delete files) via @nut-tree-fork/nut-js com Zod schema para inputs
- [ ] **TOOL-TS-02**: AppLauncher tool (start/stop apps) via systeminformation com validação de processo
- [ ] **TOOL-TS-03**: SystemControl tool (volume, brightness, shutdown) via platform-specific libraries
- [ ] **TOOL-TS-04**: WindowManager tool (list/focus/close windows) via node-window-manager
- [ ] **TOOL-TS-05**: ProcessManager tool (list processes, CPU/memory stats) via systeminformation
- [ ] **TOOL-TS-06**: ScreenAnalyzer tool (screenshot capture) via @nut-tree-fork/nut-js
- [ ] **TOOL-TS-07**: Tool confirmation mechanism pergunta confirmação para ações destrutivas (delete, shutdown, kill)
- [ ] **TOOL-TS-08**: Tool audit log grava todas tool calls no SQLite com timestamp, tool_name, inputs, outputs, success
- [ ] **TOOL-TS-09**: ToolExecutor class registra todas tools com @langchain/langgraph e executa com error handling

### Voice Pipeline

- [ ] **VOICE-TS-01**: nodejs-whisper transcreve áudio WAV 16kHz para texto com WER <5% delta vs Python faster-whisper
- [ ] **VOICE-TS-02**: Transformers.js TTS (Speecht5) sintetiza texto para áudio com qualidade aceitável (tradeoff documentado vs kokoro)
- [ ] **VOICE-TS-03**: Porcupine wake word detecta "Hey JARVIS" com AccessKey validado no startup
- [ ] **VOICE-TS-04**: POST /chat/audio aceita multipart upload de áudio WebM/WAV e retorna transcrição + resposta
- [ ] **VOICE-TS-05**: VoiceManager class orquestra STT → ChatSession → TTS pipeline

### Validation & Cutover

- [ ] **VAL-01**: E2E test suite envia mesmos inputs para Python (8000) e TypeScript (8001) backends
- [ ] **VAL-02**: Comparison assertions validam que resposta de texto é semanticamente equivalente (允许 minor wording differences)
- [ ] **VAL-03**: Tool calls comparison valida que mesmos tools são chamados com mesmos inputs
- [ ] **VAL-04**: SQLite state comparison valida que mensagens/tool_calls/profile são idênticos após cada request
- [ ] **VAL-05**: ChromaDB embeddings comparison valida que embeddings têm >95% cosine similarity
- [ ] **VAL-06**: Performance benchmarks mostram TypeScript latency ≤110% do Python (允许 10% overhead)
- [ ] **VAL-07**: Gateway feature flag (`X-Backend-Version: ts`) roteia requests para TypeScript backend
- [ ] **VAL-08**: Gradual cutover: text chat → TS, depois voice → TS, depois tools → TS
- [ ] **VAL-09**: Python backend marcado deprecated após 1 semana de TS 100% traffic sem issues
- [ ] **VAL-10**: apps/backend-py removido do monorepo e Docker Compose após validação final

## Future Requirements

Deferred para milestones futuros:

- **VOICE-TS-06**: Kokoro TTS Node.js port ou C++ bindings (melhorar qualidade TTS)
- **VOICE-TS-07**: openwakeword alternative sem AccessKey requirement
- **PERF-01**: Performance optimization: latency <100ms p95 (paridade exata com Python)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Novos recursos de IA | v1.3 é migração apenas, não enhancement |
| Mudanças arquiteturais | Manter mesma estrutura do Python (ChatSession, MemoryManager, etc) |
| WebSearch tool | Python não tem, TypeScript não precisa |
| Vision pipeline | Defer para v1.4 (foco em core + voice em v1.3) |
| Multi-usuário | Constraint: uso pessoal, single user |
| Cloud sync | Constraint: privacy-first, tudo local |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 14 | Complete |
| INFRA-02 | Phase 14 | Complete |
| INFRA-03 | Phase 14 | Complete |
| INFRA-04 | Phase 14 | Complete |
| INFRA-05 | Phase 14 | Complete |
| INFRA-06 | Phase 14 | Complete |
| LLM-TS-01 | Phase 15 | Pending |
| LLM-TS-02 | Phase 15 | Pending |
| LLM-TS-03 | Phase 15 | Pending |
| LLM-TS-04 | Phase 17 | Pending |
| LLM-TS-05 | Phase 17 | Pending |
| LLM-TS-06 | Phase 17 | Pending |
| LLM-TS-07 | Phase 17 | Pending |
| MEM-TS-01 | Phase 16 | Pending |
| MEM-TS-02 | Phase 16 | Pending |
| MEM-TS-03 | Phase 16 | Pending |
| MEM-TS-04 | Phase 16 | Pending |
| MEM-TS-05 | Phase 16 | Pending |
| MEM-TS-06 | Phase 16 | Pending |
| MEM-TS-07 | Phase 16 | Pending |
| TOOL-TS-01 | Phase 18 | Pending |
| TOOL-TS-02 | Phase 18 | Pending |
| TOOL-TS-03 | Phase 18 | Pending |
| TOOL-TS-04 | Phase 18 | Pending |
| TOOL-TS-05 | Phase 18 | Pending |
| TOOL-TS-06 | Phase 18 | Pending |
| TOOL-TS-07 | Phase 18 | Pending |
| TOOL-TS-08 | Phase 18 | Pending |
| TOOL-TS-09 | Phase 18 | Pending |
| VOICE-TS-01 | Phase 19 | Pending |
| VOICE-TS-02 | Phase 19 | Pending |
| VOICE-TS-03 | Phase 19 | Pending |
| VOICE-TS-04 | Phase 19 | Pending |
| VOICE-TS-05 | Phase 19 | Pending |
| VAL-01 | Phase 20 | Pending |
| VAL-02 | Phase 20 | Pending |
| VAL-03 | Phase 20 | Pending |
| VAL-04 | Phase 20 | Pending |
| VAL-05 | Phase 20 | Pending |
| VAL-06 | Phase 20 | Pending |
| VAL-07 | Phase 20 | Pending |
| VAL-08 | Phase 21 | Pending |
| VAL-09 | Phase 21 | Pending |
| VAL-10 | Phase 21 | Pending |

**Coverage:** 39/39 requirements mapped (100%)

---
*Requirements finalized: 2026-04-07*
*Traceability updated: 2026-04-07*
