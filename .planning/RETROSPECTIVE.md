# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-05
**Phases:** 5 | **Plans:** 21 | **Duration:** 4 days (2026-04-02 → 2026-04-05)

### What Was Built

- **Foundation** — Pacote Python instalável com config layer pydantic-settings, factory multi-LLM (LM Studio/Claude/OpenAI), detecção de capabilities, validação na inicialização, CLI com streaming
- **Memory** — SQLite (4 tabelas: conversations/messages/summaries/user_profile), ChromaDB semântico, injeção automática de memórias relevantes no contexto
- **Voice Pipeline** — Push-to-talk com sounddevice/faster-whisper, TTS neural offline kokoro, wake word "Hey JARVIS" via openwakeword, estado visual no terminal, pipeline totalmente assíncrono
- **PC Control** — 9 ferramentas (@tool), ActionExecutor com handlers Linux, confirmação para ações destrutivas, audit log no SQLite, integração com ChatSession
- **Advanced Features** — analyze_screen @tool, ScreenAnalyzer com fallback chain (vision→OCR→cloud→erro), ChatSession.send(image=) multimodal, hot-reload de modelo, /screenshot CLI

### What Worked

- **TDD na execução** — Testes failing-first antes de implementar garantiram que cada feature estava realmente funcionando. Zero surpresas na verificação.
- **GSD plan-phase → checker loop** — O plan-checker detectou 2 blockers reais (import circular + LLM-03 incompleto) antes da execução. Sem isso, teria causado bugs em runtime.
- **Worktrees para isolamento** — Executores em worktrees separados eliminaram conflitos entre agentes paralelos.
- **pyautogui lazy import** — Solução para headless Linux descoberta pelo executor e documentada automaticamente nos SUMMARYs. Padrão reutilizável.
- **Abstração multi-LLM desde o início** — Nunca hardcode de provider. Trocar LLM é 1 linha de config.

### What Was Inefficient

- **Merge de worktrees** — O cherry-pick manual dos commits do Wave 2 foi necessário por conflito de STATE.md no stash. Um processo de merge mais limpo (rebase ou merge --strategy) seria melhor.
- **VALIDATION.md dessincronizada** — O plan-checker apontou que o VALIDATION.md criado antes do planner final ficou desatualizado. Criar VALIDATION.md depois dos planos seria mais eficiente.
- **Checkboxes de requirements** — VISION-02/03 foram implementados e verificados mas ficaram com `[ ]` no REQUIREMENTS.md. O executor deveria marcar como completo automaticamente.
- **SUMMARY.md com "One-liner:" vazios** — Alguns planos não preencheram o campo one_liner do summary template. O gsd-tools extraiu strings literais "One-liner:".

### Patterns Established

- **Lazy imports para dependências com side-effects** — `import pyautogui` crashava em headless. Padrão: importar dentro da função, catching ImportError, nunca no topo do módulo para dependências opcionais.
- **patch("module.Settings", return_value=mock_settings)** para testes que chamam `send()` — Hot-reload lê Settings() em cada send(). Testes sem esse patch conectam ao LLM real.
- **Cloud LLM temporário nunca substitui self.llm** — Padrão de cloud-for-vision: criar `cloud_llm` local, usar uma vez, descartar. self.llm sempre aponta para o modelo configurado pelo usuário.
- **asyncio.to_thread para toda chamada bloqueante** — pyautogui, tool.invoke, input(). ARCH-02 enforcement por design.
- **TYPE_CHECKING guard para imports circulares** — `from __future__ import annotations` + `if TYPE_CHECKING:` evita circular import em runtime sem sacrificar type safety.

### Key Lessons

1. **Plan-checker antes de executar vale o tempo** — Detectou bugs que só apareceriam em runtime (import circular). 2 iterações de checker < 1 iteração de debug em produção.
2. **Worktree merge precisa de protocolo** — Stash + merge causa conflito em arquivos de estado. Usar `git checkout <worktree-branch> -- <file>` para arquivos de planning é mais confiável que merge.
3. **REQUIREMENTS.md precisa de atualização incremental** — Marcar requirements como completos durante a fase (não só no final) previne a dessincronização vista com VISION-02/03.
4. **Testes em headless Linux são diferentes de testes em dev** — Dependências de display (pyautogui, opencv) precisam de mock especial com `patch.dict(sys.modules, {...})` não `patch("lib.function")`.
5. **Hot-reload via Settings() re-instantiation é elegante mas testável** — Funciona sem polling, mas todo teste de session.send() precisa mockar Settings para evitar conectar ao LLM real.

### Cost Observations

- Model mix: ~80% sonnet, ~20% opus (planner)
- Executores em worktrees paralelos: máxima eficiência em fases com plans independentes
- Notable: planner opus justificou o custo — produziu planos muito mais concretos e detalhados que sonnet sozinho

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.1 | v2.0 |
|--------|------|------|------|
| Phases | 5 | — | — |
| Plans | 21 | — | — |
| Duration (days) | 4 | — | — |
| LOC (Python) | ~2.638 | — | — |
| Tests | 234 | — | — |
| Checker iterations avg | ~1.5 | — | — |

---

*Updated: 2026-04-05 after v1.0 milestone*
