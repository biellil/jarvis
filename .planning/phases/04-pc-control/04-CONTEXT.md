# Phase 4: PC Control - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar ferramentas de controle de PC expostas ao LLM via @tool decorator do LangChain. O agente ReAct decide quando chamar com base na linguagem natural do usuário.

**Arquitetura alvo (implementar já nesta phase):**

```
UI/UX → texto natural + {os: "linux"} → LangChain server
         LLM processa → texto de resposta + {action: "open_app", args: {...}}
UI/UX recebe ← texto para exibir + payload de ação estruturado
UI/UX executa a ação localmente (tem as libs do OS correto)
```

As `@tool` functions **não executam** a ação — elas **retornam** um payload estruturado (dict com `action` + `args`). Quem executa é o executor local (hoje `__main__.py`; no futuro o cliente UI/UX).

Isso significa que as tools são OS-agnósticas no servidor. O OS é passado como parâmetro ou contexto — o executor local decide como realizar a ação.

</domain>

<decisions>
## Implementation Decisions

### D-01: Escopo de plataforma — Linux only (executor)
O executor local que roda os payloads implementa apenas Linux. Windows e macOS ficam para depois. As `@tool` functions em si são OS-agnósticas — recebem/retornam dicts, não executam subprocess.

### D-02: Tools retornam payloads, não executam
As `@tool` functions retornam um dict estruturado. O executor local (`__main__.py` no MVP, cliente UI no futuro) é quem chama subprocess/psutil/pactl.

```python
# Padrão correto:
@tool
def open_app(app_name: str) -> dict:
    """Abre um aplicativo pelo nome."""
    return {"action": "open_app", "args": {"app": app_name}}

# Executor local interpreta e executa:
# {"action": "open_app", "args": {"app": "firefox"}} → subprocess.run(["firefox"])
```

O `__main__.py` precisa de um `ActionExecutor` que mapeia payloads para chamadas de sistema Linux.

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
- Estrutura do `ActionExecutor` (pode ser dict de handlers, switch, ou classe)
- Implementação Linux de `open_app` (via `subprocess.run`, `xdg-open`, ou `psutil`)
- Implementação Linux de file operations (`pathlib`, `shutil`)
- Implementação Linux de system control — volume via `pactl`, brilho via `brightnessctl`
- Como o `ActionExecutor` aguarda confirmação para ações destrutivas
- Estrutura de módulos: `src/jarvis/tools/` para @tools, `src/jarvis/executor/` para ActionExecutor

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

- Fluxo completo: UI/UX envia texto + OS → LangChain/LLM retorna texto + payload de ação → UI/UX executa localmente. Phase 4 implementa a parte do LangChain (tools que geram payloads) + executor local Linux (que interpreta e executa).
- Volume no Linux: `pactl set-sink-volume @DEFAULT_SINK@ 50%`
- Brilho no Linux: `brightnessctl set 50%` ou escrita direta em `/sys/class/backlight/`

</specifics>

<deferred>
## Deferred Ideas

- Windows backend (pywin32) — pós-MVP
- macOS backend (pyobjc) — pós-MVP
- Cliente UI/UX real (substitui o executor local do __main__.py) — milestone futuro
- Windows/macOS no ActionExecutor — pós-MVP

</deferred>

---

*Phase: 04-pc-control*
*Context gathered: 2026-04-05 via /gsd:discuss-phase*
