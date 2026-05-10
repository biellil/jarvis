# Phase 67: JARVIS Proativo - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

JARVIS dispara saídas proativas — lembretes agendados, notificações de arquivo novo em pasta monitorada, resumo diário em áudio + texto — sem que o usuário tenha aberto o chat, respeitando uma janela de quiet hours.

**Cobre os requirements:** PROACT-01, PROACT-02, PROACT-03, PROACT-04, PROACT-05, PROACT-06.

**Crítérios de sucesso (do ROADMAP.md):**
1. "me lembra em 30 minutos de revisar o PR" → notif nativa + TTS no horário exato
2. Pasta monitorada → notifica quando arquivo novo chega (com nome + caminho)
3. Resumo diário em áudio + texto no horário configurado, sem interação manual
4. Quiet hours configurada → nenhuma notificação proativa durante o período

</domain>

<decisions>
## Implementation Decisions

### Persistência & Engine

- **D-01: Reminders persistidos em SQLite via Drizzle (backend-ts).**
  Nova tabela `reminders` no DB já existente. Schema mínimo:
  ```ts
  reminders {
    id: integer primary key autoincrement,
    due_at: integer (epoch ms),
    message: text,
    kind: text ('reminder' | 'daily_summary' | 'folder_event'),
    status: text ('pending' | 'fired' | 'cancelled' | 'deferred'),
    created_at: integer (epoch ms),
    fired_at: integer nullable,
    deferred_until: integer nullable  -- usado quando D-11 adia para fim do quiet
  }
  ```
  Drizzle migration manual (mesmo padrão de memory tables). Durabilidade transacional, queryable, sobrevive restart.

- **D-02: Engine de scheduling = `node-cron` (nova dep, listada em STATE.md v3.0 arch notes).**
  No startup do backend-ts, `ProactiveScheduler.bootstrap()`:
  1. `SELECT * FROM reminders WHERE status='pending' OR status='deferred'`
  2. Para cada row, registra um cron job (cron expression derivada de `due_at`).
  3. Resumo diário registra job recorrente fixo via cron expression `M H * * *` (horário config).
  Sem polling — cron é declarativo e single-source-of-truth da agenda em runtime.

- **D-03: ProactiveScheduler roda no backend-ts (serviço Express).**
  - chokidar 5.0.0 já está instalado em backend-ts (`apps/backend-ts/package.json`).
  - SQLite + Drizzle + LangGraph stack já vivem ali.
  - Coerente com STATE.md v3.0 architecture notes ("node-cron + chokidar in backend-ts").
  - Backend-ts é o componente sempre-vivo (Docker/PM2 friendly); Electron pode estar minimizado/dormindo.

- **D-04: Comunicação backend → desktop via SSE dedicado `/api/proactive/stream`.**
  - Conexão long-lived que `desktop/src/main` abre no startup (após backend-client connect).
  - Backend faz `res.write('event: proactive:fire\ndata: {...}\n\n')` quando dispara.
  - Reusa infra SSE de Phase 60 (LM Studio streaming events) e Phase 66 (task:* events) — named events, EventSource consumer com `addEventListener('proactive:fire', ...)`.
  - Confirm/snooze/dismiss fluem via POST `/api/proactive/:id/ack` (mesma assimetria de Phase 66).
  - `ProactiveEvent` discriminated union em `packages/ipc-types/`:
    ```ts
    | { kind: 'reminder', id, message, dueAt }
    | { kind: 'folder_event', files: Array<{ name, path }>, folderPath }
    | { kind: 'daily_summary', text, generatedAt }
    ```

### Criação/cancelamento de lembretes (UX + intent)

- **D-05: Lembretes criados via LangChain tool `createReminderTool` no agent existente (Phase 66 stack).**
  - Reusa `createReactAgent` + tool registry de `apps/backend-ts/src/session/tools.ts`.
  - LLM vê "me lembra em 30 minutos de revisar o PR" → chama tool com schema estruturado.
  - Sem regex/intent classifier antes do LLM — Anthropic/OpenAI/LM Studio já são bons em parsing de tempo natural pt-BR; tool decide.
  - Tool é wrapped pelo `wrapAllPcTools` (Phase 65 D-16) p/ logging consistente.

