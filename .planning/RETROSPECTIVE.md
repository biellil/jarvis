# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v2.1 — Settings UX

**Shipped:** 2026-05-04
**Phases:** 3 (48-50) | **Plans:** 12 | **Duration:** 2 dias (2026-05-03 → 2026-05-04)

### What Was Built

- **Phase 48 — Design System Foundation** — shadcn/ui + Tailwind v4 @theme tokens, primitivos Button/Input/Select/Slider/Field/HotkeyRecorder/Progress com estados hover/focus/disabled, tema dark com identidade própria
- **Phase 49 — Settings Layout Refactor** — Sidebar 200px + content panel, 4 seções (PTT/Always-Listening/TTS/Whisper) usando primitivos Phase 48, SettingsSectionProps contract, dirty tracking, Vitest adaptado para Radix Select/Slider
- **Phase 50 — Whisper Pre-Download UX** — Download imediato ao trocar modelo (IPC `whisper:download-model`), progress bar determinate com MB/%, cache-hit Toast, error state + Try again, hot-swap `setActiveWhisperModel` sem restart, URLs HF estáveis, fix do rename .tmp→.bin em redirect

### What Worked

- **Execução autônoma via `/gsd:autonomous`** — Todas as 3 fases foram executadas sem intervenção humana até o smoke test final. O fluxo discuss→ui-phase→plan→execute rodou suavemente.
- **`/gsd:autonomous` com context compaction** — O contexto compactou no meio da Phase 50 e o trabalho continuou sem perda de estado. A estratégia de SUMMARY.md por plano funciona perfeitamente como handoff.
- **Smoke test revelou bugs reais** — As URLs pre-signed S3 expiradas e o bug do redirect (file.close() antes de seguir redirect) só apareceram no smoke test manual. Testes automatizados mocam o download — não pegariam isso.
- **Wave-based parallelization** — Wave 1 (resolver + types) e Wave 2 (IPC handler + preload) rodaram em paralelo sem conflito.
- **Progress primitive Phase 48 reutilizado diretamente** — Zero adaptação necessária. O plano de Phase 48 de projetar o primitivo com `status='success'` pagou dividendos aqui.

### What Was Inefficient

- **URLs pre-signed como tech debt latente** — As MODEL_URLS foram geradas na Phase anterior com TTL 1h e nunca atualizadas. Precisou de hotfix no smoke test. Deveria ter sido detectado na Phase 29/30 quando as URLs foram criadas.
- **Agente 50-02 sem acesso a Bash** — O executor de 50-02 rodou sem permissão de Bash, então o orquestrador teve que fazer os commits manualmente. Custo pequeno mas poderia ser evitado.
- **WHISPER-02 checkbox não marcado** — O checkbox ficou `[ ]` no REQUIREMENTS.md mesmo com a feature completa. Mesma pattern do v1.0 com VISION-02/03. Processo de atualização de requirements precisa de step explícito no executor.

### Patterns Established

- **Lazy getter para BrowserWindow** — `getSettingsWindow: () => BrowserWindow | null` em vez de passar a instância diretamente. Permite registrar handlers no boot antes da janela existir.
- **`res.resume()` em redirects HTTP** — Em Node.js `https.get`, nunca chamar `file.close()` antes de seguir um redirect. Drene a response com `res.resume()` e mantenha o WriteStream aberto.
- **Cache-hit detection via `_sawDownloadingRef`** — Flag useRef que rastreia se algum evento 'downloading' precedeu 'success'. Distingue cache-hit (Toast) de download completo (progress bar → success state) sem payload extra.
- **Radix Select nos testes** — `fireEvent.click(trigger)` + `fireEvent.click(option)` em vez de `fireEvent.change`. Consistente com Phase 49.

### Key Lessons

1. **Smoke test manual é insubstituível para I/O real** — URLs expiradas, bugs de redirect, rename de arquivos — nada disso é coberto por mocks. Reserve sempre uma rodada de smoke test com o app real.
2. **URLs estáticas > pre-signed** — Se uma URL expira, é um time bomb. HuggingFace tem URLs estáveis. Usar pre-signed só quando absolutamente necessário e com TTL longo.
3. **Design system upfront paga dividendos** — Phase 48 investiu em Progress com `status='success'` e 1.5s success indicator. Phase 50 usou isso sem adaptação. Primitivos bem pensados eliminam rework.
4. **GSD autonomous funciona bem para milestones pequenos** — 3 fases, escopo claro, sem dependências externas. Humano só precisa aprovar as decisões de design e o smoke test final.

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

