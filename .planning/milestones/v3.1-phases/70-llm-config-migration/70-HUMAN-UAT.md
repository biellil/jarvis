---
status: partial
phase: 70-llm-config-migration
source: [70-VERIFICATION.md]
started: 2026-05-12T13:30:00Z
updated: 2026-05-12T13:30:00Z
---

## Current Test

[aguardando teste humano]

## Tests

### 1. Smoke test boot Electron com store legado simulado
expected: Console mostra log `[migration] LLM config: migrated N key(s) to .env [...]; M already present [...]; X store key(s) cleaned`; arquivo `.env` contém as keys migradas; `~/.config/jarvis-desktop/config.json` NÃO contém mais `llmProvider`/`lmStudioUrl`/`*ApiKey`/`streamingLMStudioEventsEnabled`
result: [pending]
why_human: Migração só roda em runtime do Electron (`app.whenReady` → main process). Tests cobrem pure function isoladamente; runtime hook não é testado programaticamente. Validar fim-a-fim requer pré-popular store JSON manualmente e bootar.

### 2. Smoke test Settings UI — abrir Configurações no app rodando
expected: Nav lateral mostra: Push-to-Talk, Always-Listening, TTS, Whisper Model, Wake Word, Vision/Hotkeys, Proactive Notifications. NÃO mostra "LLM" nem "Servidor MCP". Nenhum dropdown de provider, nenhum campo API key, nenhum campo LM Studio URL, nenhum toggle de streaming events visível em qualquer section.
result: [pending]
why_human: Verificação visual da UI requer renderização real. Static analysis confirma componentes deletados, mas pixel-level / nav-list real precisa olho humano.

### 3. Restart aplica novo provider via .env
expected: Editar `.env`, mudar `LLM_PROVIDER=lmstudio` para `LLM_PROVIDER=openai` (com `OPENAI_API_KEY` válido), reiniciar app, fazer pergunta → resposta vem do OpenAI (não LM Studio). Backend startup log mostra provider correto.
result: [pending]
why_human: Requer LLM real respondendo + observação manual de qual provider atendeu. Roadmap Success Criterion 4 explícito sobre restart.

### 4. Migração idempotente — segunda execução
expected: Bootar pela segunda vez após primeira migração: console NÃO mostra log `[migration]` (early return D-03 porque store sem keys LLM); arquivo `.env` permanece idêntico ao da primeira run; nenhuma duplicação.
result: [pending]
why_human: Pure function tests cobrem (test #8), mas idempotência ao nível de runtime + filesystem requer observação.

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