- **D-06: Schema Zod simples: `{ delayMs: number } | { atIso: string }` + `message: string`.**
  ```ts
  z.object({
    when: z.union([
      z.object({ delayMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1000) }), // max 30 dias
      z.object({ atIso: z.string().datetime() }) // ISO 8601 (com timezone)
    ]),
    message: z.string().min(1).max(500)
  })
  ```
  LLM converte "em 30 min" → `{ delayMs: 1800000 }` ou "amanhã às 9h" → `{ atIso: '2026-05-10T09:00:00-03:00' }` antes de chamar. Backend converte ambos pra `due_at` epoch ms ao inserir no SQLite.

- **D-07: Feedback de criação/cancelamento via string pt-BR retornada pela tool.**
  - `createReminderTool` retorna ex: `"Lembrete criado pra daqui 30 minutos: revisar o PR."`
  - LLM ecoa essa string na resposta (TTS streaming já fala automaticamente via Phase 53).
  - Sem toast extra, sem SSE event de "reminder:created" — segue padrão de tools existente (Phase 65 D-16).
  - `cancelReminderTool` retorna `"Cancelado: revisar o PR."` ou `"Não achei lembrete com esse texto."`

- **D-08: Listagem/cancelamento via tools (`listRemindersTool`, `cancelReminderTool`) — sem painel UI Settings no MVP.**
  - "quais lembretes tenho?" → `listRemindersTool()` retorna lista pt-BR formatada ("1. PR review (em 30min). 2. Reunião (amanhã 14h).").
  - "cancela o do PR" → `cancelReminderTool({ query: "PR" })` faz fuzzy match em `message`. Se múltiplos resultados, retorna lista p/ LLM pedir desambiguação.
  - Fluxo voice-first; UI Settings com lista é deferred (ver `<deferred>`).

### Disparo & Quiet Hours

- **D-09: Disparo paralelo em 3 canais — Notification API + TTS + chat bubble.**
  - Quando SSE `proactive:fire` chega no desktop main:
    1. `new Notification({ title: 'Lembrete', body: message }).show()` — Electron Notification API nativa.
    2. IPC pra renderer: `proactive:tts-and-display` → renderer chama TTS streaming (kokoro/Murf via Phase 62/53) com `"Lembrete: {message}"` e renderiza bubble especial na conversa atual.
  - Bubble usa marca visual distinta (ícone clock + label "Lembrete") pra não confundir com mensagem do usuário/JARVIS.
  - Click na notif nativa → foca janela do chat (handler `notification.on('click')` chama `mainWindow.focus()`).

- **D-10: Quiet hours = uma janela cross-day persistida em electron-store.**
  - Settings nova section "Notificações proativas" com:
    - `quietHoursEnabled: boolean` (default false)
    - `quietHoursStart: string` ("HH:MM", default "22:00")
    - `quietHoursEnd: string` ("HH:MM", default "08:00")
  - Algoritmo `isInQuietHours(now, start, end)`:
    ```ts
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return startMin > endMin
      ? (nowMin >= startMin || nowMin < endMin)   // cross-midnight (ex: 22:00→08:00)
      : (nowMin >= startMin && nowMin < endMin);  // same-day (ex: 12:00→14:00)
    ```
  - Settings persiste via electron-store + apply-without-restart pattern (Phases 49+); Settings IPC `apply-quiet-hours` envia config nova ao backend-ts via `/api/settings/quiet-hours` (POST).

- **D-11: Reminder agendado dentro de quiet hours = adia até o fim do quiet (status `deferred`).**
  - Antes de disparar, `ProactiveScheduler.fire(reminder)` checa `isInQuietHours(now)`.
  - Se em quiet:
    - Calcula `deferred_until` = próximo end do quiet.
    - `UPDATE reminders SET status='deferred', deferred_until=? WHERE id=?`
    - Re-registra cron job p/ `deferred_until`.
  - No fim do quiet, dispara normalmente (`status` vira `fired`).
  - Garante que lembretes nunca são "perdidos" — o usuário criou intencionalmente.

- **D-12: TODOS os canais proativos (reminders, folder events, daily summary) respeitam quiet hours pela MESMA regra.**
  - Folder watcher: enquanto em quiet, agrega `add` events em buffer in-memory; ao sair do quiet, dispara 1 evento `folder_event` com array completo.
  - Daily summary: se horário configurado cair em quiet (raro, mas possível), adia p/ `quietHoursEnd`.
  - Sem flags separadas em Settings — uma única configuração "Quiet hours" cobre tudo (PROACT-04 fala "nenhuma notificação proativa").

