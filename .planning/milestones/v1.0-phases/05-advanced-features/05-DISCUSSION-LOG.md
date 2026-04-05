# Phase 5: Advanced Features — Discussion Log

**Date:** 2026-04-05
**Duration:** ~10 min
**Mode:** /gsd:discuss-phase (interactive)

---

## Areas Discussed

### 1. Arquitetura da pipeline de visão

**Q: Como a @tool analyze_screen deve funcionar?**
Options: Tool captura + envia imagem para o LLM | Tool retorna payload | Você decide
**Selected:** Tool captura + envia imagem para o LLM

**Q: Qual biblioteca usar para captura do screenshot?**
User clarified architecture: UI/UX client captures screenshot locally and sends to API; API converts to base64 and sends to LangChain. The tool itself doesn't need to use pyautogui on the server side in the long run.

**Q: Para o MVP do CLI (sem UI separada), como __main__.py deve lidar com screenshots?**
Options: Captura local via pyautogui no CLI | API recebe imagem, CLI não captura
**Selected:** Captura local via pyautogui no CLI

---

### 2. Invocação da análise de tela

**Q: Como o usuário aciona a análise de tela no CLI?**
Options: Linguagem natural | /screenshot explícito | Ambos
**Selected:** Ambos: natural + /screenshot

**Q: Quando o LLM detecta intenção de ver a tela, o que acontece?**
Options: @tool analyze_screen no LangChain | Detecção por keyword antes do LLM
**Selected:** @tool analyze_screen no LangChain

---

## Areas NOT Discussed (Claude's Discretion)

- **Cadeia de fallback OCR/cloud**: Não discutido → Planner decide a ordem (OCR → cloud)
- **Hot-reload de modelo**: Não discutido → Planner decide implementação (polling .env ou watchdog)

---

## Decisions Summary

| # | Area | Decision |
|---|------|----------|
| D-01 | Pipeline visão | analyze_screen é @tool; captura + base64 + retorna no ToolMessage |
| D-02 | MVP CLI | pyautogui.screenshot() no __main__.py para MVP |
| D-03 | Invocação | Dupla: natural (@tool) + /screenshot (intercept no __main__) |
| D-04 | Fallback | Claude's discretion (OCR → cloud → erro) |
| D-05 | Hot-reload | Claude's discretion |
