# Phase 1: Foundation - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers a working text conversation loop in the terminal with a configurable multi-LLM backend abstraction. The user types a message, JARVIS responds using the configured LLM, and the conversation continues until the user exits. This phase also establishes the project structure, config system, and startup validation that every subsequent phase depends on.

**In scope:** CLI loop, multi-LLM factory (LM Studio / OpenAI / Anthropic), config via .env, startup banner + capability detection, dependency version validation, cross-platform module structure.

**Out of scope (future phases):** Memory/persistence (Phase 2), voice pipeline (Phase 3), PC control tools (Phase 4), advanced LLM routing (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Interface CLI
- **D-01:** Prompt de entrada estilizado com Rich — cor e formatação no prompt do usuário.
- **D-02:** Respostas do JARVIS em streaming token a token via `print(token, end='', flush=True)` — sem Rich no output de resposta (compatibilidade máxima com todos providers).
- **D-03:** Rich usado **apenas** no prompt de entrada e em mensagens de sistema (banner, status, erros) — nunca no stream de tokens.
- **D-04:** Saída da sessão por `Ctrl+C` ou digitando `exit` / `quit`.
- **D-05:** Sem suporte a input multi-linha na Fase 1 — linha única por mensagem.

### Config de Providers
- **D-06:** Formato `.env` + `python-dotenv`. Arquivo `.env` para segredos/config, `.env.example` commitado no repo como template.
- **D-07:** Provider selecionado via `LLM_PROVIDER=lmstudio|openai|anthropic` e modelo via `LLM_MODEL=nome-do-modelo` no `.env`.
- **D-08:** API keys no `.env`: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. `.env` no `.gitignore`.
- **D-09:** LM Studio configurável via `LM_STUDIO_URL` (default `http://localhost:1234/v1`) e `LM_STUDIO_MODEL`.

### Estrutura de Projeto
- **D-10:** Layout `src/jarvis/` com sub-pacotes. Estrutura base:
  ```
  src/
    jarvis/
      __init__.py
      __main__.py        # entry point: python -m jarvis
      core/              # loop de conversa, session
      llm/               # factory, providers, capabilities
      platform/          # abstração OS (linux, windows, macos)
      config.py          # settings via pydantic BaseSettings
  tests/
  .env.example
  pyproject.toml
  ```
- **D-11:** Entry point via `python -m jarvis` (`src/jarvis/__main__.py`). Instalável como `jarvis` command via `pyproject.toml`.
- **D-12:** Abstração multi-LLM em `src/jarvis/llm/` com `factory.py`, `providers.py`, `capabilities.py`.
- **D-13:** Código OS-específico em `src/jarvis/platform/` com `base.py` (interface comum), `linux.py`, `windows.py`, `macos.py`. Nunca `if sys.platform` espalhado pelo código principal.

### Comportamento de Startup
- **D-14:** Banner ASCII simples + bloco de status mostrando: provider ativo, modelo, capabilities detectadas (tool calling: yes/no, vision: yes/no, context window size).
- **D-15:** Erros de startup: mensagem clara em português com ação corretiva + `exit(1)`. Ex: `"ERRO: LM Studio não acessível em http://localhost:1234/v1. Verifique se está rodando."` Sem stack traces para o usuário.
- **D-16:** Detecção de capabilities via `/v1/models` + heurística por nome do modelo (ex: "vision" no nome → vision support). Sem probe real (sem chamada de teste ao LLM no startup).

### Claude's Discretion
- Implementação interna da `LLMFactory` (padrão strategy, factory method, etc.)
- Formato exato do banner ASCII
- Estrutura interna de `ChatSession` / loop principal
- Handling de reconexão automática ao LM Studio
- Logging interno (loguru vs stdlib logging)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Stack & Guidelines
- `CLAUDE.md` — Stack recomendado completo: versões de pacotes, padrões de integração LM Studio, regras multi-LLM, o que NÃO usar. **Leitura obrigatória antes de qualquer decisão técnica.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — Requirements mapeados para esta fase: CONV-01, LLM-01, LLM-02, ARCH-01, ARCH-03, ARCH-04. Critérios de aceitação de cada um.
- `.planning/ROADMAP.md` — Fase 1 success criteria (5 critérios verificáveis). Depedências entre fases.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum — projeto greenfield. Nenhum código existente.

### Established Patterns
- Nenhum padrão estabelecido ainda — esta fase define os padrões que as demais seguirão.

### Integration Points
- Esta fase cria os pontos de integração que as fases 2-5 vão usar: `LLMFactory`, `Platform`, `Settings`.

</code_context>

<specifics>
## Specific Ideas

- LM Studio já está rodando localmente no ambiente do usuário — a integração via `base_url` configurável é a abordagem nativa.
- Modelos locais variam (Llama, Mistral, Qwen, DeepSeek) — a arquitetura não pode assumir capabilities de um modelo específico, daí a detecção dinâmica via nome + `/v1/models`.
- `CLAUDE.md` específica `langchain-openai` para LM Studio E OpenAI cloud (mesmo import path, troca via config) — seguir esse padrão.

</specifics>

<deferred>
## Deferred Ideas

Nenhuma ideia fora de escopo surgiu durante a discussão.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-02*
