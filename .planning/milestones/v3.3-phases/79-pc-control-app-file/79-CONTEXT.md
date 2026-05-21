# Phase 79: PC Control — App & File - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

JARVIS abre/fecha aplicativos, abre pastas no explorador nativo, lê conteúdo de arquivos de texto dentro de whitelist, e executa ações destrutivas (deletar/mover/renomear) somente com confirmação explícita. Toda ação é auditada em `~/.jarvis/audit.json`.

**No escopo:** PCTRL-01 (abrir app), PCTRL-02 (fechar app), PCTRL-03 (abrir pasta), PCTRL-04 (ler arquivo de texto), PCTRL-05 (confirmação destrutiva 10s), PCTRL-06 (audit log).
**Fora do escopo:** Volume/mídia (Phase 80), wake word (Phase 81), mouse/keyboard automation, screenshot/screen analysis.

</domain>

<decisions>
## Implementation Decisions

### Integration Pattern
- **D-01:** PC Control usa padrão **Hybrid** — o LLM (no gateway/backend-ts) decide via um novo SSE event type (`task:pc_action`), e o Python client executa localmente em um novo módulo `pc_control.py`. Reusa o canal SSE existente sem novo transport (sem WebSocket no desktop-py).
- **D-02:** Confirmação destrutiva (PCTRL-05) reusa o padrão `task:awaiting-confirmation` + `/api/tasks/:taskId/resume` já implementado em `chat.py._post_task_resume()`. Gateway emite `task:awaiting-confirmation` antes de executar ação destrutiva; client aguarda resposta ou timeout de 10s.
- **D-03:** Audit log (`~/.jarvis/audit.json`) escrito localmente pelo `pc_control.py` do client — append-only JSON, não SQLite. Mantém PC Control self-contained sem escrita de rede.

### App Resolution
- **D-04:** App resolution usa abordagem **layered**: `shutil.which()` como lookup primário + dict de aliases por OS como fallback. Aliases cobrem apps GUI comuns (chrome, vscode, slack, explorer, finder, etc.) que não estão no PATH no Windows/macOS. Zero deps novas para esta lógica.
- **D-05:** Fechar app (PCTRL-02) usa `psutil.process_iter()` + `proc.kill()` — API idêntica em Windows/Linux/macOS sem branches OS-específicos. psutil é adicionado como dep.

### Confirmation Flow (PCTRL-05)
- **D-06:** Helper `_confirm_destructive(prompt, timeout=10)` implementado em `chat.py` (ou `pc_control.py`). Loop de polling com `threading.Event`: drena voice queue antes de armar timer, faz `get_nowait()` a cada 0.1s, aceita "sim"/"yes"/"confirmar" da queue de voz ou do teclado. Sem resposta em 10s → retorna `False` e ação é abortada.
- **D-07:** TTS fala o pedido de confirmação antes de iniciar o countdown (ex: "Confirmar deletar arquivo.txt? Diga 'sim' ou pressione Enter em 10 segundos.").

### Whitelist & File Scope
- **D-08:** Whitelist de diretórios para PCTRL-04: home (`~`), `~/Documents`, `~/Downloads`, `~/Desktop`. Paths fora da whitelist retornam erro sem execução.
- **D-09:** Leitura de arquivo (PCTRL-04): sem limite de tamanho rígido, mas arquivos grandes são truncados nos primeiros ~50 KB com aviso explícito ("arquivo cortado — tamanho total: X KB"). Mostra início do arquivo (head), não tail.
- **D-10:** Tipos de arquivo permitidos: qualquer extensão com conteúdo decodificável como UTF-8 ou Latin-1. Binários que falham no decode retornam erro descritivo sem crash.

### Dependencies
- **D-11:** Adicionar `psutil>=6.0` ao `pyproject.toml` (apenas dep nova para esta phase). `pyautogui` **não** é adicionado — sem uso em PCTRL-01..06; defer para quando ScreenAnalyzer for planejado.
- **D-12:** Imports OS-específicos (`pywin32`, `python-xlib`, `pyobjc`) ficam lazy atrás de `TYPE_CHECKING` guard — nunca importados no OS errado.

### Audit Log (PCTRL-06)
- **D-13:** Formato do entry em `~/.jarvis/audit.json`: JSON Lines (um objeto JSON por linha), append-only. Campos obrigatórios: `timestamp` (ISO 8601), `action` (string tipo: "open_app", "close_app", "open_folder", "read_file", "delete_file", "move_file", "rename_file"), `params` (dict com args da ação), `result` ("ok" | "error" | "aborted"), `error` (string opcional, presente quando result="error").

