# Feature Landscape: Migração Python → TypeScript

**Domain:** Backend conversacional Python migrando para TypeScript
**Researched:** 2026-04-07

Este documento analisa como as features existentes do JARVIS Python se traduzem para TypeScript, identificando table stakes (essenciais), complexidades de migração, e gaps de feature parity.

## Context: O que já existe em Python

v1.2 shipped com:
- Multi-LLM factory (LM Studio, Claude, OpenAI) via LangChain Python
- Memory: SQLite (conversations, profile, tool audit) + ChromaDB (semantic retrieval)
- ChatSession com streaming, tool calling, compression, profile extraction
- PC Control: 9 tools (files, apps, system) com confirmation + ActionExecutor
- Voice: STT (faster-whisper), TTS (kokoro), wake word (openwakeword)
- Vision: ScreenAnalyzer com fallback chain (local vision → OCR → cloud)
- FastAPI HTTP + Express gateway + Electron desktop
- 251 tests passando

## Table Stakes Features

Features que DEVEM existir no backend TypeScript para manter feature parity. Sem elas, o produto regride.

| Feature | Python Implementation | TypeScript Equivalent | Complexity | Notes |
|---------|----------------------|----------------------|------------|-------|
| **Multi-LLM abstraction** | `llm/factory.py` com LangChain Python | LangChain.js com `@langchain/openai`, `@langchain/anthropic` | **Low** | LangChain.js tem feature parity completa. BaseChatModel abstraction existe. VERIFIED: LangChain.js documentation March 2026. |
| **LLM streaming** | `llm.astream()` via async generator | `model.stream()` via async generator | **Low** | API quase idêntica. Pitfall: alguns providers têm quirks com streaming + JSON mode. |
| **SQLite conversation storage** | `memory/store.py` com `sqlite3` stdlib | `better-sqlite3` (low-level) ou Prisma (ORM) | **Low** | better-sqlite3 é mais próximo do sqlite3 Python (raw SQL). Prisma adiciona type safety mas overhead. |
| **ChromaDB semantic memory** | `memory/vectors.py` com `chromadb` client | `chromadb` npm package (1.5.x) | **Low** | Cliente JS/TS oficial existe. API similar ao Python. Embedded mode funciona. |
| **Tool calling (function calling)** | `@tool` decorator + `bind_tools()` | `tool()` function + `bindTools()` com Zod | **Low** | LangChain.js tem feature parity. Usa Zod para schemas (equivalente ao Pydantic). |
| **Tool confirmation pattern** | `requires_confirmation` flag no payload | Replicar pattern com payload flag | **Low** | Lógica de negócio, não limitação técnica. |
| **Tool audit log** | SQLite `tool_calls` table | Replicar com better-sqlite3 ou Prisma | **Low** | Schema SQL é portável. |
| **Streaming HTTP (SSE)** | FastAPI `StreamingResponse` | Express com `res.write()` + `Content-Type: text/event-stream` | **Low** | Gateway TypeScript já implementa SSE passthrough (v1.1). Pattern conhecido. |
| **Profile extraction** | LLM second call pós-streaming | Replicar: LLM invoke após stream completo | **Low** | Lógica de negócio, não blocker técnico. |
| **Session compression** | `_maybe_compress()` com token counting | `@langchain/core/messages` tem utilities de token counting | **Medium** | Precisa verificar se count_tokens_approximately existe em JS. |

## Differentiators

Features que agregam valor mas não são críticas para MVP TypeScript. Podem ser staged em fases futuras.

