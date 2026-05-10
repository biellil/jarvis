---
phase: 67-jarvis-proativo
verified: 2026-05-10T12:00:00Z
status: gaps_found
score: 10/13 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Usuário pode configurar quiet hours — nenhuma notificação proativa no período configurado"
    status: partial
    reason: "IPC channel mismatch: o preload invoca 'settings:apply-quiet-hours' mas o ipcMain.handle no ipc/proactive.ts registra 'proactive:apply-quiet-hours'. Nenhum handler existe para 'settings:apply-quiet-hours', logo ipcRenderer.invoke rejeita silenciosamente. Mudanças de quiet hours feitas na Settings UI não chegam ao electron-store nem ao backend. Os defaults de startup (pushProactiveConfigToBackend) funcionam, mas a configuração em runtime via UI está quebrada."
    artifacts:
      - path: "apps/desktop/src/preload/settings.ts"
        issue: "Linha 53: ipcRenderer.invoke('settings:apply-quiet-hours', ...) — canal inexistente"
      - path: "apps/desktop/src/main/ipc/proactive.ts"
        issue: "Linhas 59, 91, 121: ipcMain.handle registra 'proactive:apply-quiet-hours', 'proactive:apply-folder-watch', 'proactive:apply-daily-summary' — nunca chamados pelo preload"
    missing:
      - "Alinhar canal IPC: trocar preload.ts para 'proactive:apply-quiet-hours' (ou atualizar handler para 'settings:apply-*')"
      - "Mesma correção para 'proactive:apply-folder-watch' e 'proactive:apply-daily-summary'"

  - truth: "JARVIS entrega resumo diário em áudio e texto no horário configurado pelo usuário sem nenhuma interação manual"
    status: partial
    reason: "O horário do resumo diário não pode ser alterado em runtime. A rota POST /api/settings/daily-summary não existe no proactive router (apenas /quiet-hours e /folder-watch estão implementadas). O backend registra o job com horário fixo '09:00' em index.ts. Adicionalmente, o canal IPC 'settings:apply-daily-summary' não tem handler no main process. A entrega no horário padrão (09:00) funciona, mas o campo 'Horário' na ProactiveSection não altera efetivamente o cron."
    artifacts:
      - path: "apps/backend-ts/src/routes/proactive.ts"
        issue: "Rota POST /daily-summary ausente — apenas /quiet-hours e /folder-watch existem"
      - path: "apps/backend-ts/src/index.ts"
        issue: "Linha 109: ProactiveScheduler.registerDailySummaryJob('09:00') — hardcoded, nunca atualizado"
    missing:
      - "Adicionar rota POST /daily-summary ao createProactiveRouter que chame ProactiveScheduler.registerDailySummaryJob(time)"
      - "Corrigir canal IPC (preload → handler) para daily-summary seguindo o mesmo fix do gap de quiet hours"

  - truth: "ProactiveEventBubble é renderizado no chat quando um proactive:event chega via IPC"
    status: failed
    reason: "ProactiveEventBubble está implementado e testado como componente, mas nunca é renderizado no DOM. App.tsx só renderiza <Orb/>. O ChatContext armazena mensagens com role='proactive' mas nenhum componente de lista de mensagens existe que as exiba. App.tsx contém um comentário TODO explícito: 'Phase 67 TODO: when MessageList component exists'. O Roadmap SC 2 menciona que o bubble deve aparecer no chat."
    artifacts:
      - path: "apps/desktop/src/renderer/src/App.tsx"
        issue: "Linha 282-284: TODO comment — ProactiveEventBubble nunca é renderizado no JSX ativo"
      - path: "apps/desktop/src/renderer/src/chat/ProactiveEventBubble.tsx"
        issue: "Componente existe e está correto mas nenhum consumer o renderiza"
    missing:
      - "Criar componente MessageList (ou equivalente) que itere useChat().messages e renderize ProactiveEventBubble para role='proactive'"
      - "Integrar MessageList no App.tsx/AppContent para exibição visível no widget"
---

# Phase 67: JARVIS Proativo — Relatório de Verificação

**Phase Goal:** JARVIS age de forma autônoma — dispara lembretes, monitora pasta configurada e entrega resumo diário no horário certo
**Verificado:** 2026-05-10T12:00:00Z
**Status:** gaps_found
**Re-verificação:** Não — verificação inicial

## Conquista do Objetivo

### Truths Observáveis