### Claude's Discretion
- Estrutura interna de `pc_control.py` (classes vs funções planas — seguir padrão de módulo plano com singleton state como stt.py/tts.py)
- Schema exato do SSE event `task:pc_action` no backend-ts (campos: action, params)
- Aliases específicos no name map (lista de apps comuns por OS)
- Tamanho exato do chunk de truncagem (recomendado: 50 KB = 51200 bytes)
- Mecanismo de detecção de tipo MIME/binário vs texto (chardet vs tentativa de decode)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos desta phase
- `.planning/REQUIREMENTS.md` §PC Control Python — PCTRL-01..PCTRL-06 (requisitos completos com critérios)
- `.planning/ROADMAP.md` §Phase 79 — Success Criteria (6 critérios de aceitação)

### Arquitetura e padrões do client Python
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `_handle_agentic_event()`, `_post_task_resume()`, `chat_loop()` (padrão SSE handling + confirmação + voice queue polling)
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig` (adicionar campos de whitelist e pc_control toggle se necessário)
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — ponto de wiring de novos módulos

### Tech stack e deps
- `CLAUDE.md` §Technology Stack — psutil 6.x, pyautogui, PyWinCtl (referência de quando usar cada lib)
- `CLAUDE.md` §PC Control (Platform-Specific Backends) — tabela completa de libs por OS
- `CLAUDE.md` §Cross-Platform Audio Notes — padrão de lazy imports para libs OS-específicas
- `apps/desktop-py/pyproject.toml` — deps atuais (adicionar psutil>=6.0)

### Padrões de módulo anteriores (referência de estilo)
- `.planning/phases/78-voice-reliability-config/78-CONTEXT.md` — D-04: threading.Lock + atomic write; D-06: lazy platform imports
- `apps/desktop-py/src/jarvis_desktop/stt.py` — padrão singleton com module-level state
- `apps/desktop-py/src/jarvis_desktop/tts.py` — try/finally no set_state, padrão de fallback chain

### Backend-ts (gateway) — para o SSE event novo
- `apps/backend-ts/` — onde o LangGraph tool `pc_control` precisa ser adicionado para emitir `task:pc_action` SSE event

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `chat.py:_post_task_resume()` (linha ~151): já implementado para enviar confirmação ao gateway — reutilizar para PCTRL-05 confirmation flow
- `chat.py:_handle_agentic_event()` (linha ~171): adicionar branch para `task:pc_action` event type
- `chat.py:chat_loop()` (linha ~346): padrão `get_nowait() + input()` para polling de voice queue — replicar em `_confirm_destructive()`
- `config.py:JarvisConfig`: adicionar campos de whitelist se configurável pelo usuário (ex: `pc_whitelist_dirs: list[str]`)
- `ui.py`: `set_state()` disponível para mostrar estado "executing_pc_action" durante execução

### Established Patterns
- Módulo plano com singleton state (sem classes): seguir para `pc_control.py`
- `threading.Lock` no nível do módulo: replicar para operações de arquivo concorrentes
- `console.print()` via `_console()` helper (lazy import): usar em `pc_control.py` para evitar circular import
- `try/finally` em operações de I/O para garantir cleanup (padrão de `tts.py`)

### Integration Points
- `__main__.py`: `init_pc_control(config)` como novo Step (após Step 5 `init_voice_modes`)
- `chat.py:_handle_agentic_event()`: novo branch `elif event_type == "task:pc_action": _execute_pc_action(payload, config)`
- `apps/backend-ts/`: novo LangGraph tool que emite `task:pc_action` com action + params como payload SSE
- `apps/desktop-py/pyproject.toml`: adicionar `psutil>=6.0` nas dependencies

</code_context>

<specifics>
## Specific Ideas

- Truncagem de arquivo usa **head** (primeiros ~50 KB) com mensagem explícita do tamanho total — usuário pode pedir range específico se precisar de outra parte.
- `_confirm_destructive()` drena a voice queue de utterances antigas **antes** de armar o timer para evitar falso positivo de utterance não-relacionada.
- Name map de apps deve incluir aliases comuns em pt-BR (ex: "explorador" → Windows Explorer, "navegador" → browser padrão).

</specifics>

<deferred>
## Deferred Ideas

- **Mouse/keyboard automation** (pyautogui) — sem uso em PCTRL-01..06; defer para quando ScreenAnalyzer (v3.4) for planejado
- **OS-native app discovery** (registry/Spotlight/locate) — fase futura quando descoberta arbitrária de apps for necessária; Phase 79 cobre apenas apps comuns via name map
- **Tail read de logs** — head é padrão; tail útil para logs grandes mas escopo futuro
- **Configuração de whitelist via `/config`** — PCTRL-04 tem whitelist fixa (home/Documents/Downloads/Desktop); expandir via UI é v3.4+
- **Brightness control** — CLAUDE.md menciona `screen-brightness-control`; fora de v3.3 (REQUIREMENTS.md §Future Requirements)

</deferred>

---

*Phase: 79-pc-control-app-file*
*Context gathered: 2026-05-21*