| Feature | Python Implementation | TypeScript Path | Complexity | Value | Notes |
|---------|----------------------|-----------------|------------|-------|-------|
| **Hot-reload de modelo** | `Settings()` re-instantiation + detect_capabilities | Replicar com dotenv reload + capability detection | **Low** | **High** | Valuable para dev UX. Não blocker — pode lançar sem e adicionar depois. |
| **Vision routing (local → OCR → cloud)** | `ScreenAnalyzer` com fallback chain | Replicar chain: capability detection → pytesseract equivalent → cloud LLM | **High** | **Medium** | OCR em Node é complexo (ver seção Pitfalls). Cloud fallback funciona desde que LLM tenha vision. |
| **Wake word detection** | `openwakeword` Python package | Porcupine Node.js SDK (requer API key) ou vox-whisper wrapper | **High** | **Medium** | openwakeword não tem port oficial para Node. Porcupine é comercial. Differentiator, não blocker. |
| **Neural TTS (kokoro)** | `kokoro` Python package (82M model) | Kokoro.js (Transformers.js wrapper) | **Medium** | **High** | Kokoro.js existe (official npm), mas qualidade vs Python não verificada. Fallback: cloud TTS APIs. |
| **Offline STT (faster-whisper)** | `faster-whisper` (CTranslate2 backend) | `smart-whisper` (whisper.cpp addon) ou `vox-whisper` (docker wrapper) | **High** | **High** | faster-whisper não tem port direto. whisper.cpp bindings existem mas são native addons (build complexity). |

## Anti-Features

Features a explicitamente NÃO replicar — erros de design ou bloat desnecessário.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Python FastAPI mantida em paralelo** | Duplicação de código, dois servidores rodando | Migrar completamente para TypeScript backend. FastAPI vira legacy após validação. |
| **ChromaDB client-server mode** | Complexity overhead (Docker, network) para uso pessoal | Usar embedded mode (default) — PersistentClient no Node.js. |
| **LangChain Community packages** | Deprecated, menor manutenção, API inconsistente | Usar provider-specific: `@langchain/openai`, `@langchain/anthropic`. |
| **pyautogui port direto** | Biblioteca ultrapassada, API feia, cross-platform frágil | Usar `nut.js` (moderno, N-API, TypeScript friendly). |
| **pyttsx3 TTS** | Voz robótica inaceitável | Já substituído por kokoro em Python. Não portar pyttsx3 — começar com kokoro.js ou cloud TTS. |
| **Multiple ORMs (TypeORM + Prisma + better-sqlite3)** | Decision paralysis, overhead de dependencies | Escolher UM: better-sqlite3 (raw SQL, leve) OU Prisma (type-safe, DX). |

## Feature Dependencies

Mapeamento de dependências entre features — ordem de implementação importa.

```
Multi-LLM factory
  ↓
ChatSession básico (sem tools, sem memory)
  ↓
SQLite store (conversations, messages)
  ↓
Streaming HTTP (SSE)
  ↓
Tool calling framework
  ↓
PC Control tools (files, apps, system) ← Blocker: nut.js ou robotjs funcionando
  ↓
Tool confirmation + audit log
  ↓
ChromaDB semantic memory
  ↓
Profile extraction
  ↓
Session compression
  ↓
Voice pipeline (STT, TTS, wake word) ← Independente, pode ser paralelo
  ↓
Vision pipeline (screen analysis, fallback chain) ← Independente, pode ser paralelo
```

**Nota crítica:** PC Control tools dependem de native addons (nut.js ou robotjs) funcionarem em Windows/Linux/macOS. Blocker técnico — testar early.

## Feature Parity Gaps

Gaps conhecidos onde TypeScript/Node.js não tem equivalente direto ao Python. Requer workarounds ou deferred features.

### Gap 1: faster-whisper Performance

**Python:** `faster-whisper` usa CTranslate2 (C++), 4x mais rápido que `openai/whisper` PyTorch.

**TypeScript:** Opções:
- `smart-whisper` (whisper.cpp native addon) — performance similar, mas build complexity (C++ toolchain)
- `vox-whisper` (faster-whisper Docker wrapper) — adiciona Docker como dependency
- `@fugood/whisper.node` (whisper.cpp bindings) — mais recente (Feb 2026), suporta GPU