| # | Truth | Status | Evidência |
|---|-------|--------|-----------|
| SC-1 | Usuário diz "me lembra em 30 minutos" e recebe notificação nativa + áudio TTS no horário exato | ✓ VERIFIED | createReminderTool → SQLite → ProactiveScheduler (node-cron) → proactiveEmitter → SSE → ProactiveSSEConsumer → Electron Notification + TTS. UAT Cenário A aprovado. |
| SC-2 | JARVIS monitora pasta configurada e notifica quando novo arquivo chega | ✓ VERIFIED | FolderWatcher (chokidar, depth:0, ignoreInitial:true, 2s debounce) → proactiveEmitter → SSE → Notification. UAT Cenário C aprovado. |
| SC-3 | JARVIS entrega resumo diário em áudio e texto no horário configurado | ✗ PARTIAL | DailySummaryGenerator + ProactiveScheduler.registerDailySummaryJob implementados. TTS + OS Notification funcionam. Porém o horário é fixo '09:00' — rota /daily-summary e canal IPC ausentes impedem configuração. |
| SC-4 | Usuário configura quiet hours e nenhuma notificação proativa é disparada | ✗ PARTIAL | isInQuietHours + nextQuietEnd implementados e testados. Lógica de deferral no scheduler funciona. Porém mudanças via Settings UI falham silenciosamente (canal IPC errado: preload envia 'settings:apply-quiet-hours', handler escuta 'proactive:apply-quiet-hours'). |
| T-01 | createReminderTool / listRemindersTool / cancelReminderTool exportados em session/tools.ts | ✓ VERIFIED | session/tools.ts linhas 59-60: `export { createReminderTool, listRemindersTool, cancelReminderTool }` |
| T-02 | ProactiveScheduler.bootstrap() chamado em index.ts após migrações | ✓ VERIFIED | index.ts linha 52: `ProactiveScheduler.bootstrap()` após runMigrations() |
| T-03 | ProactiveScheduler.setLlm(session.llm) chamado em index.ts | ✓ VERIFIED | index.ts linha 105: `ProactiveScheduler.setLlm(session.llm)` |
| T-04 | GET /api/proactive/stream retorna text/event-stream e emite eventos nomeados | ✓ VERIFIED | proactive.ts linhas 108-114: Content-Type: text/event-stream, event: proactive:fire |
| T-05 | ProactiveSSEConsumer.startListening chamado em main/index.ts após backend connect | ✓ VERIFIED | main/index.ts linhas 55, 390-401: ProactiveSSEConsumer instanciado e startListening chamado |
| T-06 | Electron Notification com título correto por kind (Lembrete / Resumo diário pronto) | ✓ VERIFIED | proactive-handler.ts linhas 114, 133: títulos pt-BR conforme UI-SPEC |
| T-07 | webContents.send('proactive:event') chamado após Notification | ✓ VERIFIED | proactive-handler.ts linha 103: `mainWindow.webContents.send('proactive:event', evt)` |
| T-08 | ProactiveEventBubble renderiza emojis e cores corretas por kind | ✓ VERIFIED | ProactiveEventBubble.tsx implementado (162 linhas), testado, 3 kinds com correct stripe + emoji. Componente está correto — problema é que não é renderizado. |
| T-09 | ProactiveEventBubble renderizado no DOM quando proactive:event chega | ✗ FAILED | App.tsx não tem MessageList. Apenas `<Orb/>` é renderizado. ChatContext armazena state mas nenhum componente o consome visualmente. |

**Score:** 10/13 truths verificadas

### Artefatos Obrigatórios

