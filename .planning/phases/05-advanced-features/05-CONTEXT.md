# Phase 5: Advanced Features - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 adiciona duas capacidades distintas ao JARVIS:

1. **Análise de tela (Vision)**: JARVIS captura ou recebe um screenshot e o envia ao LLM para análise. O LLM descreve o que vê, extrai texto, interpreta erros ou UI. Inclui fallback para OCR (pytesseract) quando o modelo não tem vision, e fallback para cloud com vision (Anthropic Claude ou OpenAI GPT-4V) quando necessário.

2. **Roteamento inteligente de LLM**: JARVIS detecta as capacidades do modelo ativo e roteia automaticamente — tarefas de visão vão para modelos com vision, tarefas simples para modelos locais mais rápidos. Troca de modelo sem reiniciar (hot-reload).

**Arquitetura alvo (cliente-servidor):**
```
UI/UX client     →  captura screenshot localmente
                 →  envia imagem (bytes/base64) para API Python
API Python       →  converte para base64 se necessário
                 →  passa para LangChain/ChatSession.send(image=...)
                 →  LLM com vision analisa e retorna resposta em texto

Para o MVP CLI (sem UI separada):
__main__.py      →  captura via pyautogui.screenshot()
                 →  converte PIL Image → base64
                 →  passa para ChatSession.send(image=base64_str)
```

</domain>

<decisions>
## Implementation Decisions

### D-01: Arquitetura da pipeline de visão
A tool `analyze_screen` é uma `@tool` LangChain que captura o screenshot (via pyautogui no MVP CLI), converte para base64, e retorna os dados. `ChatSession.send()` detecta o resultado do tool call e inclui a imagem no segundo call ao LLM (HumanMessage com content do tipo `image_url`).

**Não segue D-02 (payload)**: visão é um caso especial — a imagem precisa fluir para o LLM, não para um executor de sistema. O ToolMessage retorna a imagem como dado, não como instrução de ação.

### D-02: Captura de screenshot no MVP CLI
No MVP CLI (sem cliente UI separado), o `__main__.py` captura o screenshot via `pyautogui.screenshot()`. Quando o cliente UI/UX vier, ele substitui esta captura — a API já aceita `image=` como parâmetro opcional em `ChatSession.send()`.

### D-03: Invocação da análise de tela — dupla
Dois caminhos, ambos suportados:

1. **Linguagem natural**: LLM detecta intenção ("o que está na minha tela?", "que erro é esse?") e chama `analyze_screen` como @tool. `ChatSession.send()` já tem o loop de tool-calling (Phase 4) — funciona automaticamente.

2. **Comando explícito `/screenshot`**: `__main__.py` intercepta a entrada, captura screenshot com pyautogui, e injeta a imagem diretamente no `ChatSession.send(image=base64_str)` junto com o texto do usuário. O LLM recebe a imagem e responde sem precisar chamar uma @tool.

### D-04: Fallback de visão — Claude's Discretion
Cadeia de fallback quando o modelo ativo não tem vision:
1. Tentar OCR via pytesseract (extrai texto do screenshot, passa como texto ao LLM)
2. Se OCR não instalado ou falhar, tentar cloud com vision (Anthropic ou OpenAI conforme configurado)
3. Se nenhum disponível, informar ao usuário com mensagem clara

A lógica de roteamento usa `detect_capabilities()` (já existente em `llm/capabilities.py`) para verificar `caps.vision` antes de tentar enviar imagem.

### D-05: Hot-reload de modelo — Claude's Discretion
Troca de modelo sem reiniciar. `ChatSession` lê `settings.llm_model` dinamicamente a cada `send()` em vez de fixar o modelo na construção. `Settings` recarrega do `.env` sob demanda (ou via watchdog/polling no `.env`). Detalhe de implementação a critério do planner.

### Claude's Discretion
- Estrutura do módulo de visão (`src/jarvis/tools/vision.py` ou similar)
- Formato exato do ToolMessage com imagem (base64 data URL vs bytes)
- Polling interval para hot-reload se usar watchdog
- Lógica de detecção de keyword para `/screenshot` vs linguagem natural no __main__.py

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Capacidades e roteamento de LLM (existentes)
- `src/jarvis/llm/capabilities.py` — `detect_capabilities()`, `ModelCapabilities` dataclass com `vision: bool` e `tool_calling: bool` — REUTILIZAR, não reimplementar
- `src/jarvis/config.py` — `Settings` com `llm_provider`, `llm_model`, `lm_studio_model`, `openai_api_key`, `anthropic_api_key` — hot-reload parte daqui

### Tool-calling loop (Phase 4 — base para visão)
- `src/jarvis/core/session.py` — `ChatSession.send()` com tool-calling loop — estender para aceitar `image=` opcional
- `src/jarvis/tools/__init__.py` — `ALL_TOOLS` — adicionar `analyze_screen` aqui

### Executor local (Phase 4)
- `src/jarvis/__main__.py` — entrada CLI, captura de screenshot e `/screenshot` command interceptado aqui

### Requisitos
- `.planning/REQUIREMENTS.md` — VISION-01, VISION-02, VISION-03, LLM-03, LLM-04

### Stack e convenções
- `./CLAUDE.md` — stack aprovada: pyautogui para screenshot, pytesseract para OCR, pillow para imagem

</canonical_refs>

<specifics>
## Specific Ideas

- Fluxo completo MVP: usuário digita "o que está na tela?" → LLM chama `analyze_screen` @tool → pyautogui captura → base64 → ToolMessage com imagem → segundo call LLM com vision → resposta em texto
- `/screenshot [pergunta]` no CLI: __main__.py detecta prefixo, captura screenshot, passa `ChatSession.send(text=pergunta, image=base64)` — LLM responde diretamente sem tool-calling
- OCR fallback: `pytesseract.image_to_string(PIL_image)` → texto → passa como contexto adicional ao LLM padrão (sem vision)
- LangChain image format: `HumanMessage(content=[{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}])`

</specifics>

<deferred>
## Deferred Ideas

- Endpoint HTTP para receber imagens de cliente externo (vem quando o cliente UI for construído)
- Análise de múltiplos screenshots em sequência
- Histórico de screenshots analisados
- Windows/macOS screenshot capture (pyautogui suporta, mas não testado neste projeto)

</deferred>

---

*Phase: 05-advanced-features*
*Context gathered: 2026-04-05 via /gsd:discuss-phase*