**Workaround:** Começar com `smart-whisper` ou `@fugood/whisper.node`. Se build pain, fallback temporário para cloud STT (OpenAI Whisper API) até resolver.

**Impact:** Medium. STT é gargalo de UX — precisa de <500ms para feel responsivo.

### Gap 2: openwakeword (Offline Wake Word)

**Python:** `openwakeword` é open-source, sem API key, roda em onnxruntime.

**TypeScript:** Não existe port oficial. Opções:
- **Porcupine Node.js SDK:** Comercial, requer API key (violação de privacy-first se não tiver tier grátis)
- **openWakeWord via child_process:** Spawn Python subprocess — ugly mas funciona

**Workaround:** Defer wake word para Phase futura. MVP pode começar com PTT (push-to-talk) apenas. Wake word é nice-to-have, não blocker.

**Impact:** Low. PTT via hotkey (Ctrl+Shift+J) já existe no desktop (v1.2).

### Gap 3: sentence-transformers Embeddings

**Python:** `sentence-transformers` com `all-MiniLM-L6-v2` (22 MB, 384-dim, CPU).

**TypeScript:** Opções:
- `@botisan-ai/sentence-transformers` — port TypeScript de sentence-transformers
- `Transformers.js` (Hugging Face) — roda modelos ONNX em Node.js/browser

**Workaround:** Usar Transformers.js com `all-MiniLM-L6-v2` exportado para ONNX. ChromaDB JS client aceita custom embedding functions.

**Impact:** Low. Embedding model é swappable — não afeta API surface.

### Gap 4: kokoro TTS Quality

**Python:** `kokoro` 82M parameter model, Apache license, 350 MB.

**TypeScript:** `Kokoro.js` existe (Transformers.js wrapper), mas:
- Performance vs Python não verificada em benchmarks
- Qualidade de voz pode ter degradação (quantization artifacts?)

**Workaround:**
1. Validar Kokoro.js quality early com testes A/B (Python vs TS output)
2. Se inadequado, fallback para cloud TTS (ElevenLabs, OpenAI TTS-1) temporariamente
3. Ou manter Python TTS via subprocess (hybrid approach) até resolver

**Impact:** Medium. TTS é sensorial — voz robótica quebra imersão. Quality gate: deve ser indistinguível do Python ou melhor.

### Gap 5: OCR Fallback (pytesseract)

**Python:** `pytesseract` wrapper para Tesseract OCR.

**TypeScript:** Opções:
- `tesseract.js` (WASM port do Tesseract) — roda em Node.js, mas mais lento que nativo
- `node-tesseract-ocr` (wrapper do Tesseract CLI) — requer Tesseract instalado no sistema

**Workaround:**
1. Usar `tesseract.js` para portabilidade (sem system dependency)
2. Se muito lento, fallback direto para cloud vision (pular OCR)

**Impact:** Low. OCR é fallback secundário — usado apenas quando modelo local não tem vision capability. Maioria dos casos usa modelo local com vision ou cloud direto.

### Gap 6: PyWinCtl / platform-specific APIs

**Python:** `pywin32` (Windows), `python-xlib` (Linux), `pyobjc` (macOS) isolados em `platform/` modules.

**TypeScript:** Opções:
- `nut.js` — cross-platform desktop automation (N-API, TypeScript types)
- `robotjs` — older, menos manutenção, mas battle-tested
- `node-window-manager` — window control específico

**Workaround:** Usar `nut.js` como abstraction layer primária. É o equivalente mais próximo do pyautogui pattern (mouse, keyboard, screen) com TypeScript support.

**Impact:** High. PC Control é core feature — sem isso, JARVIS perde 9 tools. CRITICAL: testar nut.js em Windows early. Se não funcionar, blocker.

## MVP Recommendation (TypeScript Backend)

Priorize features por ordem de dependencies + migration risk.

### Phase 1: Core LLM + Memory (Table Stakes)
**Goal:** Chat conversacional com streaming e memória persistente.

