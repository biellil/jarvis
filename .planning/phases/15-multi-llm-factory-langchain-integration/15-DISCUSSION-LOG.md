# Phase 15: Multi-LLM Factory + LangChain Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 15-multi-llm-factory-langchain-integration
**Areas discussed:** Factory Pattern, Config Loading, Provider Detection, Error Messages, Testing Strategy

---

## Guiding Principle

**User's directive:** "todos vc tem coloca mais procimo do py questao fucinalidade e resepo pode da piordade a deixa mais otinizado a o ts"

**Interpreted as:** Prioridade é paridade funcional com Python primeiro, otimizações TypeScript depois. Quando houver dúvida, replicar Python. Validação E2E no Phase 20 vai comparar outputs.

---

## Factory Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Function com types explícitos | `function createLLM(provider: 'lmstudio' \| 'claude' \| 'openai', config?: LLMConfig): ChatModel` — adaptação TypeScript do Python `get_llm()` | ✓ |
| Class factory | `LLMFactory.create(provider, config)` — mais OOP, mas menos próximo do Python | |
| Builder pattern | `new LLMBuilder().provider('lmstudio').build()` — muito diferente do Python | |

**User's choice:** Option A (adaptar)
**Rationale:** Mantém signature similar ao Python mas com types explícitos do TypeScript. Provider como string literal type garante type safety.

---

## Config Loading

| Option | Description | Selected |
|--------|-------------|----------|
| Schema simples | Zod schema puro, mais próximo de pydantic structurally | |
| Class-based com zod | Settings class com decorators/validators — TypeScript idiom, mais type-safe | ✓ |

**User's choice:** Option B (class-based com zod)
**Rationale:** Mais idiomático em TypeScript enquanto mantém validação similar ao pydantic. Permite melhor IDE autocomplete e type inference.

---

## Provider Auto-Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy detection | Detectar quando createLLM() é chamado pela primeira vez | |
| Startup detection | Detectar no startup do servidor (src/index.ts) — igual Python que detecta no import | ✓ |

**User's choice:** Option B (startup detection)
**Rationale:** Mantém paridade com Python que detecta no import time. Falhas de config aparecem imediatamente, não na primeira chamada.

---

## Error Messages

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript-style errors | Mensagens idiomáticas do TS/Node | |
| Replicar mensagens Python | Mesmas mensagens de erro para consistency de UX | ✓ |

**User's choice:** Replicar Python (sim)
**Rationale:** Usuários que migrarem do Python reconhecerão erros. Facilita debugging comparativo. Phase 20 E2E validation precisa de paridade.

---

## Testing Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest mock | Mock simula respostas LM Studio — rápido, não precisa servidor real | |
| LM Studio real | Integration test com servidor rodando — lento, mais realista | ✓ |
| Ambos | Unit com mock + integration opcional | |

**User's choice:** Option B (LM Studio real) com aviso para ativar
**Notes:** Test deve avisar no console para iniciar LM Studio. Se offline, skip test automaticamente (não falha CI).
**Rationale:** Garante que factory realmente conecta com LM Studio. Mock pode esconder integration bugs. Skip automático evita flakiness em CI.

---

## LangChain.js Version

| Option | Description | Selected |
|--------|-------------|----------|
| 0.3.x | Latest stable segundo research | ✓ |
| 0.4.x | Versão mais nova, mas pode ter breaking changes | |

**Determined by research:** 0.3.x é stable e recomendado. 0.4.x deve ser evitado até maturar.

---

## Claude's Discretion

User delegou as seguintes áreas para Claude decidir durante planning:
- Estrutura de diretórios dentro de `src/llm/`
- Logging details (library, verbosity)
- Type definitions location
- Export pattern (default vs named)

---

## Deferred Ideas

Nenhuma ideia foi diferida — discussão permaneceu focada no LLM factory do Phase 15.

Features mencionadas mas claramente scoped para phases futuras:
- Retry logic → Phase 17 (ChatSession)
- Fallback between providers → Phase 17
- Streaming → Phase 17
- Agent runtime → Phase 17
- Function calling → Phase 18
