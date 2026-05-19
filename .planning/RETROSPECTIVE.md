# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v2.3 — LLM Providers & System Actions

**Shipped:** 2026-05-07
**Phases:** 5 (57-61) | **Plans:** 13 | **Duration:** 2 dias (2026-05-06 → 2026-05-07)
**Files changed:** 177 | **LOC net:** +27.334 / -2.075

### What Was Built

- **Phase 57 — Google Gemini Provider** — `@langchain/google-genai` integrado, LLMProvider union com 4 providers, factory com `ChatGoogleGenerativeAI`, API key em electron-store com UI condicional em Settings, `ChatSession.swapLLM()` + endpoint `POST /internal/reload-llm`, degradação graceful com toast de erro
- **Phase 58 — File Actions Refinement** — `deleteFile`/`moveFile`/`renameFile` handlers com `open` package, `path.resolve()` defense-in-depth, `READ_ONLY_ACTIONS` Set para auto-execução sem toast, ações destrutivas com label explícito
- **Phase 59 — System Controls** — `adjust_volume` (delta ±100), `toggle_mute`, `media_control` (play/pause/next/prev) como Electron IPC handlers + LangGraph tools em `createAllPcTools()`
- **Phase 60 — LM Studio Streaming Events** — `ChatOpenAIStreamingEvents` subclasse com parser SSE nativo `/api/v1/chat`, feature flag `USE_LM_STUDIO_STREAMING_EVENTS` em electron-store, toggle UI em LlmSection, fallback automático via `super.stream()`
- **Phase 61 — Embedding Priority Queue** — `EmbeddingQueue` singleton (p-queue concurrency=1, AbortController Map), `vectors.ts` write paths passam por `enqueueEmbed`, `saveTurn` split em SQLite síncrono + Chroma fire-and-forget, `ChatSession.send/sendStream` pausam queue antes do LLM e resumem no `finally`

### What Worked

- **Milestone velocidade** — 5 fases em 2 dias com qualidade de código alta. A base arquitetural do v2.2 (separação backend/Electron, factory pattern, LangChain tools) tornou cada phase straightforward de implementar.
- **Pattern reutilização consistente** — Cada nova feature seguiu padrões existentes sem adaptação: tool-factory pattern (Phase 59), apply-without-restart IPC (Phase 60), singleton + AbortController (Phase 61).
- **p-queue como solução elegante** — A Phase 61 poderia ter sido complexa (mutex manual, mutex+semáforo), mas p-queue com pause/resume resolveu a concorrência sem código custom. Abstrações de alta qualidade reduzem surface area de bugs.
- **fire-and-forget correto** — Separar SQLite síncrono de Chroma async em `saveTurn` foi a decisão certa: SQLite é a fonte de verdade da sessão, Chroma é indexação opcional que pode atrasar.

### What Was Inefficient

- **SUMMARY.md com campos "One-liner:" literais** — Vários summaries não preencheram o campo `one_liner`, deixando a string literal "One-liner:" como valor. Afeta o `milestone complete` CLI que extrai accomplishments. Problema recorrente desde v1.0.
- **Phase 60 ROADMAP.md com `[ ]` na Phase 60-02** — O ROADMAP ficou desatualizado com `60-02-PLAN.md` não marcado, mas todos os summaries existiam. Inconsistência entre roadmap e disco.
- **Sem UAT nas phases do milestone** — Nenhuma fase de v2.3 passou por UAT antes do milestone complete. Sistema controls e streaming events são exatamente o tipo de feature que precisa de teste manual com hardware real.

### Patterns Established

- **LLM provider feature flag via electron-store** — `USE_LM_STUDIO_STREAMING_EVENTS`, `selectedLlmProvider` — padrão consolidado: flag no store, toggle na UI, apply-without-restart via IPC broadcast para todos os windows.
- **`READ_ONLY_ACTIONS` Set para bypass de confirmação** — Conjunto explícito de actions que auto-executam. Fácil de auditar, fácil de estender. Alternativa limpa a boolean flags por action.
- **EmbeddingQueue pause/resume em ChatSession** — `try { queue.pause(); await llm() } finally { queue.resume() }` — padrão correto para priorização sem starvation. O `finally` garante resume mesmo em erro.
- **Subclasse ChatOpenAI com SSE nativo** — Herdar e sobrescrever `stream()` preserva todo o LangChain tooling (tool_calls, streaming chunks) enquanto substitui o transport. Extensibility point certo.

### Key Lessons