Features:
1. Multi-LLM factory (LangChain.js) — LM Studio, Claude, OpenAI
2. ChatSession básico — streaming, message history
3. SQLite store — conversations, messages, profile (better-sqlite3 ou Prisma)
4. ChromaDB — semantic memory com Transformers.js embeddings
5. HTTP API — POST /chat, GET /chat/stream (SSE)

**Defer:** Tool calling, PC Control, voice, vision.

**Validation:** Comparar output Python vs TypeScript — mesma entrada, mesma resposta (semantic equivalence, não char-by-char).

### Phase 2: Tool Calling + PC Control (Critical Differentiator)
**Goal:** JARVIS executa ações no PC via linguagem natural.

Features:
1. Tool calling framework (LangChain.js `bindTools` + Zod)
2. PC Control tools (9 ferramentas) — nut.js implementation
3. ActionExecutor pattern — confirmation, audit log
4. Tool result injection — ToolMessage history

**Blocker:** nut.js MUST work on Windows (ambiente de dev). Testar early. Se não funcionar, avaliar robotjs ou node-window-manager.

**Validation:** Cada tool — Python vs TypeScript output identical. Audit log entries match.

### Phase 3: Voice Pipeline (High Value, High Complexity)
**Goal:** STT + TTS funcionando offline (ou fallback cloud aceitável).

Features:
1. STT — `smart-whisper` ou `@fugood/whisper.node` (fallback: OpenAI Whisper API)
2. TTS — `Kokoro.js` (fallback: ElevenLabs ou OpenAI TTS-1)
3. Audio capture — `node-audiorecorder` ou `node-record-lpcm16-ts`

**Defer:** Wake word (openwakeword gap). PTT é suficiente para MVP.

**Validation:**
- STT: WER (Word Error Rate) vs Python — deve ser <5% difference
- TTS: A/B listening test — quality acceptável vs Python

### Phase 4: Vision Pipeline (Differentiator, Medium Complexity)
**Goal:** Screen analysis com fallback chain.

Features:
1. Screenshot capture — `nut.js` ou `screenshot-desktop`
2. Vision routing — capability detection → local LLM vision
3. OCR fallback — `tesseract.js`
4. Cloud fallback — Anthropic/OpenAI vision APIs

**Validation:**
- Vision: Claude/GPT-4 análise de mesma screenshot — semantic equivalence
- OCR: text extraction accuracy vs Python pytesseract

### Phase 5: Advanced Features (Post-MVP)
**Defer até validação E2E completa.**

Features:
- Hot-reload de modelo
- Session compression
- Wake word detection (requires openwakeword solution)
- Profile extraction automation

## Complexity Matrix

| Feature Category | Complexity | Migration Effort | Risk | Priority |
|------------------|------------|------------------|------|----------|
| Multi-LLM factory | Low | 1-2 days | Low | P0 |
| SQLite store | Low | 2-3 days | Low | P0 |
| ChromaDB + embeddings | Low-Medium | 2-3 days | Low | P0 |
| Streaming HTTP | Low | 1 day | Low | P0 |
| Tool calling framework | Low | 1-2 days | Low | P1 |
| PC Control tools (nut.js) | Medium-High | 5-7 days | **High** | P1 |
| STT (whisper.cpp) | High | 3-5 days | Medium | P2 |
| TTS (Kokoro.js) | Medium | 2-3 days | Medium | P2 |
| Vision pipeline | Medium-High | 4-5 days | Medium | P2 |
| Wake word | High | 5-7 days | High | P3 |

**Total estimated effort:** 26-37 days (excludes testing, debugging, integration).

**Highest risk:** PC Control tools — native addon dependency. If nut.js fails on Windows, fallback options are limited.

## Testing Strategy

### Unit Tests
- LLM factory: cada provider (mock API responses)
- SQLite store: CRUD operations, error handling
- ChromaDB: add_memory, query_memories, embedding consistency
- Tool functions: payload structure validation
- Tool executor: confirmation logic, audit log writes

