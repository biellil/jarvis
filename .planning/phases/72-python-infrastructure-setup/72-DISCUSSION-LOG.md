# Phase 72: Python Infrastructure Setup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-05-18
**Phase:** 72-python-infrastructure-setup
**Areas discussed:** Estrutura de pastas, Integração pnpm, Schema do config, Comportamento do entry point

---

## Estrutura de Pastas

| Option | Description | Selected |
|--------|-------------|----------|
| src layout | `src/jarvis_desktop/` — padrão moderno, evita colisões de import | ✓ |
| Flat na raiz | `main.py` + módulos na raiz — mais simples mas fica bagunçado | |
| Flat com pasta core/ | `main.py` + `core/` — meio-termo | |

**User's choice:** src layout
**Notes:** Nome do pacote: `jarvis_desktop` (padrão `@jarvis/*`)

---

## Integração pnpm

| Option | Description | Selected |
|--------|-------------|----------|
| package.json em apps/desktop-py/ | Próprio package.json com script dev, segue padrão do workspace | ✓ |
| Script no root apenas | `cd apps/desktop-py && uv run ...` no root package.json | |
| Script shell separado | `scripts/dev-desktop-py.sh` | |

**User's choice:** `package.json` em `apps/desktop-py/` com `@jarvis/desktop-py`

| Comando | Description | Selected |
|---------|-------------|----------|
| `uv run python -m jarvis_desktop` | Via módulo Python, requer `__main__.py` | ✓ |
| `uv run jarvis-desktop` | Via entry point no pyproject.toml | |
| `uv run python src/jarvis_desktop/main.py` | Path explícito | |

**Notes:** Evita configurar `[project.scripts]` na Phase 72 — mais simples.

---

## Schema do Config

| Option | Description | Selected |
|--------|-------------|----------|
| Schema completo com defaults | Todos os campos agora; fases seguintes só leem | ✓ |
| Stub mínimo | Só gateway_url agora; campos adicionados nas fases deles | |

**Defaults escolhidos:**
```json
{
  "gateway_url": "http://localhost:3000",
  "whisper_model": "tiny",
  "tts_provider": "kokoro",
  "voice_mode": "ptt"
}
```

**Notes:** `tiny` escolhido para default conservador (22MB vs 1.5GB do large).

---

## Comportamento do Entry Point

| Option | Description | Selected |
|--------|-------------|----------|
| Versão + config + aguarda Ctrl+C | Mostra config, sem conexão ao gateway | |
| Health check + status | Mostra config + faz GET /health no gateway | ✓ |
| Só sobe e sai (exit 0) | Smoke test via exit code | |

**User's choice:** Health check — valida integração já na Phase 72

| Python version | Description | Selected |
|----------------|-------------|----------|
| >=3.12 | CLAUDE.md preferred, mais rápido | ✓ |
| >=3.10 | Mínimo do CLAUDE.md | |
| >=3.11 | Meio-termo | |

---

## Claude's Discretion

- Estrutura interna dos módulos (ex: `config.py`, `health.py`)
- Mecanismo de save/load do config (json stdlib ou pydantic-settings)
- Formatação do output terminal

## Deferred Ideas

Nenhuma — discussão ficou dentro do escopo da fase.
