# Phase 79: PC Control — App & File - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 79-pc-control-app-file
**Areas discussed:** Integration pattern, App resolution, Confirmation flow, Deps & file scope

---

## Integration Pattern

| Opção | Descrição | Selected |
|-------|-----------|----------|
| Hybrid (SSE + local execution) | LLM decide via gateway SSE (task:pc_action), client Python executa localmente. Reusa _post_task_resume para PCTRL-05. | ✓ |
| Local tool | Python client detecta intenção e executa sem gateway para essas ações. | |
| Gateway WS | Reusa action-dispatcher do Electron via WebSocket. Requer websocket-client no desktop-py. | |

**User's choice:** Hybrid (Recomendado)
**Notes:** Pesquisa apontou que _post_task_resume já está implementado em chat.py, tornando o hybrid o caminho de menor resistência para PCTRL-05.

---

## App Resolution

| Opção | Descrição | Selected |
|-------|-----------|----------|
| which() + name map | shutil.which() primário + dict de aliases por OS. Zero deps. | ✓ |
| which() somente | Só PATH lookup via stdlib. Falha para apps GUI no Windows. | |
| OS-native (registry/Spotlight) | Descobre qualquer app. Requer 3 implementações separadas. | |

**User's choice:** which() + name map (Recomendado)
**Notes:** Cobre 90% dos casos práticos (apps comuns do dev) sem deps novas.

---

## Confirmation Flow

| Opção | Descrição | Selected |
|-------|-----------|----------|
| threading.Event + voice queue poll | Helper _confirm_destructive() replicando padrão de chat_loop(). Windows-compatible. | ✓ |
| threading.Timer + input() bloqueante | Simples mas bloqueia thread principal — voice queue para de drenar. | |
| Rich Live countdown animado | Melhor UX mas conflita com live_paused() em ui.py. | |

**User's choice:** threading.Event + voice queue poll (Recomendado)
**Notes:** Padrão já validado em chat_loop() — get_nowait + loop não-bloqueante.

---

## Deps & File Scope

### Dependências

| Opção | Descrição | Selected |
|-------|-----------|----------|
| Só psutil | psutil>=6.0 adicionado. Cross-platform para PCTRL-02. | ✓ |
| Zero deps (stdlib) | subprocess + shutil + os + signal. PCTRL-02 requer branches OS-específicos. | |
| psutil + pyautogui | Adiciona os dois. pyautogui sem uso em Phase 79. | |

**User's choice:** Só psutil (Recomendado)

### Tamanho de arquivo (PCTRL-04)

| Opção | Descrição | Selected |
|-------|-----------|----------|
| Sem limite + truncagem | Lê o arquivo inteiro ou trunca se muito grande — head ~50 KB + aviso. | ✓ |
| 50 KB hard limit | Rejeita arquivos maiores com erro. | |
| 10 KB hard limit | Muito restritivo. | |

**User's choice:** Sem limite + truncagem
**Notes:** Usuário perguntou "como assim truncado?" — explicado que truncagem significa cortar o conteúdo quando muito grande para o contexto do LLM. Decidiu por head (primeiros ~50 KB) + aviso com tamanho total.

### Ponto de truncagem

| Opção | Descrição | Selected |
|-------|-----------|----------|
| Head + aviso | Primeiros ~50 KB + "arquivo cortado — tamanho total: X KB". | ✓ |
| Tail + aviso | Últimos ~50 KB. Melhor para logs. | |

**User's choice:** Head + aviso (Recomendado)

---

## Claude's Discretion

- Estrutura interna de pc_control.py (funções planas, padrão singleton como stt.py)
- Schema exato do SSE event task:pc_action no backend-ts
- Lista específica de aliases no name map por OS
- Tamanho exato do chunk de truncagem (~50 KB)
- Mecanismo de detecção de arquivo binário vs texto

## Deferred Ideas

- Mouse/keyboard automation (pyautogui) — defer para ScreenAnalyzer (v3.4)
- OS-native app discovery (registry/Spotlight/locate) — fase futura
- Tail read para logs — head é padrão por ora
- Configuração de whitelist via /config — v3.4+
- Brightness control — fora de v3.3