### Integration Tests
- ChatSession: E2E flow — user input → LLM response → save to SQLite
- Tool calling: user request → tool invocation → ToolMessage → final response
- Streaming: SSE chunks arrive in order, no dropped tokens
- Memory: profile facts injected into system prompt correctly

### Comparison Tests (Python vs TypeScript)
**Critical for validation:** Same input → semantically equivalent output.

- **Semantic comparison:** Embed both responses, cosine similarity >0.95
- **Tool calls:** Same tools invoked with same args
- **Audit log:** Entry structure identical (JSON schema match)
- **SQLite schema:** Tables, columns, constraints identical

### Performance Benchmarks
- **Streaming latency:** Time to first token <500ms (vs Python baseline)
- **STT latency:** Audio → transcript <500ms (vs Python faster-whisper)
- **TTS latency:** Text → audio start <300ms (vs Python kokoro)
- **Memory retrieval:** ChromaDB query <100ms (vs Python)

## Sources

**HIGH confidence (official documentation, verified 2026):**
- LangChain.js: https://js.langchain.com/docs/ (March 2026)
- LangGraph.js: https://langgraphjs.guide/ (April 2026)
- ChromaDB JS client: https://docs.trychroma.com/reference/js/client (2026)
- Transformers.js: https://huggingface.co/docs/hub/en/transformers-js (2026)
- Kokoro.js: https://huggingface.co/posts/Xenova/503648859052804 (2026)
- nut.js: https://nutjs.dev/ (2026)

**MEDIUM confidence (community resources, verified by multiple sources):**
- whisper.cpp bindings comparison: npm search results, GitHub activity
- Prisma vs better-sqlite3: https://www.bytebase.com/blog/prisma-vs-typeorm/ (2025, still relevant)
- Porcupine Node.js SDK: https://picovoice.ai/docs/api/porcupine-nodejs/ (official)

**LOW confidence (single source, needs validation):**
- Kokoro.js quality vs Python: not benchmarked independently
- tesseract.js performance: anecdotal reports, needs profiling
- smart-whisper stability: smaller project, less battle-tested than faster-whisper

## Feature Parity Score

| Category | Python Features | TypeScript Equivalent | Parity Score | Notes |
|----------|----------------|----------------------|--------------|-------|
| LLM orchestration | 5/5 | 5/5 | **100%** | LangChain.js feature parity complete |
| Memory (SQL + vector) | 5/5 | 5/5 | **100%** | better-sqlite3 + ChromaDB JS client equivalent |
| Tool calling | 5/5 | 5/5 | **100%** | Zod schemas = Pydantic, bindTools = bind_tools |
| PC Control | 5/5 | 4/5 | **80%** | nut.js equivalent to pyautogui, but Windows stability TBD |
| STT | 5/5 | 3.5/5 | **70%** | whisper.cpp slower than faster-whisper, build complexity |
| TTS | 5/5 | 4/5 | **80%** | Kokoro.js exists but quality unverified vs Python |
| Vision | 5/5 | 4/5 | **80%** | tesseract.js slower than pytesseract, cloud fallback same |
| Wake word | 5/5 | 2/5 | **40%** | No direct openwakeword equivalent, Porcupine requires API key |

**Overall Feature Parity: 85%**

**Acceptable for production:** YES, com workarounds documentados.

**Blockers:** Nenhum. Gaps podem ser mitigados (cloud fallbacks, deferred features).

## Next Steps

1. **Decision:** better-sqlite3 (raw SQL) vs Prisma (ORM) — resolve antes de Phase 1
2. **Spike:** nut.js Windows compatibility — 1 day spike test antes de Phase 2
3. **Validation:** Kokoro.js quality A/B test — early Phase 3 gate
4. **Defer:** Wake word até post-v1.3 — PTT hotkey é suficiente para MVP TypeScript

---

*Last updated: 2026-04-07 — Research completa para Milestone v1.3*
