# Phase 15: Multi-LLM Factory + LangChain Integration - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar camada de abstração multi-LLM com LangChain.js 0.3.x — factory function que conecta com LM Studio, Claude e OpenAI via config-based switching, validação de versão core no startup, e capability detection automática.

**Escopo:** Apenas LLM factory e config. ChatSession, streaming e agent runtime ficam no Phase 17.

</domain>

<decisions>
## Implementation Decisions

### Guiding Principle
- **D-01:** **Paridade funcional com Python é obrigatória** — replicar comportamento de `src/jarvis/llm/` exatamente
- **D-02:** Otimizações TypeScript permitidas desde que não quebrem paridade ou mudem API
- **D-03:** Validação E2E no Phase 20 vai comparar outputs TS vs Python — implementação deve garantir mesma resposta

### Factory Pattern
- **D-04:** Function com types explícitos (adaptação TypeScript do `get_llm` Python):
  ```typescript
  function createLLM(provider: 'lmstudio' | 'claude' | 'openai', config?: LLMConfig): ChatModel
  ```
- **D-05:** Retorna instância de `@langchain/core` ChatModel (interface comum para todos providers)
- **D-06:** Provider é string literal type — garante type safety no compile time

### Config Loading & Validation
- **D-07:** Class-based config com zod validation (TypeScript idiom, mais próximo de pydantic):
  ```typescript
  class Settings {
    @validate(z.string().url())
    lmStudioUrl: string

    @validate(z.string().optional())
    claudeApiKey?: string

    @validate(z.string().optional())
    openaiApiKey?: string
  }
  ```
- **D-08:** Carregar de `.env` via `dotenv` no startup
- **D-09:** Validação no startup (`src/index.ts`) — servidor não inicia se config inválido
- **D-10:** Mensagens de erro claras indicando variável faltando e valor esperado

### Provider Auto-Detection
- **D-11:** Detectar capabilities no startup do servidor (`src/index.ts`) — não lazy
- **D-12:** Replicar mesma lógica Python: detecta vision support, streaming, function calling por provider
- **D-13:** Capability detection falha = warning log, não error fatal (permite servidor iniciar mesmo se um provider está offline)

### LangChain.js Version Strategy
- **D-14:** LangChain.js 0.3.x (latest stable segundo research) — **NÃO usar 0.4.x**
- **D-15:** Validação no startup: verificar que todos `@langchain/*` packages compartilham mesma versão de `@langchain/core 0.3.x`
- **D-16:** Startup falha se versão core mismatch detectado (previne runtime errors obscuros)

### Error Handling
- **D-17:** Replicar mensagens de erro Python para consistency de UX
- **D-18:** Error normalization: capturar erros específicos de cada provider e transformar em formato comum
- **D-19:** Sem retry automático no Phase 15 — retry logic vem no Phase 17 (ChatSession)
- **D-20:** Sem fallback between providers — Phase 17 decide roteamento

### Testing Strategy
- **D-21:** **Integration test com LM Studio real rodando** — não usar mocks
- **D-22:** Test avisa no console: "Start LM Studio before running tests (http://localhost:1234)"
- **D-23:** Test valida: conexão, envio de mensagem simples, recepção de resposta válida
- **D-24:** Test skipado automaticamente se LM Studio não está rodando (não falha CI)

### Provider-Specific Details
- **D-25:** LM Studio: `ChatOpenAI` do `@langchain/openai` com `basePath` configurável via `LMSTUDIO_BASE_URL`
- **D-26:** Claude: `ChatAnthropic` do `@langchain/anthropic` com API key de `ANTHROPIC_API_KEY`
- **D-27:** OpenAI: `ChatOpenAI` do `@langchain/openai` com API key de `OPENAI_API_KEY`
- **D-28:** Default provider: LM Studio (privacy-first como Python)

### Claude's Discretion
- Estrutura de diretórios dentro de `src/llm/` (pode ter `factory.ts`, `config.ts`, `providers/` subdir, etc)
- Logging details (qual library, nível de verbosity)
- Type definitions location (pode ter `types.ts` ou inline)
- Como expor factory (export default vs named export)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Multi-LLM & Agent Core — LLM-TS-01, LLM-TS-02, LLM-TS-03