1. **UAT manual antes de milestone complete** — System controls (volume, mídia) e Streaming Events precisam de hardware real para validar. Não é possível testar isso com Vitest. Reserve sempre 30min de smoke test com o app real antes de fechar.
2. **SUMMARY.md one_liner precisa de enforcement** — O gsd-planner deveria incluir um exemplo não-vazio obrigatório no template. "One-liner:" literal corrompe o CLI de retrospectiva.
3. **fire-and-forget certo: só para operações idempotentes** — Chroma indexação é idempotente (re-index não quebra nada). SQLite persistência não é. Separar por criticidade, não por latência.
4. **Milestone de 2 dias é o sweet spot para fases incrementais** — Quando a base arquitetural está sólida, fases incrementais (novo provider, nova tool, nova feature flag) rodam sem surpresas. O custo de planejamento é dominado pela fase de entendimento arquitetural, não pela implementação.

### Cost Observations

- Model mix: ~85% sonnet (executor + planner), ~15% haiku (checker + researcher)
- Sessions: ~2 sessões principais
- Notable: Nenhuma iteração de plan-checker necessária — planos passaram na primeira tentativa. Indica maturidade do estilo de planejamento para esse tipo de feature.

---

## Milestone: v2.2 — LLM Actions & Polish

**Shipped:** 2026-05-06
**Phases:** 6 (51-56) | **Plans:** 22 | **Duration:** 5 dias (2026-04-02 → 2026-05-06) | **LOC:** +23.092 / -478

### What Was Built

- **Phase 51 — macOS Tray Icon Polish** — Template PNGs gerados via script sharp (black+alpha), lógica platform-conditional no tray.ts, testes TDD com source-level readFileSync
- **Phase 52 — Settings Extras** — LM Studio URL com validação http://host:port, provider LLM dropdown com aviso context overflow, wake word sensitivity slider 0.0–1.0 com runtime apply via IPC
- **Phase 53 — Streaming TTS** — SSE consumer + sentence chunker + streamingTurn orchestrator no main; Web Audio gapless queue (AudioContext singleton) no renderer; feature flag STREAMING_TTS com toggle na UI; bifurcação no voiceHandler com barge-in entry point
- **Phase 54 — LLM Actions — Channel & Security** — WebSocket server `/api/actions` no gateway com clientId Map; Zod whitelist (home/Downloads/Documents/Desktop); audit log POST `/internal/actions-log`; Electron actionsClient com reconexão exponential backoff; toast Permitir/Negar/10s timeout
- **Phase 55 — LLM Actions — Tool Execution** — 4 ActionHandler implementações (openFolder/openFile/closeApp/viewContent); LangGraph tool `request_file_action` no backend; IPC ACTION_EXECUTE + ACK wire format com payload content; executeAndAck no renderer
- **Phase 56 — Always-Listening Soak Test** — Endpoint `/internal/diagnostics` (heap, RSS, p99 event loop, audioContextCount); soak-test.ts HTTP polling com QA-01 thresholds e relatório HTML Chart.js; smoke test aprovado; fix healthcheck Docker ChromaDB (bash TCP em vez de curl)

### What Worked

- **Wave-based parallelization em fases grandes** — Phase 54 com 5 planos em 4 waves rodou sem conflitos. Cada wave buildava sobre a anterior sem interferência.
- **TDD Red-Green em fases críticas** — Phase 55 usou TDD puro para os ActionHandlers. Testes escritos antes da implementação capturaram edge cases (paths com espaços, apps inexistentes) antes de qualquer código real.
- **Checkpoint humano na Phase 56** — O plano 56-03 como checkpoint foi a decisão certa: pegou o bug do healthcheck do ChromaDB (curl não disponível na imagem) antes de qualquer tentativa de rodar o soak de 8 horas.
- **Docker Compose sempre-funcional** — O fix do healthcheck (bash `/dev/tcp` em vez de `curl`) foi trivial graças à instrumentação de diagnósticos já estar no lugar.
- **Separação backend gera payload / Electron executa** — Padrão estabelecido em v1.3 pagou dividendos enormes em v2.2. O LLM não executa ações diretamente — apenas emite `request_file_action` → backend valida path → Electron executa. Zero superfície de ataque no LLM.

### What Was Inefficient

- **WebSocket em vez de SSE original** — O plano original dizia "canal SSE bidirecional" mas SSE é unidirecional. O executor da Phase 54 escolheu WebSocket corretamente, mas o replan demorou um ciclo. O research deveria ter detectado isso antes.
- **3 testes do UAT 53 pulados** — barge-in, flag persistence e Murf legacy ficaram como `skipped` no 53-HUMAN-UAT.md. São cenários legítimos mas exigem o app Electron rodando — difícil de automatizar no pipeline atual.
- **audioContextCount=0 no smoke test** — O teste rodou em Docker-only (sem Electron), então `eventLoopP99Ms=0` e `audioContextCount=0` eram esperados mas não ideais. O smoke test completo exige o app desktop rodando.

### Patterns Established

