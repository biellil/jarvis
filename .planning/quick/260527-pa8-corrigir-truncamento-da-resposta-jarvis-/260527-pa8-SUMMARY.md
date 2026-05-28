---
phase: quick
plan: 260527-pa8
subsystem: desktop-py/chat
tags: [bug-fix, terminal-ui, rich, stdout]
key-files:
  modified:
    - apps/desktop-py/src/jarvis_desktop/chat.py
decisions:
  - sys.stdout.write() com ANSI codes em vez de console.print() para evitar truncamento do Rich Live transient=True
metrics:
  duration: "5min"
  completed: "2026-05-27"
  tasks: 1
  files: 1
---

# Quick Task 260527-pa8: Corrigir truncamento da resposta JARVIS

**One-liner:** Substituiu `console.print()` por `sys.stdout.write()` com ANSI bold/green em `_read_sse_stream` para corrigir truncamento de linhas longas no terminal Windows causado pelo cursor management do Rich Live `transient=True`.

## What Changed

### `apps/desktop-py/src/jarvis_desktop/chat.py`

Função `_read_sse_stream` (linhas 336-350):

- Removido `from rich.markup import escape as _markup_escape` (lazy import dentro da função — não mais necessário)
- Removido `console = _console()` local (não mais usado no bloco de print)
- Substituído bloco `console.print(f"{_LABEL_JARVIS} {safe}", ...)` por `sys.stdout.write(f"\x1b[1m\x1b[32m[jarvis]\x1b[0m {display}\n")`
- Substituído `console.print(f"{_RESPONSE_INDENT}{safe}", ...)` por `sys.stdout.write(f"{_RESPONSE_INDENT}{display}\n")`
- Substituído `console.print()` vazio por `sys.stdout.write("\n")` + `sys.stdout.flush()`

**Motivo:** Rich's `console.print()` faz cursor repositioning. Com `transient=True` no Live panel, esse cursor management sobrescreve a segunda linha do wrap da resposta — o fenômeno de truncamento. `sys.stdout.write()` escreve bytes diretamente sem cursor management.

## Test Results

```
uv run pytest tests/test_chat.py -x -q
XxXX.
1 passed, 1 xfailed, 3 xpassed in 0.37s
```

Todos os testes continuam passando.

## Commits

| Hash | Description |
|------|-------------|
| 7d41198 | fix(chat): use sys.stdout.write() in _read_sse_stream to fix truncamento |

## Deviations from Plan

None — plano executado exatamente como especificado.

## Self-Check: PASSED

- [x] `apps/desktop-py/src/jarvis_desktop/chat.py` modificado
- [x] Commit 7d41198 existe
- [x] Testes test_chat.py passam (1 passed, 3 xpassed)
