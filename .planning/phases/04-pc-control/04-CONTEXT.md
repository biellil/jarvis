# Phase 4: PC Control - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar ferramentas de controle de PC expostas ao LLM via @tool decorator do LangChain. O agente ReAct decide quando chamar cada tool com base na linguagem natural do usuário. MVP executa localmente no Linux onde o JARVIS roda.

**Arquitetura futura (não implementar agora):** LangChain num servidor Linux enviando comandos para um cliente UI/UX que executa no PC do usuário. Phase 4 não precisa antecipar essa separação — Linux local é suficiente.

</domain>

<decisions>
## Implementation Decisions

### D-01: Escopo de plataforma — Linux only
MVP implementa apenas LinuxPlatform. Windows e macOS ficam com `NotImplementedError`. A separação servidor/UI é visão futura, não muda o escopo desta phase.

### D-02: Integração com LLM — @tool decorator LangChain
Cada ferramenta é um `@tool` do LangChain. O agente ReAct decide quando chamar. O usuário fala naturalmente ("abre o Spotify") e o LLM invoca `open_app("spotify")`. Mesmo padrão das fases anteriores.

### D-03: Confirmação de ações destrutivas — via mensagem natural
JARVIS pergunta ao usuário em linguagem natural ("Vou deletar X. Pode prosseguir?") e aguarda resposta afirmativa antes de executar. Ações destrutivas que requerem confirmação:
- **Deletar arquivo** (`os.remove`, `shutil.rmtree`)
- **Matar processo** (`psutil.kill()`, `psutil.terminate()`)

Mover arquivos e fechar apps **não** requerem confirmação.

### D-04: Log auditável — tabela dedicada `tool_calls`
Nova tabela SQLite separada da conversa. Schema mínimo:
```sql
CREATE TABLE tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    params_json TEXT,
    outcome TEXT,  -- 'success' | 'error' | 'cancelled'
    error TEXT
);
```
Toda chamada de tool (bem-sucedida, com erro ou cancelada pelo usuário) é registrada.

### Claude's Discretion
- Implementação interna de `open_app` no Linux (via subprocess/psutil)
- Implementação de file operations (usar `pathlib` e `shutil` da stdlib)
- Implementação de system control — volume via `pactl`, brilho via `brightnessctl` ou sysfs
- Como o agente aguarda a confirmação do usuário (pode usar o loop de input existente em `__main__.py`)
- Estrutura de módulos dentro de `src/jarvis/tools/`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Plataforma existente
- `src/jarvis/platform/base.py` — AbstractPlatform ABC com `get_os_name()` — Phase 4 adiciona métodos aqui
- `src/jarvis/platform/linux.py` — LinuxPlatform — implementar métodos de PC control aqui
- `src/jarvis/platform/__init__.py` — get_platform() factory — não mudar a interface

### Padrões do projeto
- `src/jarvis/core/session.py` — ChatSession.send() — onde as tools são registradas no agente
- `src/jarvis/config.py` — Settings singleton — adicionar configs novas aqui (ex: tool_log_enabled)
- `./CLAUDE.md` — Convenções do projeto (stack, multi-LLM, async, privacidade)

### Requisitos
- `.planning/REQUIREMENTS.md` — TOOL-01 a TOOL-05 (todos desta phase)

</canonical_refs>

<specifics>
## Specific Ideas

- Visão de longo prazo: LangChain em servidor Linux → UI/UX no PC do usuário executa os comandos. Phase 4 não implementa isso — apenas base local.
- Volume no Linux: `pactl set-sink-volume @DEFAULT_SINK@ 50%`
- Brilho no Linux: `brightnessctl set 50%` ou escrita direta em `/sys/class/backlight/`

</specifics>

<deferred>
## Deferred Ideas

- Windows backend (pywin32) — pós-MVP
- macOS backend (pyobjc) — pós-MVP
- Arquitetura servidor/cliente (UI remota) — milestone futuro

</deferred>

---

*Phase: 04-pc-control*
*Context gathered: 2026-04-05 via /gsd:discuss-phase*