- **Bash TCP healthcheck para imagens minimalistas** — `bash -c 'echo > /dev/tcp/localhost/PORT'` funciona em qualquer imagem que tenha bash, sem precisar de curl/wget. Padrão a usar em todos os healthchecks Docker.
- **AbortController + timeout em fetch** — `AbortSignal.timeout(10_000)` no soak-test.ts é o padrão correto para HTTP polling com timeout sem memory leak do AbortController manual.
- **ACK wire format com `content?`** — Adicionar campo opcional `content` no ACK permitiu que `viewContent` retornasse o texto do arquivo pelo mesmo canal de confirmação, sem IPC extra.
- **`executeJavaScript` para ler window globals** — Ler `window.__audioContextCount` via `mainWindow.webContents.executeJavaScript()` evita IPC desnecessário para reads simples de estado do renderer.

### Key Lessons

1. **Checkpoint humano antes de rodar de verdade** — Phase 56-03 pegou um bug de infraestrutura (healthcheck) que teria bloqueado o soak de 8h. Sempre ter um "smoke test gate" antes de operações longas.
2. **Whitelist de paths é segurança real, não cosmética** — A validação Zod no gateway garante que mesmo um LLM adversarial não consegue acessar `/etc/passwd`. Nunca confiar no LLM para sanitizar paths.
3. **WebSocket > SSE para canais bidirecionais** — SSE é HTTP unidirecional. Para backend→Electron com ACK do Electron→backend, WebSocket é a escolha certa. Research deve verificar isso antes de planejar.
4. **Docker healthchecks quebram silenciosamente** — O ChromaDB ficou `unhealthy` por `FailingStreak: 355` sem nenhum log óbvio. Sempre testar healthchecks explicitamente na primeira vez que um serviço é adicionado.

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

## Milestone: v3.2 — Python Desktop Client

**Shipped:** 2026-05-19
**Phases:** 6 (72–77) | **Plans:** 15

### What Was Built
- `apps/desktop-py/` Python package (uv, hatchling, pyproject.toml, uv.lock) com src-layout
- Terminal SSE chat via stdlib urllib — health gate, SSE chunking, agentic protocol
- faster-whisper 1.2.1 STT singleton com PTT, always-listening e wake-word modes
- Kokoro offline TTS → ElevenLabs → Murf fallback chain; `stop_tts()` thread-safe
- `voice_modes.py` máquina de estados com 3 loops em threads separadas + hot-swap
- `ui.py` singleton com `rich.Live` status bar + `/config` menu com hot-swap imediato

### What Worked
- TDD com Wave 0 xfail stubs antes de cada fase — testes apontaram contratos cedo
- Singleton pattern (stt, tts, ui) tornou mocking trivial e integração limpa
- Decisão de manter LLM/memória no backend-ts: cliente ficou 370 LOC ao invés de 2000+
- Lazy imports dentro de handlers evitou todos os circular imports antecipados

### What Was Inefficient
- Phase 77 teve múltiplos fix commits pós-execução (rich.Live vs input(), Unicode cp1252) — deveria ter pesquisado compatibilidade Windows primeiro
- Tag v3.2 criada antes do merge, precisou ser recriada apontando para merge commit

### Patterns Established
- `_console()` lazy helper pattern para evitar circular import em módulos que usam rich
- Wave 0 `xfail(strict=False)` stubs: aparecem em CI output sem bloquear; viram passing quando fase implementa
- `non-blocking get_nowait` antes de `input()` — padrão correto para voice/keyboard coexistence no Windows (select() é Unix-only)
- Cloud TTS functions retornam `bool` para chain de fallback limpa

### Key Lessons
- Windows terminal: sempre testar Unicode antes de comitar — cp1252 quebra box-drawing chars
- `rich.Live` pausa durante `input()` é obrigatório para restaurar echo no terminal
- `patch.object(module, 'Class')` preferível sobre `sys.modules` patching quando o import já aconteceu no module load
- uv override-dependencies útil para deps sem wheels (tflite-runtime cp312)

### Cost Observations
- 6 fases em 1 dia (2026-05-18) — Python stack mais simples que TS/Electron
- 0 failed tests ao final (32 passed, 15 xpassed)
- 19/19 requirements 100% validados

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.3 | v1.7 | v1.8 | v3.2 |
|--------|------|------|------|------|------|
| Phases | 5 | 10 | 2 | 4 | 6 |
| Plans | 21 | 43 | 7 | 10 | 15 |
| Duration (days) | 4 | 3 | 3 | 7 | 1 |
| LOC (net) | ~2.638 Python | +22.229 TS | +7.569 TS | +12.467 TS | +24.890 (Python+TS) |
| Commits | ~60 | 142 | 54 | 68 | 111 |
| Tests passing | - | - | - | 351 | 32+15xpass |
| Requirements hit | - | - | - | - | 19/19 (100%) |

---

*Updated: 2026-05-19 after v3.2 milestone*
