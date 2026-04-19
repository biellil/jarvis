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

---

## Milestone: v1.3 — Migração Python → TypeScript

**Shipped:** 2026-04-10
**Phases:** 10 (14–21, incluindo 18.5 e 19.5) | **Plans:** 43 | **Duration:** 3 days (2026-04-07 → 2026-04-10)
**Commits:** 142 | **LOC net:** +22.229 | **Files changed:** 279

### What Was Built

- **TypeScript Backend Scaffolding** — Express 5 + Node 22 LTS + TypeScript strict mode, porta 8001, Docker multi-stage
- **Multi-LLM Factory** — LangChain.js 1.x com ChatOpenAI/ChatAnthropic, config-based switching, version validation no startup
- **Memory Layer** — Drizzle ORM + better-sqlite3 + ChromaDB JS + Transformers.js (Xenova/all-MiniLM-L6-v2) — schema 1:1 com Python
- **Agent Runtime** — `@langchain/langgraph` `createReactAgent` + ChatSession + streaming SSE + SessionLock
- **PC Control (Backend+Electron)** — 9 tools como payloads, SSE `event: action`, Electron executor com handlers Linux, confirmação nativa, audit log
- **Voice Pipeline** — STT provider (nodejs-whisper local), TTS provider (ElevenLabs cloud + Speecht5 fallback), PTT Electron com Web Audio playback
- **E2E Validation** — Gateway feature flag `X-Backend-Version`, script de comparação Python vs TS
- **Python Removal** — src/jarvis/ deletado, Dockerfile.python removido, docker-compose.yml com 2 serviços apenas

### What Worked

- **Migração gradual com ambos em paralelo** — Manter Python rodando enquanto TS era desenvolvido eliminou o risco de regressão. Gateway feature flag permitiu validar sem downtime.
- **Drizzle ORM** — Schema TypeScript idêntico ao Python SQLite sem esforço. Migrations auditáveis, DX muito melhor que raw SQL.
- **Separação backend-payload / Electron-executor para PC tools** — Mais limpo que replicar ActionExecutor no backend TS. Electron já tem acesso às APIs de SO.
- **Provider abstraction para STT/TTS** — Factory + interface permitiu trocar ElevenLabs por Speecht5 sem refatorar. Padrão reutilizável para v1.4 (kokoro, whisper alternatives).
- **Cutover direto sem período de observação** — A decisão de não esperar 1 semana foi certa. E2E validation já havia confirmado paridade.

### What Was Inefficient

- **REQUIREMENTS.md checkboxes não atualizados** — O arquivo ficou com ~13/39 marcados mesmo com todas as fases concluídas. Atualização incremental durante execução seria melhor.
- **Binários nativos (electron, better-sqlite3) se perdem após pnpm install** — Node v24 é novo demais para prebuilds. Workaround manual repetido várias vezes antes de criar script.
- **ROADMAP.md progress table obsoleta** — Fases 17-20 marcadas como "Not started" mesmo depois de concluídas. Atualização automática no STATE.md não propagou para ROADMAP.
- **sharp removida do package.json por não ser usada** — Estava no root package.json por engano, nunca foi importada. Melhor revisar dependências antes de commitar.

### Patterns Established

- **`z.coerce.number()` para env vars numéricas no TypeScript** — `process.env` retorna string. `z.number()` falha; `z.coerce.number()` converte corretamente.
- **`configuration: { baseURL }` para LM Studio via LangChain.js 1.x** — `basePath` é pattern do 0.3.x. Verificar docs da versão exata antes de assumir.
- **prebuild-install para módulos nativos após pnpm install** — `node node_modules/electron/install.js` e `cd node_modules/better-sqlite3 && npx prebuild-install` requerem execução manual. Script postinstall resolve.
- **Provider interface + factory para STT/TTS** — `interface STTProvider { transcribe() }` + `createSTTProvider()` torna swap de implementação trivial.
- **Electron executor com dedup TTL e queue serial** — Actions podem chegar repetidas via SSE reconnect. TTL de dedup + queue serial previne side-effects duplos.

### Key Lessons