### Monitor de pasta + resumo diário

- **D-13: Folder watcher monitora 1 pasta + flag `enabled` (não recursivo no MVP).**
  - Settings: `folderWatchEnabled: boolean`, `folderWatchPath: string`.
  - chokidar inicializado com `{ depth: 0 }` (ignore subpastas) — evita spam ao apontar p/ Downloads que tenha estrutura aninhada.
  - Se `enabled=true` mas path inexistente → log warn + skip; UI Settings valida path com `fs.existsSync` antes de salvar.

- **D-14: chokidar com `ignoreInitial: true` + debounce 2s pra batches.**
  - chokidar config: `{ ignoreInitial: true, persistent: true, depth: 0 }`.
  - Listener `add` event acumula em buffer com setTimeout(2000) reset a cada novo arquivo.
  - Ao expirar timer (2s sem novos arquivos), dispara evento `folder_event` com array.
  - Texto da notif/TTS:
    - 1 arquivo: `"Novo arquivo em {folderName}: {fileName}"`
    - 2-5: `"Chegaram {N} arquivos em {folderName}: {names.join(', ')}"`
    - 6+: `"Chegaram {N} arquivos em {folderName}: {first3.join(', ')} e mais {N-3}"`

- **D-15: Sem filtro de extensão + apenas `add` events.**
  - Notifica TODO arquivo novo (sem ignore patterns).
  - chokidar listener registrado **somente** em `add` (não `change`, `unlink`, `addDir`).
  - PROACT-05 explícito: "novo arquivo chega" — não cobre edição/deleção.
  - Filtro de extensão deferred (ver `<deferred>`).

- **D-16: Resumo diário gerado por LLM com memórias + actions das últimas 24h.**
  - Backend coleta:
    - Turns de chat das últimas 24h via SQLite (`memory/messages` table).
    - Actions executadas via `actions_log` (Phase 54).
    - Reminders pendentes nas próximas 24h (lookhead).
  - Chama LLM (provider configurado em Settings) com prompt:
    ```
    Você é o JARVIS. Faça um resumo curto e natural do dia anterior em pt-BR (3-5 frases).
    Inclua: o que conversamos, ações que executei, e lembretes nas próximas 24h.
    Tom: parceiro próximo, não formal. Não use bullets.

    Conversas: {messages_summary}
    Ações: {actions_summary}
    Lembretes próximas 24h: {upcoming_reminders}
    ```
  - Sem agentic task (Phase 66) — chamada LLM simples direta. Cheaper, mais rápido, suficiente p/ MVP.
  - Resultado fica em `proactiveEvent.text`, persistido na tabela `reminders` com `kind='daily_summary'` para histórico.

- **D-17: Horário do resumo diário configurável (default 09:00) + entrega TTS + bubble + Notification.**
  - Settings: `dailySummaryEnabled: boolean` (default true), `dailySummaryTime: string` ("HH:MM", default "09:00").
  - Cron expression dinâmico: `${minutes} ${hours} * * *`.
  - Quando dispara (e fora do quiet — D-12):
    1. Backend gera resumo (D-16) → emite SSE `proactive:fire` com `kind: 'daily_summary'`.
    2. Desktop main: Notification "Resumo diário pronto" + IPC pra renderer.
    3. Renderer: TTS lê o resumo completo (kokoro streaming) + cria bubble especial no chat com texto integral.
  - PROACT-06 satisfeito: "áudio + texto" simultâneos.

### Claude's Discretion