| Artefato | Fornece | Status | Detalhes |
|----------|---------|--------|---------|
| `apps/backend-ts/src/proactive/types.ts` | Reminder interface + Zod schemas | ✓ VERIFIED | 60 linhas, exports: Reminder, createReminderInputSchema, ProactiveEvent |
| `apps/backend-ts/src/proactive/repository.ts` | CRUD Drizzle para reminders | ✓ VERIFIED | 91 linhas, db.insert/select/update com tabela reminders |
| `apps/backend-ts/src/proactive/tools.ts` | 3 LangChain tools | ✓ VERIFIED | 175 linhas, createReminderTool/listRemindersTool/cancelReminderTool exportados |
| `apps/backend-ts/src/proactive/scheduler.ts` | ProactiveScheduler + proactiveEmitter | ✓ VERIFIED | 217 linhas, exports ProactiveScheduler, proactiveEmitter |
| `apps/backend-ts/src/proactive/quiet-hours.ts` | isInQuietHours + nextQuietEnd | ✓ VERIFIED | 63 linhas, funções puras cross-midnight algorithm |
| `apps/backend-ts/src/proactive/folder-watcher.ts` | FolderWatcher com debounce + quiet buffer | ✓ VERIFIED | 132 linhas, ignoreInitial:true, depth:0, quietBuffer, quietDeferTimer |
| `apps/backend-ts/src/proactive/summary-generator.ts` | buildSummaryContext + generateDailySummary | ✓ VERIFIED | 172 linhas, pt-BR prompt, fallback string implementado |
| `apps/backend-ts/src/routes/proactive.ts` | SSE /api/proactive/stream + ack + settings | ✓ VERIFIED | 220 linhas, createProactiveRouter exportado. Nota: /daily-summary ausente. |
| `apps/backend-ts/src/memory/migrations/0005_reminders.sql` | Migration SQL tabela reminders | ✓ VERIFIED | CREATE TABLE + 2 índices + statement-breakpoints |
| `apps/desktop/src/main/proactive-handler.ts` | ProactiveSSEConsumer | ✓ VERIFIED | 138 linhas, SSE fetch loop + Notification + IPC dispatch |
| `apps/desktop/src/main/ipc/proactive.ts` | setupProactiveIpc + pushProactiveConfigToBackend | ✓ VERIFIED | 171 linhas. Handlers registrados como 'proactive:apply-*'. |
| `apps/desktop/src/renderer/src/settings/sections/ProactiveSection.tsx` | Settings UI 3 grupos | ✓ VERIFIED | 269 linhas, 3 grupos conforme UI-SPEC, acessibilidade, disabled states |
| `apps/desktop/src/renderer/src/chat/ProactiveEventBubble.tsx` | Chat bubble proativo | ✓ VERIFIED | 162 linhas, 3 kinds com stripe color + emoji + timestamp pt-BR. Componente correto mas não renderizado. |
| `apps/desktop/src/shared/ipc-types.ts` | ProactiveEvent union + config types | ✓ VERIFIED | ProactiveEvent, QuietHoursConfig, FolderWatchConfig, DailySummaryConfig, IPC_CHANNELS.PROACTIVE_EVENT, applyQuietHours/applyFolderWatch/applyDailySummary em SettingsApi |

### Verificação de Key Links

| De | Para | Via | Status | Detalhes |
|----|------|-----|--------|---------|
| session/tools.ts | proactive/tools.ts | named import | ✓ WIRED | linha 59: `export { createReminderTool, listRemindersTool, cancelReminderTool }` |
| repository.ts | schema.ts (reminders) | Drizzle db.select/insert | ✓ WIRED | linhas 63, 86: `.from(reminders)` |
| scheduler.ts | quiet-hours.ts | import isInQuietHours + nextQuietEnd | ✓ WIRED | linha 18: import confirmado |
| scheduler.ts | proactiveEmitter | proactiveEmitter.emit('event') | ✓ WIRED | linhas 143, 203: emit confirmado |
| routes/proactive.ts | proactiveEmitter | proactiveEmitter.on('event') | ✓ WIRED | linha 117: on('event', handler) |
| index.ts | ProactiveScheduler.bootstrap() | após runMigrations() | ✓ WIRED | linha 52: chamada confirmada |
| main/index.ts | ProactiveSSEConsumer.startListening | após backend connect | ✓ WIRED | linha 390-401: instanciado e chamado |
| ProactiveSSEConsumer | webContents.send('proactive:event') | IPC push ao renderer | ✓ WIRED | linha 103: send confirmado |
| App.tsx useEffect | ChatContext.addProactiveMessage | ipcRenderer.on('proactive:event') | ✓ WIRED | linha 265: addProactiveMessage(evt) |
| ChatContext | ProactiveEventBubble | message.role === 'proactive' render | ✗ NOT_WIRED | Nenhum componente de lista de mensagens existe. App.tsx renderiza apenas `<Orb/>`. ChatContext armazena state mas não tem consumer visual. |
| preload applyQuietHours | ipcMain handler 'proactive:apply-quiet-hours' | ipcRenderer.invoke | ✗ NOT_WIRED | Preload envia 'settings:apply-quiet-hours' (linha 53), handler registra 'proactive:apply-quiet-hours' (linha 59 de ipc/proactive.ts). Canal não existe no main process. |
| ProactiveSection DailySummary | /api/settings/daily-summary | IPC → POST | ✗ NOT_WIRED | Rota /daily-summary ausente do proactive router. Apenas /quiet-hours e /folder-watch implementadas. |

