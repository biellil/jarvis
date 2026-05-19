# Phase 72: Python Infrastructure Setup - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffoldar `apps/desktop-py/` com toda a estrutura, tooling e config persistence necessários para o cliente Python funcionar. Esta fase entrega o ambiente — fases 73-77 entregam as features em cima dele.

**O que está no escopo:** pyproject.toml, uv, estrutura de pastas, integração pnpm, ~/.jarvis/config.json, entry point mínimo com health check.
**O que NÃO está:** chat, STT, TTS, voice modes, UI (fases 73-77).

</domain>

<decisions>
## Implementation Decisions

### Estrutura de Pastas
- **D-01:** Usar **src layout** — `apps/desktop-py/src/jarvis_desktop/`
- **D-02:** Nome do pacote Python: **`jarvis_desktop`** (consistente com `@jarvis/*` do workspace)
- **D-03:** Entry point via `__main__.py` em `src/jarvis_desktop/__main__.py`

### Integração pnpm
- **D-04:** `apps/desktop-py/` tem seu próprio **`package.json`** com `{"scripts": {"dev": "uv run python -m jarvis_desktop"}}`
- **D-05:** Root `package.json` adiciona: `"dev:desktop-py": "pnpm --filter @jarvis/desktop-py dev"`
- **D-06:** O package name no `package.json` de `apps/desktop-py/` deve ser **`@jarvis/desktop-py`** para seguir o padrão do workspace

### Config Persistence (PYSETUP-04)
- **D-07:** Schema **completo com defaults** definido na Phase 72 — fases seguintes leem, não redefinem schema
- **D-08:** Campos e defaults:
  ```json
  {
    "gateway_url": "http://localhost:3000",
    "whisper_model": "tiny",
    "tts_provider": "kokoro",
    "voice_mode": "ptt"
  }
  ```
- **D-09:** Config persiste em `~/.jarvis/config.json` — criado automaticamente se não existir

### Entry Point (comportamento na Phase 72)
- **D-10:** Quando `pnpm dev:desktop-py` roda, o app:
  1. Carrega e exibe config (`~/.jarvis/config.json`)
  2. Faz `GET /health` no gateway
  3. Exibe status: `Gateway: ✔ online` ou `Gateway: ✖ offline (retrying in next phase)`
  4. Aguarda Ctrl+C (não encerra sozinho)
- **D-11:** Sem crash se gateway estiver offline — reporta status e continua rodando

### Python Version
- **D-12:** `requires-python = ">=3.12"` no pyproject.toml

### .env / .gitignore
- **D-13:** `.gitignore` já tem as entradas Python necessárias (`__pycache__/`, `.venv/`, `.pytest_cache/`) — verificar e complementar se faltar `venv/` (o REQUIREMENTS menciona `venv/`)
- **D-14:** `.env` e `.env.example` recebem `GATEWAY_URL=http://localhost:3000` (alinhado com PYSETUP-03)

### Claude's Discretion
- Estrutura interna dos módulos além do entry point (ex: `config.py`, `health.py` dentro de `jarvis_desktop/`)
- Mecanismo de save/load do config (json stdlib ou pydantic-settings)
- Formatação do output terminal (print simples ou rich já aqui)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack e decisões de tecnologia
- `CLAUDE.md` §Technology Stack — versões pinadas de todas as libs, padrões multiplataforma
- `CLAUDE.md` §What NOT to Use — lista de libs proibidas
- `CLAUDE.md` §Cross-Platform Audio Notes — notas de compat Windows/Linux/macOS

### Requirements
- `.planning/REQUIREMENTS.md` §PYSETUP-01 a PYSETUP-04 — critérios de aceite desta fase

### Estrutura existente do workspace
- `package.json` (root) — padrão dos scripts pnpm e filtros de workspace
- `pnpm-workspace.yaml` — confirma que `apps/*` está no workspace
- `.gitignore` (root) — entradas Python existentes que podem precisar de complemento
- `.env.example` — padrão de variáveis de ambiente do projeto

### Gateway (o que o entry point acessa)
- `apps/gateway/package.json` — confirma que gateway roda em `GATEWAY_PORT=3000`

### Sem specs externos adicionais
- Nenhum ADR externo referenciado. Requirements completamente capturados nas decisões acima.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/gateway/` — o gateway Express já existe e roda em localhost:3000; o entry point fará health check nele
- `.env.example` — já tem `GATEWAY_PORT=3000` e `BACKEND_TS_URL`; o Python client lerá `GATEWAY_URL` do `.env`

### Established Patterns
- **pnpm workspace:** todos os apps têm `package.json` próprio com `@jarvis/<name>` e scripts `dev`/`build`. `apps/desktop-py/` deve seguir o mesmo padrão.
- **Scripts no root:** `"dev:backend": "pnpm --filter @jarvis/backend-ts dev"` — padrão a replicar para `dev:desktop-py`
- **`.env` loading:** apps existentes usam `--env-file=../../.env` via Node. O Python client deve ler o mesmo `.env` da raiz (via `python-dotenv` com path relativo ou `GATEWAY_URL` como env var)

### Integration Points
- `apps/desktop-py/` entra no workspace automaticamente (pnpm-workspace.yaml cobre `apps/*`)
- O health check do entry point acessa `GET http://localhost:3000/health` — endpoint que já existe no gateway
- `~/.jarvis/config.json` é separado do `.env` — `.env` tem segredos (API keys), config.json tem preferências do usuário

</code_context>

<specifics>
## Specific Ideas

- O entry point na Phase 72 serve como smoke test de infraestrutura — se roda e mostra "Gateway: ✔ online", o ambiente está pronto para as fases seguintes
- Usar `uv run python -m jarvis_desktop` (não `uv run jarvis-desktop`) para manter simplicidade — evita configurar `[project.scripts]` agora

</specifics>

<deferred>
## Deferred Ideas

None — discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 72-python-infrastructure-setup*
*Context gathered: 2026-05-18*