1. **3 dias para migrar um backend Python inteiro para TypeScript é viável com GSD** — 43 planos, 142 commits, zero regressões visíveis. A decomposição granular em planos pequenos foi o fator chave.
2. **Node v24 tem menos binários precompilados** — Usar Node LTS (v22) em Docker, aceitar workarounds em dev. Não bloquear CI por causa de dev environment.
3. **Cutover direto é melhor que cutover gradual com feature flag quando E2E já validou** — Feature flag cria complexidade e debt. Uma vez confirmada paridade, cortar de uma vez.
4. **REQUIREMENTS.md é documentação, não rastreamento** — Atualizar o arquivo incrementalmente durante execução é a única forma de mantê-lo preciso. Atualização post-facto é propensa a esquecimento.
5. **`pnpm why <package>`** — Quando um módulo quebra de forma inesperada, o primeiro passo é verificar quem depende dele e se está no lugar certo.

### Cost Observations

- Model mix: ~100% sonnet (execução), opus para planos complexos
- 3 dias para 43 planos = ~14 planos/dia — ritmo sustentável com subagentes
- Notable: fases com subagentes paralelos (19 com 8 plans) foram tão rápidas quanto fases menores

---

---

## Milestone: v1.7 — Cross-Platform + Settings UI

**Shipped:** 2026-04-18
**Phases:** 2 (33-34) | **Plans:** 7 | **Duration:** 3 days (2026-04-15 → 2026-04-18)
**Commits:** 54 | **Files changed:** 65 | **Lines:** +8.057 / -488

### What Was Built

- **Phase 33** — macOS: `app.dock.hide()`, menu bar mode, 5 whisper prebuilds bundled (darwin-arm64/x64, linux-x64/cuda/vulkan). Linux X11: frameless window + tray + wake word. 12 testes de plataforma GREEN. Verificação humana aprovada em macOS e Linux.
- **Phase 34** — Settings BrowserWindow com preload dedicado (`window.settings` via contextBridge), SETTINGS_GET/SETTINGS_SAVE IPC handlers, SettingsForm React com HotkeyRecorder + TtsProviderSelect, persistência via electron-store, tray menu integration. TTS reinit pós-save sem reiniciar o app.

### What Worked

- **Singleton BrowserWindow com hide-on-close** — Pattern perfeito para Settings: cria uma vez, esconde/mostra. Zero flicker, estado preservado entre aberturas.
- **Source-level assertions para testes de plataforma** — Verificar `readFileSync` do código-fonte em vez de mockar o Electron inteiro. Rápido, preciso, sem complexidade de mock.
- **Preload dedicado por janela** — `settings.ts` separado do `preload.ts` principal mantém o namespace limpo e security boundary claro.

### What Was Inefficient

- **34-01 sem SUMMARY** — Um plan foi executado inline sem passar pelo fluxo GSD formal. Ficou sem rastreamento. Pequeno mas cria inconsistência nos artefatos.
- **Milestone aberta sem fechar** — v1.7 estava marcado como shipped no ROADMAP mas `gsd-tools` ainda enxergava como ativo. Falta de `/gsd:complete-milestone` logo após o último phase.

### Key Lessons

1. **Fechar o milestone imediatamente após o último phase** — Não deixar para depois. O STATE.md fica inconsistente e o `gsd-tools` fica confuso.
2. **Settings como BrowserWindow separada é o padrão Electron correto** — Reusar a janela principal para settings cria conflitos de preload. Janela separada com preload próprio é mais limpo.
3. **Electron prebuilds devem ser listados como devDependencies no app** — Não no root do monorepo. O electron-builder encontra em `apps/desktop/node_modules/`, não em `../../node_modules/`.

### Cost Observations

- Model mix: ~100% sonnet
- 2 phases em 3 dias — milestone pequeno mas bem focado
- Notable: Phase 33 foi quase inteiramente test scaffolds + config — execução rápida porque o Electron já estava wired

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.3 | v1.7 |
|--------|------|------|------|
| Phases | 5 | 10 | 2 |
| Plans | 21 | 43 | 7 |
| Duration (days) | 4 | 3 | 3 |
| LOC (net) | ~2.638 Python | +22.229 TS | +7.569 TS |
| Commits | ~60 | 142 | 54 |
| Checker iterations avg | ~1.5 | ~1.0 | ~1.0 |

---

*Updated: 2026-04-19 after v1.7 milestone*