### Data-Flow Trace (Nível 4)

| Artefato | Variável de Dados | Fonte | Produz Dados Reais | Status |
|----------|------------------|-------|-------------------|--------|
| ProactiveScheduler | pending reminders | `db.select().from(reminders).where(inArray(status, ['pending','deferred']))` | Sim | ✓ FLOWING |
| buildSummaryContext | messages, actions, reminders | SQLite SELECT em messages, actionsLog, reminders | Sim | ✓ FLOWING |
| ProactiveSSEConsumer | ProactiveEvent via SSE | fetch /api/proactive/stream → ReadableStream → JSON.parse | Sim | ✓ FLOWING |
| ProactiveEventBubble | event.message / event.files / event.text | proactiveEvent prop de ChatMessage | N/A | ✗ HOLLOW_PROP — evento nunca alcança o componente (não renderizado) |

### Spot-Checks Comportamentais

| Comportamento | Comando | Resultado | Status |
|--------------|---------|-----------|--------|
| createReminderTool exportado | `grep "createReminderTool" apps/backend-ts/src/session/tools.ts` | linha 59: export confirmado | ✓ PASS |
| proactiveEmitter.emit em scheduler | `grep "proactiveEmitter.emit" apps/backend-ts/src/proactive/scheduler.ts` | linhas 143, 203 | ✓ PASS |
| SSE Content-Type: text/event-stream | `grep "text/event-stream" apps/backend-ts/src/routes/proactive.ts` | linha 108 | ✓ PASS |
| Electron Notification title "Lembrete" | `grep "Lembrete" apps/desktop/src/main/proactive-handler.ts` | linha 114 | ✓ PASS |
| IPC canal mismatch | preload linha 53 vs ipc/proactive.ts linha 59 | 'settings:apply-quiet-hours' vs 'proactive:apply-quiet-hours' | ✗ FAIL |
| /daily-summary rota | `grep "daily-summary" apps/backend-ts/src/routes/proactive.ts` | nenhum resultado | ✗ FAIL |
| ProactiveEventBubble renderizado | busca por `<ProactiveEventBubble` em componentes ativos | apenas TODO comment em App.tsx | ✗ FAIL |

### Cobertura de Requisitos

| Requisito | Plano(s) | Descrição | Status | Evidência |
|-----------|---------|-----------|--------|-----------|
| PROACT-01 | 67-02, 67-07, 67-10 | Criar lembrete por voz ou texto | ✓ SATISFIED | createReminderTool implementado, testado (82/82 testes passando), UAT Cenário A+E aprovado |
| PROACT-02 | 67-03, 67-08, 67-09 | Disparar lembrete com áudio TTS + toast visual no widget | ✓ PARTIAL | TTS via speakText implementado, OS Notification implementado e testado. Toast visual = bubble no chat NÃO renderizado. OS Notification é um "toast visual" em sentido amplo. UAT aprovou. |
| PROACT-03 | 67-08 | Notificação nativa do OS com texto do lembrete | ✓ SATISFIED | ProactiveSSEConsumer cria Electron Notification, testado (21 testes desktop), UAT Cenário A aprovado |
| PROACT-04 | 67-03, 67-04, 67-08, 67-09 | Configurar quiet hours | ✗ BLOCKED | isInQuietHours/nextQuietEnd implementados e testados. Deferral no scheduler funciona. Porém IPC canal errado impede configuração em runtime via UI. Defaults de startup funcionam. |
| PROACT-05 | 67-05, 67-07 | Monitorar pasta e notificar novos arquivos | ✓ SATISFIED | FolderWatcher com chokidar, debounce 2s, quiet buffer implementados, testados, UAT Cenário C aprovado |
| PROACT-06 | 67-06, 67-07 | Resumo diário em áudio + texto no horário configurado | ✗ PARTIAL | DailySummaryGenerator implementado, LLM call + fallback pt-BR testados. Delivery via TTS + Notification funciona no horário padrão. Horário configurável não funciona (rota /daily-summary ausente). |

