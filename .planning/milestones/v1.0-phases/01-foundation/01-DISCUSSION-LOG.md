# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 01-foundation
**Areas discussed:** Interface CLI, Config de providers, Estrutura de projeto, Comportamento de startup

---

## Interface CLI

| Option | Description | Selected |
|--------|-------------|----------|
| Simples: "Você: " | Texto puro, direto ao ponto | |
| Com Rich: prompt estilizado + cor | Usa Rich para colorir o prompt e respostas | ✓ |
| JARVIS> (estilo shell) | Prompt estilo shell clássico | |

**User's choice:** Com Rich: prompt estilizado + cor

---

| Option | Description | Selected |
|--------|-------------|----------|
| Rich Markdown | Respostas em Markdown renderizado | |
| Texto puro simples | Sem formatação | |
| Streaming com cursor | Tokens aparecem em tempo real | ✓ |

**User's choice:** Streaming com cursor

**Follow-up — Como combinar Rich + streaming:**

| Option | Description | Selected |
|--------|-------------|----------|
| Streaming plain text + Rich só no prompt | Tokens em texto puro, prompt estilizado com Rich | ✓ |
| Live display do Rich para streaming | Rich Live context manager | |
| Streaming simples com flush | print(token, end='', flush=True), sem Rich no output | |

**User's choice:** Streaming plain text + Rich só no prompt
**Notes:** Rich e streaming token-a-token têm incompatibilidades — separar os domínios é mais robusto.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Ctrl+C ou 'exit'/'quit' | Padrão de CLIs | ✓ |
| Apenas Ctrl+C | Só interrupção de sinal | |
| /exit ou /quit | Comandos com prefixo / | |

**User's choice:** Ctrl+C ou 'exit'/'quit'

---

| Option | Description | Selected |
|--------|-------------|----------|
| Não por agora | Input de linha única por enquanto | ✓ |
| Sim — bloco entre ``` | Delimitador para multi-linha | |
| Sim — Shift+Enter | Requer prompt_toolkit | |

**User's choice:** Não por agora

---

## Config de providers

| Option | Description | Selected |
|--------|-------------|----------|
| .env + python-dotenv | Par de .env + .env.example | ✓ |
| config.toml | TOML estruturado | |
| config.yaml | YAML | |

**User's choice:** .env + python-dotenv

---

| Option | Description | Selected |
|--------|-------------|----------|
| LLM_PROVIDER + LLM_MODEL | Duas variáveis de env | ✓ |
| Perfis nomeados no config | [profiles.local], [profiles.cloud] | |
| Flag na linha de comando | --provider --model args | |

**User's choice:** LLM_PROVIDER + LLM_MODEL

---

| Option | Description | Selected |
|--------|-------------|----------|
| No .env (OPENAI_API_KEY, ANTHROPIC_API_KEY) | Padrão de mercado | ✓ |
| Variáveis de ambiente do sistema | Export no shell profile | |
| Arquivo separado secrets.env | Secrets separados do config | |

**User's choice:** No .env

---

| Option | Description | Selected |
|--------|-------------|----------|
| LM_STUDIO_URL + LM_STUDIO_MODEL | URL base + modelo | ✓ |
| URL + modelo + timeout + max_retries | Config mais completa | |
| Só a URL (modelo autodetectado) | Autodetect via /v1/models | |

**User's choice:** LM_STUDIO_URL + LM_STUDIO_MODEL

---

## Estrutura de projeto

| Option | Description | Selected |
|--------|-------------|----------|
| src/jarvis/ com sub-pacotes | Layout padrão Python | ✓ |
| jarvis/ flat na raiz | Mais simples | |
| Modular por feature | Estilo DDD | |

**User's choice:** src/jarvis/ com sub-pacotes

---

| Option | Description | Selected |
|--------|-------------|----------|
| python -m jarvis | src/jarvis/__main__.py | ✓ |
| python main.py na raiz | Arquivo main.py | |
| python run.py ou start.py | Script dedicado | |

**User's choice:** python -m jarvis

---

| Option | Description | Selected |
|--------|-------------|----------|
| src/jarvis/llm/ (sub-pacote dedicado) | factory.py, providers.py, capabilities.py | ✓ |
| src/jarvis/core/llm.py | Dentro do core | |
| src/jarvis/providers/ (um arquivo por provider) | providers/lmstudio.py, etc. | |

**User's choice:** src/jarvis/llm/ (sub-pacote dedicado)

---

| Option | Description | Selected |
|--------|-------------|----------|
| src/jarvis/platform/ com interface comum | base.py + linux/windows/macos | ✓ |
| if sys.platform inline | Condicional espalhado | |
| Só Linux por enquanto | Adiar abstração | |

**User's choice:** src/jarvis/platform/ com interface comum

---

## Comportamento de startup

| Option | Description | Selected |
|--------|-------------|----------|
| Banner + status do LLM | Arte ASCII + provider/modelo/capabilities | ✓ |
| Só uma linha de status | Mínimo e limpo | |
| Nada no startup | Silencioso | |

**User's choice:** Banner + status do LLM

---

| Option | Description | Selected |
|--------|-------------|----------|
| Mensagem clara + ação corretiva + exit(1) | Falha rápida com orientação | ✓ |
| Stack trace Python completo | Debug-friendly | |
| Modo degradado com aviso | Inicia mesmo com LLM inacessível | |

**User's choice:** Mensagem clara + ação corretiva + exit(1)

---

| Option | Description | Selected |
|--------|-------------|----------|
| /v1/models + heurística por nome | Detecção por nome do modelo | ✓ |
| Probe real: envia tool call de teste | Mais preciso mas adiciona latência | |
| Config manual no .env | Usuário declara capabilities | |

**User's choice:** /v1/models + heurística por nome do modelo