## Milestone: v1.8 — Memory Intelligence

**Shipped:** 2026-04-25
**Phases:** 4 (35-38) | **Plans:** 10 | **Duration:** ~7 dias (2026-04-19 → 2026-04-25)
**Commits:** 68 | **Files changed:** 71 | **Lines:** +12.825 / -358 | **Tests:** 351 passing

### What Was Built

- **Phase 35 (Schema & Type Foundation)** — `typed_memories` Drizzle table com CHECK constraint manual em SQLite (Drizzle text enum só fornece TS safety, não runtime), 3 ChromaDB collections separadas (`memories_semantic`, `memories_episodic`, `memories_procedural`), e `validateMemoryConsistency()` non-blocking no startup com cross-check via `source_id`.
- **Phase 36 (Memory Writer)** — `MemoryExtractor` envolvendo `BaseChatModel.withStructuredOutput()` com Zod `discriminatedUnion('type')`. `saveTypedMemory()` faz dual-write SQLite + ChromaDB em try/catch único. ChatSession dispara extração via `void _extractAndWriteMemories()` após saveTurn. MEMW-03 silent failure: returns `[]` em qualquer erro de LLM.
- **Phase 37 (Context Builder)** — `buildContext()` refatorado de 1 query sequencial para `Promise.all` de 3 `queryMemoriesByType()` paralelas. Top-k=5 hardcoded, threshold 0.7 removido. Headers pt-BR ("### Perfil do usuário", "### Memórias semânticas/episódicas/procedurais"). `rollingSum?` parameter opcional para backward compat. Latência total <200ms verificada com mock de 80ms/query.
- **Phase 38 (Rolling Summarization)** — `MemoryStore` ganha 4 helpers: `countMessages()` com `sql<number> cast(count(*) as integer)` (drizzle não infere number de count() sem cast explícito), `getOldestMessages()`, `deleteMessages()`, `getLatestSummary()`. `runRollingSummarization()` com threshold guard (count < 20 = early return), pitfall-3 protection (delete só após summary não-vazio), e cache `_latestSummary` para próximo `buildContext()`. Fire-and-forget em send/sendStream.

### What Worked

- **TDD wave-based execution (Phase 38)** — Wave 1 RED tests → Wave 2 GREEN implementation → Wave 3 wiring. Cada wave em worktree separada, paralelo de plans dentro da wave. Zero regressões cross-wave porque os contratos foram pinados antes da implementação.
- **3-source cross-reference no audit** — VERIFICATION.md + SUMMARY.md frontmatter + REQUIREMENTS.md traceability. Detectou drift documental (REL-01, MCTX-01..04) imediatamente — código estava completo, só checkboxes desatualizados.
- **MEM-05 error parity como pattern** — Try/catch + `console.warn` + nunca re-throw. Aplicado idêntico em 7 métodos cross-phase. Pipeline de voz nunca trava por falha de memória.
- **Pitfall-3 protection antes de delete** — `if (!summary) return` antes de `deleteMessages()` evita perda de mensagens quando LLM falha. Padrão para qualquer "delete após transformar" em sistema com falha possível.
- **Worktree-based parallel execution** — Cada plan em worktree próprio com isolation. 10 plans executados sem conflito de arquivos.

### What Was Inefficient