### Anti-Padrões Encontrados

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---------|-------|--------|-----------|---------|
| apps/desktop/src/preload/settings.ts | 53-55 | Canal IPC errado: 'settings:apply-*' vs 'proactive:apply-*' | 🛑 Blocker | Settings UI não consegue configurar quiet hours, folder watch ou daily summary. ipcRenderer.invoke rejeita sem handler. |
| apps/desktop/src/renderer/src/App.tsx | 282-284 | TODO comment — ProactiveEventBubble nunca renderizado | ⚠️ Warning | Bubble no chat não visível. Funcionalidade "toast visual" dependente de futuro MessageList. |
| apps/backend-ts/src/routes/proactive.ts | — | Rota POST /daily-summary ausente | 🛑 Blocker | Configuração do horário do resumo diário não persiste no backend. Scheduler usa '09:00' hardcoded. |
| apps/backend-ts/src/app.ts | 52-53 | createProactiveRouter() montado duas vezes (redundante mas funcional) | ℹ️ Info | Não causa erro — folderWatcher é singleton de módulo. Rota /api/settings/* funciona corretamente. |

### Verificação Manual Necessária

Todos os itens de UAT manual foram aprovados pelo usuário (commit `4ce8cd4`: "manual UAT approved by user"). Os 5 cenários do Plan 67-10 foram executados. No entanto, a verificação automatizada identificou que Cenário B (quiet hours via Settings UI) provavelmente não testou o caminho de configuração — o path de deferral via scheduler funciona, mas o canal IPC para salvar a nova config via UI está quebrado. O UAT pode ter testado quiet hours pré-configuradas via store defaults.

**Recomendação de re-teste pós-correção:**
1. Abrir Settings → Notificações proativas → Ativar "Horário silencioso", alterar Início/Fim
2. Verificar que a configuração persiste após reinicialização do app
3. Criar reminder durante a janela quiet e confirmar deferral no horário correto
4. Alterar horário do Resumo diário para +2min e confirmar que o cron dispara no novo horário

### Resumo dos Gaps

**3 gaps bloqueando o objetivo completo:**

**Gap 1 (Blocker — PROACT-04 + PROACT-06 + PROACT-05 runtime config):** Canal IPC errado no preload. O preload (`apps/desktop/src/preload/settings.ts` linhas 53-55) invoca `settings:apply-quiet-hours`, `settings:apply-folder-watch` e `settings:apply-daily-summary`, mas os handlers `ipcMain.handle` no arquivo `apps/desktop/src/main/ipc/proactive.ts` (linhas 59, 91, 121) registram `proactive:apply-quiet-hours`, `proactive:apply-folder-watch` e `proactive:apply-daily-summary`. Esses canais nunca se encontram — qualquer mudança de configuração feita pelo usuário na Settings UI falha silenciosamente. A correção é de 3 linhas no preload (substituir prefixo `settings:` por `proactive:`).

**Gap 2 (Blocker — PROACT-06 configuração de horário):** Rota POST `/daily-summary` ausente do proactive router. O router em `apps/backend-ts/src/routes/proactive.ts` implementa `/quiet-hours` e `/folder-watch` mas não `/daily-summary`. O backend registra o job de resumo diário com horário fixo `'09:00'` em `index.ts` linha 109, ignorando o valor configurado pelo usuário. A correção exige adicionar o route handler e uma chamada `ProactiveScheduler.registerDailySummaryJob(time)`.

**Gap 3 (Warning — PROACT-02 "toast visual"):** ProactiveEventBubble implementado mas não renderizado. O componente `ProactiveEventBubble.tsx` (162 linhas) está correto e testado, o ChatContext armazena mensagens com `role='proactive'`, e o IPC listener em App.tsx chama `addProactiveMessage`. Porém nenhum componente de lista de mensagens renderiza essas mensagens. App.tsx apenas renderiza `<Orb/>`. O requisito PROACT-02 menciona "toast visual no widget" — se interpretado como a OS Notification (que já funciona), este gap é menor. Se interpretado como bubble no chat, é um gap de UI. O Cenário A do UAT listou "bubble aparece no chat" como critério, mas isso não pode ter sido verificado.

**Causa raiz comum dos Gaps 1 e 2:** O Plan 67-09 adicionou os handlers IPC com prefixo `proactive:` e o preload com prefixo `settings:` num mesmo commit, sem validação de alinhamento de canal. O Plan 67-07 omitiu a rota `/daily-summary` do router (o plano mencionava em task 2 que "daily summary config é enviada via POST /api/settings/daily-summary" mas nunca implementou o route handler).

---

*Verificado: 2026-05-10T12:00:00Z*
*Verificador: Claude (gsd-verifier)*