- Schema exato do `reminders` table — campos podem ser refinados na fase de research/plan (índice em `due_at`, `status`).
- Persistência de `quietHoursEnabled/Start/End` em electron-store vs SQLite — research escolhe; default electron-store por consistência com outros settings (Phase 49+).
- Política de retenção de reminders `fired`/`cancelled`: research decide (sugestão: keep últimos 90 dias para o resumo diário poder olhar histórico).
- Idempotência em duplo-fire (cron expression colide com timer manual?) — research/plan resolve com `WHERE status='pending'` no fire path.
- Formato exato do prompt do resumo diário — UI-SPEC ou research detalha; texto acima é guia, não literal.
- Texto exato dos templates pt-BR (notif title, TTS phrasing) — UI-SPEC detalha.
- Hot-reload do chokidar quando `folderWatchPath` muda em runtime — research escolhe (close + recreate vs `watcher.unwatch`/`watcher.add`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 67: JARVIS Proativo" — goal, success criteria, requirements list
- `.planning/REQUIREMENTS.md` §"PROACT-01..06" — requirements detalhados; PROACT-07/08 (recurring + auto-detect quiet) explicitamente OUT-OF-SCOPE
- `.planning/STATE.md` §"v3.0 Architecture Notes" — confirma node-cron + chokidar em backend-ts; chokidar 5.0.0 já instalado

### Padrões reusáveis (phases anteriores)
- `.planning/phases/66-agentic-tasks/66-CONTEXT.md` §"Streaming protocol" — SSE named events com `event: foo\ndata: {...}\n\n`, padrão p/ `/api/proactive/stream`
- `.planning/phases/66-agentic-tasks/66-CONTEXT.md` §"Tools registry" — como adicionar tools ao `createReactAgent` em `apps/backend-ts/src/session/tools.ts`
- `.planning/phases/65-mcp-client/65-CONTEXT.md` §"Tool wrapping" — `wrapAllPcTools` pattern para logging consistente das novas tools (createReminder, listReminders, cancelReminder)
- `.planning/phases/54-llm-actions-channel-security/54-CONTEXT.md` (se existir) ou STATE.md entry — `actions_log` table que o resumo diário lê
- `.planning/phases/53-streaming-tts/` — padrão SentenceChunker + audioContextSingleton para falar resumo/lembrete via TTS
- `.planning/phases/49-settings-layout-refactor/49-CONTEXT.md` (se existir) — SettingsSectionProps interface, Field/Switch/Input primitivos para nova section "Notificações proativas"

### Codebase entry points
- `apps/backend-ts/src/session/tools.ts` — registro de tools, onde adicionar createReminder/list/cancel
- `apps/backend-ts/src/session/chat-session.ts` — agente onde tools entram
- `apps/backend-ts/src/routes/` — onde criar `proactive.ts` (SSE stream + ack endpoint)
- `apps/backend-ts/src/memory/` — convenção Drizzle + better-sqlite3 para nova tabela
- `apps/desktop/src/main/index.ts` + `apps/desktop/src/main/backend-client.ts` — onde abrir SSE conn proativa no startup
- `apps/desktop/src/main/ipc/` — novo handler `proactive.ts` para forward SSE → renderer
- `apps/desktop/src/main/store.ts` — StoreSchema (adicionar quietHours, folderWatch, dailySummary)
- `apps/desktop/src/renderer/src/settings/` — nova section "Notificações proativas"
- `packages/ipc-types/` — discriminated union ProactiveEvent

### Stack & deps
- chokidar 5.0.0 — `apps/backend-ts/package.json` (já instalado)
- node-cron — NOVA dep (a instalar em backend-ts; STATE.md v3.0 listou como `node-cron@3.0.x`)
- Electron Notification — built-in (https://www.electronjs.org/docs/latest/api/notification)
- Drizzle ORM 0.45.2 — já em backend-ts

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`createReactAgent` + tools registry (Phase 66)** — `apps/backend-ts/src/session/tools.ts` é o lugar canônico p/ adicionar createReminder/list/cancel. `wrapAllPcTools` (Phase 65) já intercepta para logging.
- **SSE infra (Phase 60, 66)** — padrão `event: name\ndata: {...}\n\n` consolidado; renderer EventSource consumer + reconnect logic já existe em `desktop/src/main/sse-client.ts`.
- **Streaming TTS (Phase 53)** — kokoro/Murf SentenceChunker + audioContextSingleton: lembrete e resumo diário falam usando exatamente o mesmo path que respostas LLM.
- **electron-store apply-without-restart (Phases 49-57)** — pattern para todas as novas settings (quietHours, folderWatch, dailySummary).
- **SettingsSectionProps + Field/Switch/Input primitivos (Phases 48-49)** — design system pronto p/ nova section "Notificações proativas".
- **`actions_log` table (Phase 54)** — fonte de "ações executadas" para o prompt do resumo diário.
- **multi-window broadcast pattern (Phases 52-57)** — `BrowserWindow.getAllWindows()` p/ propagar `proactive:fire` quando há janelas múltiplas.
- **chokidar 5.0.0** — já instalado em `apps/backend-ts/package.json`; pronto pra usar.

### Established Patterns

- **Backend-ts é o serviço sempre-vivo** — Electron pode minimizar/dormir; backend-ts roda em Docker/PM2. Schedulers DEVEM viver no backend.
- **Tools retornam strings pt-BR + LLM ecoa** — Phase 65 D-16 estabeleceu; mantém TTS/copy consistente sem código UI extra.
- **State channels via SQLite (Drizzle) ou electron-store, nunca in-memory para dados duráveis** — sobreviver a restart é feature, não bug.
- **SSE p/ push backend→desktop, POST p/ ack/control desktop→backend** — Phase 66 padrão; mesma assimetria pra `/api/proactive`.
- **`wrapAllPcTools` para logging** — todas as novas tools entram nesse wrap (Phase 65 D-16).

### Integration Points

- `chat-session.ts` ao adicionar agent → injetar `createReminderTool, listRemindersTool, cancelReminderTool` no array.
- `apps/backend-ts/src/index.ts` (ou `app.ts`) → instanciar `ProactiveScheduler.bootstrap()` no startup.
- `apps/desktop/src/main/index.ts` → abrir SSE proativo após `backend-client.connect()`.
- `apps/desktop/src/main/store.ts` → estender StoreSchema com `quietHours`, `folderWatch`, `dailySummary`.
- `packages/ipc-types/` → adicionar `ProactiveEvent` union + `QuietHoursConfig` + `FolderWatchConfig` + `DailySummaryConfig` interfaces.
- Renderer chat → handler para bubble especial `kind: 'proactive'` no message list.

</code_context>

<specifics>
## Specific Ideas

- **"me lembra em 30 minutos de revisar o PR"** é o exemplo canônico do success criterion 1 — esse fraseado deve funcionar end-to-end.
- **Quiet hours default 22:00 → 08:00** — janela noturna típica; usuário pode editar.
- **Resumo diário default 09:00** — começo do dia produtivo.
- **Resumo diário em tom de "parceiro próximo"** — alinhado ao core value do PROJECT.md ("conversar naturalmente como um parceiro").
- **Pasta default = vazia (folderWatchEnabled=false)** — feature opt-in, não invade workflow do usuário sem configuração explícita.
- **Lembretes via tool, não slash-command** — fluxo conversacional preservado; voice-first.

</specifics>

<deferred>
## Deferred Ideas

Ideas que surgiram mas pertencem a phases futuras:

- **Recurring reminders** ("todo dia 9h faz X") — PROACT-07 explícito out-of-scope em REQUIREMENTS.md. Daily summary já cobre o caso recorrente útil; outros recurring viram phase futura.
- **Auto-detect quiet hours por plataforma** (macOS pmset, Windows Focus Assist) — PROACT-08 explícito out-of-scope.
- **Múltiplas pastas monitoradas** — defer; 1 pasta cobre o caso típico (Downloads). Se necessidade aparecer, vira phase nova.
- **Folder watch recursivo (subpastas)** — deferred; chokidar suporta nativamente, fácil de adicionar depois.
- **Filtro de extensões no folder watch** — deferred; sem filtro cobre PROACT-05.
- **Painel UI em Settings com lista de lembretes pendentes + botões cancelar** — deferred; tools voice/text cobrem fluxo principal. Pode entrar como follow-up de UX.
- **Snooze ("me lembra de novo em 10min" depois do dispatch)** — deferred; usuário pode criar novo lembrete via voz/chat.
- **Edição de lembrete existente** ("muda o lembrete do PR pra daqui 1h") — deferred; usuário cancela + cria novo.
- **Notif persistente (não auto-dismiss até interagir)** — deferred; OS-default behavior é suficiente.
- **Action buttons na Notification nativa** ("Snooze 10min" / "Done") — deferred; click na notif só foca janela.
- **Telemetria de fired/missed/snoozed** — deferred; logging básico via wrapAllPcTools cobre debugging.
- **Multi-server MCP integration no resumo diário** (puxar emails via MCP externo) — deferred; resumo MVP usa só dados locais (memórias + actions).
- **Quiet hours com dias da semana específicos** ("só weekdays") — deferred; janela única bastante.
- **Ação ao clicar na notif além de focar janela** (deep-link pra mensagem específica) — deferred.

</deferred>

---

*Phase: 67-jarvis-proativo*
*Context gathered: 2026-05-09*
