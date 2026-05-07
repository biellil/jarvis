# Phase 60: LM Studio Streaming Events - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar suporte ao protocolo Streaming Events nativo do LM Studio para reduzir first-token latency, com feature flag na Settings UI e fallback automático para SSE padrão quando o protocolo não for suportado pelo modelo carregado.

Fora de escopo: eventos de reasoning por step, feedback de progresso por etapa (v2.4), controle por modelo específico.

</domain>

<decisions>
## Implementation Decisions

### Abordagem de Implementação
- **D-01:** Investigar primeiro se `ChatOpenAI` com `streaming:true` já usa o protocolo mais eficiente do LM Studio via compat API, antes de subclassificar ou trocar de cliente. O agente pesquisador produz RESEARCH.md com a decisão documentada (suficiente / precisa de subclasse / SDK nativo) antes do plano de implementação.

### Detecção de Capacidade
- **D-02:** Try + fallback automático por turn — se o feature flag estiver ativo, tenta Streaming Events; em erro ou resposta inesperada, usa SSE padrão silenciosamente. Fallback não é persistido: o próximo turn tenta novamente (modelo pode trocar entre requests).

### Feature Flag
- **D-03:** Toggle nas Settings UI replicando o padrão `streamingTtsEnabled` (Phase 53): `store.ts` + IPC `STREAMING_LM_STUDIO_SET` / `STREAMING_LM_STUDIO_CHANGED` + toggle em `LlmSection`, apply-sem-restart. Segue o padrão Phase 52/53 exato.
- **D-04:** Toggle sempre visível na `LlmSection`, independente do provider ativo (sem lógica condicional de render).

### Comportamento do Fallback
- **D-05:** Fallback silencioso — apenas log interno quando Streaming Events falha e SSE é usado. Usuário recebe a resposta normalmente; fallback é detalhe de implementação, não erro de UX.

### Claude's Discretion
- Nome exato do IPC e chave do store para o feature flag (seguir convenção de `streamingTtsEnabled`)
- Se a investigação concluir que `ChatOpenAI` já é suficiente: apenas adicionar o feature flag sem nova implementação de streaming
- Estrutura dos planos (número de plans, split de responsabilidades) baseada no que a pesquisa revelar

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirement
- `.planning/REQUIREMENTS.md` §LLM-PROV-02 — Requisito que esta fase entrega

### Feature Flag Pattern (replicar exato)
- `apps/desktop/src/main/store.ts` — `streamingTtsEnabled` getter/setter como template para o novo flag
- `apps/desktop/src/shared/ipc-types.ts` — `STREAMING_TTS_SET` / `STREAMING_TTS_CHANGED` como template para novos IPCs
- `apps/desktop/src/main/ipc/settings.ts` — Handler IPC para streaming TTS como template

### LLM Factory (ponto de implementação)
- `apps/backend-ts/src/llm/factory.ts` — Case `lmstudio` atual usa `ChatOpenAI` com `configuration.baseURL`
- `apps/backend-ts/src/llm/config.ts` — Zod schema para variáveis de ambiente do LM Studio

### Settings UI (ponto de integração)
- `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx` — Onde o toggle deve ser adicionado
- `apps/desktop/src/shared/ipc-types.ts` §StoreSchema — Onde o novo campo deve ser declarado

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `streamingTtsEnabled` pattern em `store.ts` (getters, setters, electron-store) — clonar para o novo flag
- `STREAMING_TTS_SET` / `STREAMING_TTS_CHANGED` IPC handlers em `ipc/settings.ts` — template direto
- `ChatOpenAI` com `configuration.baseURL` em `factory.ts` — ponto de modificação para Streaming Events

### Established Patterns
- Feature flag: `electron-store` + getter/setter + IPC broadcast multi-window + apply-sem-restart
- Fallback com `AbortController`: padrão Phase 54/55 para cancelar operações async in-flight
- Toggle sempre visível (sem conditional render por provider): mantém `LlmSection` simples

### Integration Points
- `factory.ts` case `lmstudio`: modificar ou subclassificar `ChatOpenAI` baseado no resultado da pesquisa
- `LlmSection.tsx`: adicionar toggle após a decisão de pesquisa
- `ipc-types.ts` `StoreSchema`: declarar novo campo booleano para o flag

</code_context>

<specifics>
## Specific Ideas

- O STATE.md já documenta: "Phase 60 starts with investigation (confirm if langchain-openai auto-optimizes or needs subclass) before implementation" — confirma que RESEARCH.md precede qualquer plano de implementação.

</specifics>

<deferred>
## Deferred Ideas

- Feedback de progresso de streaming por etapa (reasoning/message/tool) — já anotado como v2.4 em REQUIREMENTS.md
- Desativar automaticamente o toggle quando o provider não é LM Studio (render condicional) — possível polish futuro

</deferred>

---

*Phase: 60-lm-studio-streaming-events*
*Context gathered: 2026-05-07*