### Python Reference Implementation
- `src/jarvis/llm/__init__.py` — Factory function `get_llm()` signature e behavior
- `src/jarvis/llm/factory.py` — Provider switching logic e capability detection
- `src/jarvis/config.py` — Settings class com pydantic para .env loading
- `src/jarvis/llm/providers/` — Provider-specific implementations (LM Studio, Claude, OpenAI)

### Existing TypeScript Patterns
- `apps/gateway/src/config.ts` — Config loading pattern (pode adaptar para zod)
- `apps/backend-ts/src/config.ts` — Config skeleton do Phase 14
- `apps/gateway/src/middleware/errorHandler.ts` — Error normalization pattern

### LangChain.js Documentation
- LangChain.js 0.3.x docs (não 0.4.x) — ChatModel interface, provider integrations
- `@langchain/openai` docs — ChatOpenAI configuration para LM Studio e OpenAI
- `@langchain/anthropic` docs — ChatAnthropic configuration

### Constraints from PROJECT.md
- `.planning/PROJECT.md` §Constraints — Multi-LLM abstraction obrigatória, nunca hardcode provider

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Gateway config pattern** (`apps/gateway/src/config.ts`) — Pode adaptar para Settings class com zod
- **Gateway error handler** (`apps/gateway/src/middleware/errorHandler.ts`) — Error normalization pattern aplicável a LLM errors
- **Python LLM factory** (`src/jarvis/llm/factory.py`) — Reference implementation completa para replicar

### Established Patterns
- **Config via .env** — Python e Gateway usam, manter consistency
- **Type-safe enums** — Gateway usa Zod enums, aplicável para provider types
- **Startup validation** — Python valida config no import, TypeScript deve validar em `src/index.ts`

### Integration Points
- `src/index.ts` — Startup do servidor, local para validação de config e capability detection
- `src/config.ts` — Settings class, carregada no startup e injetada via dependency
- `src/llm/` — Novo diretório para factory, providers, types

### Known Constraints
- **LangChain.js 0.3.x obrigatório** — 0.4.x tem breaking changes, research recomenda evitar
- **Core version consistency** — Todos @langchain/* devem compartilhar mesma versão de @langchain/core
- **LM Studio base URL** — Deve suportar customização via .env (usuários podem mudar porta padrão 1234)
- **Privacy-first default** — LM Studio é provider padrão (local), nunca defaultar para cloud

</code_context>

<specifics>
## Specific Ideas

### Integration Test Flow
1. Test inicia e checa se LM Studio está rodando (`fetch('http://localhost:1234/v1/models')`)
2. Se offline: skip test com mensagem clara "LM Studio not running — start it and re-run tests"
3. Se online: criar LLM via factory, enviar mensagem "Hi", validar resposta é string não-vazia
4. Limpar recursos (conexões) após test

### Startup Validation Sequence
1. Carregar `.env` via `dotenv.config()`
2. Instanciar Settings class e triggerar zod validation
3. Se validation falha: log erro detalhado e `process.exit(1)`
4. Validar versão @langchain/core em todos packages instalados
5. Se mismatch: log warning com versões encontradas e `process.exit(1)`
6. Tentar detectar capabilities dos providers configurados
7. Log capability matrix (ex: "LM Studio: streaming ✓, vision ✗, functions ✓")
8. Iniciar Express server apenas se tudo passou

### Error Normalization Example
```typescript
// Python: ConnectionError("Could not connect to LM Studio at http://localhost:1234")
// TypeScript deve produzir exata mesma mensagem para paridade UX
try {
  await llm.invoke(...)
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    throw new ConnectionError(`Could not connect to LM Studio at ${config.lmStudioUrl}`)
  }
  // ... outros casos
}
```

</specifics>

<deferred>
## Deferred Ideas

Nenhuma — discussão permaneceu dentro do escopo da fase.

Features mencionadas mas fora de escopo do Phase 15:
- **Retry logic** — Phase 17 (ChatSession é quem decide retries)
- **Fallback between providers** — Phase 17 (roteamento inteligente)
- **Streaming implementation** — Phase 17 (GET /chat/stream)
- **Agent runtime** — Phase 17 (@langchain/langgraph ReAct loop)
- **Function calling/tools** — Phase 18 (PC Control tools)

</deferred>

---

*Phase: 15-multi-llm-factory-langchain-integration*
*Context gathered: 2026-04-07*