- **Worktree cleanup script bug** — O script de cleanup tinha lógica que removia arquivos `.planning/` adicionados pelo merge worktree (intenção: remover "resurrected" archive entries; impacto: deletou SUMMARY.md legítimo). Tive que restaurar manualmente do commit. Bug existe em `complete-milestone.md` workflow.
- **Wave 2 reset acidental** — Agente Phase 38 fez `git reset --soft` que apagou 7 testes RED do `store.test.ts`. Restaurei do commit anterior. Worktree-based agents podem perder contexto entre operações de reset.
- **Cross-phase regression mocks** — Phase 38 adicionou `runRollingSummarization` em ChatSession mas os mocks de `MemoryManager` em testes de Phase 18-03/18-04/36 não tinham o método novo. 10 testes quebraram. Detectado pelo regression gate, mas exigiu fix manual em 3 arquivos de teste.
- **REQUIREMENTS.md drift** — 5 requisitos (REL-01 + MCTX-01..04) ficaram com checkboxes `[ ]` mesmo após verificação. `gsd-tools phase complete` não atualiza checkboxes em REQUIREMENTS.md automaticamente; só o traceability table.
- **Nyquist VALIDATION.md drafts** — Todos os 4 phases têm VALIDATION.md em status `draft`. Workflow não força fechamento automático na conclusão da fase.

### Patterns Established

- **Fire-and-forget triple wiring** — Toda nova feature de memória (extraction Phase 36, summarization Phase 38) precisa: (1) método assíncrono que swallow erros, (2) `void` call em ChatSession.send(), (3) `void` call em ChatSession.sendStream(). Padrão idêntico nos dois call sites garante coverage de modos texto + voz.
- **Cache + DB fallback em buildContext** — `effectiveSummary = rollingSum ?? this._latestSummary ?? undefined`. Permite passar valor explícito (testes), usa cache em produção, falla gracefully se ambos null. Padrão reutilizável para qualquer dado lazy-cached.
- **Drizzle SQL helpers para count** — `sql<number> cast(count(*) as integer)` é necessário; `count()` sozinho retorna `unknown` ou `string` dependendo do dialeto. Aplicar em todo count query.
- **Vitest constructor mocks usam function() não arrow** — `vi.fn().mockImplementation(function(){...})` para mockar classes via `new`. Arrow function quebra com "is not a constructor".

### Key Lessons

1. **TDD com wave RED → GREEN funciona** — Pinou os 16 contratos antes de qualquer implementação. Wave 2 não teve dúvida sobre forma do API. Replicar para qualquer phase de TDD futura.
2. **Audit ANTES de complete-milestone** — `/gsd-audit-milestone` detectou drift e tech debt advisory que `/gsd-complete-milestone` aceitaria sem questionar. Skip do audit = enterrar dívidas no archive.
3. **Worktree cleanup precisa de revisão** — A heurística de "remover arquivos .planning/ adicionados pelo merge" é overly-aggressive. Deveria preservar arquivos novos do worktree e só remover ressurrected (existed-then-deleted-then-readded). Issue para reportar no GSD.
4. **Mock fixes ao adicionar método em ChatSession** — Cada vez que um método novo é adicionado em `MemoryManager` que ChatSession chama, todos os `makeMemory()` helpers em testes precisam atualizar o mock. Considerar: factory shared `makeMemoryMock()` em test helpers para evitar duplicação.
5. **REQUIREMENTS.md update durante phase complete não é automático** — `gsd-tools phase complete` retornou `requirements_updated: false`. Editor manual é necessário até CLI fechar esse gap.

### Cost Observations

- Model mix: ~95% sonnet (executor), ~5% haiku (verifier + integration checker)
- 4 phases em ~7 dias — densidade alta de complexidade técnica (LLM extraction, paralelismo, rolling summarization)
- Notable: agentes haiku para verifier/integration-checker mantiveram qualidade equivalente a sonnet — payoff de 5x em custo
- 351 testes passing ao final, com 16 RED tests pinando contratos críticos antes da implementação

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.3 | v1.7 | v1.8 |
|--------|------|------|------|------|
| Phases | 5 | 10 | 2 | 4 |
| Plans | 21 | 43 | 7 | 10 |
| Duration (days) | 4 | 3 | 3 | 7 |
| LOC (net) | ~2.638 Python | +22.229 TS | +7.569 TS | +12.467 TS |
| Commits | ~60 | 142 | 54 | 68 |
| Tests passing | - | - | - | 351 |
| Checker iterations avg | ~1.5 | ~1.0 | ~1.0 | ~1.0 |

---

*Updated: 2026-04-25 after v1.8 milestone*
