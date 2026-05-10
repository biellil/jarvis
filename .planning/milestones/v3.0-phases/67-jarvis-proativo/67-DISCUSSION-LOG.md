# Phase 67: JARVIS Proativo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 67-jarvis-proativo
**Areas discussed:** Persistência & engine, Criação/cancelamento de lembretes (UX+intent), Disparo & quiet hours, Monitor de pasta + resumo diário

---

## Persistência & engine

### Q1: Onde os reminders/jobs proativos são persistidos?

| Option | Description | Selected |
|--------|-------------|----------|
| SQLite via Drizzle (backend-ts) | Backend-ts já tem better-sqlite3 + drizzle-orm e schema p/ memory/actions. Tabela `reminders` trivial. Durável, queryable, sobrevive restart, transacional. | ✓ |
| electron-store (JSON list) | Reminders como array em electron-store no desktop. Simples, mas perde transactions, queries pesadas, e força scheduler a rodar no desktop main. | |
| In-memory (fire and forget) | Sem persistência. Reiniciar JARVIS = perde lembretes futuros. MVP enxuto mas viola "JARVIS lembra de tudo". | |

**User's choice:** SQLite via Drizzle (backend-ts)

### Q2: Engine de scheduling p/ disparar os reminders no horário certo?

| Option | Description | Selected |
|--------|-------------|----------|
| node-cron (cron expressions) | Declarativo, restart-friendly: lê pending do SQLite e registra job por reminder. Listado em STATE.md como dep v3.0. | ✓ |
| setTimeout chain por reminder | Calcula delta ms até cada due_at e dá setTimeout. Mais simples, sem dep nova — mas precisa cancelar/recriar timers ao editar. Falha se timer max excedido (~24.8 dias). | |
| node-cron p/ recurring + tabela polling p/ one-shot | Híbrido: cron só p/ resumo diário. Reminders one-shot via setInterval(60s) que faz SELECT WHERE due_at <= now(). | |

**User's choice:** node-cron (cron expressions)

### Q3: Onde roda o ProactiveScheduler (cron + chokidar) — backend-ts ou desktop main?

| Option | Description | Selected |
|--------|-------------|----------|
| backend-ts (serviço Express) | Já contém chokidar 5.0.0, SQLite, LangGraph. Coerente com STATE.md v3.0 arch. Backend-ts sempre vivo (Docker/PM2). | ✓ |
| desktop main (Electron) | Mais perto da Notification API + IPC TTS. Mas duplica chokidar, perde acesso ao SQLite memory store, quebra se Electron janela fechada. | |
| Híbrido (chokidar no backend, cron no desktop) | Folder watch no backend, cron no desktop. Mais código de ponte. | |

**User's choice:** backend-ts (serviço Express)

### Q4: Como o backend-ts comunica o disparo proativo p/ o desktop (Notification + TTS)?

| Option | Description | Selected |
|--------|-------------|----------|
| SSE dedicado /api/proactive/stream | Conexão SSE persistente que desktop main abre no startup. Reusa infra Phase 60/66 (named events, EventSource). | ✓ |
| WebSocket via canal /api/actions existente | Reusa WS já montado em Phase 54. Funciona, mas /api/actions é request/response com ACK; fluxo proativo será fire-only — mistura semântica. | |
| HTTP polling do desktop a cada 30s | Desktop main faz GET /api/proactive/pending. Simples mas até 30s de lag — quebra "horário exato". | |

**User's choice:** SSE dedicado /api/proactive/stream

---

## Criação/cancelamento de lembretes (UX+intent)

### Q1: Como o usuário cria um lembrete por voz/texto no chat?

| Option | Description | Selected |
|--------|-------------|----------|
| LangChain tool createReminderTool | Phase 66 já tem createReactAgent + tool registry. LLM chama createReminder({ delay/at, message }). Zod schema + parsing pt-BR robusto. | ✓ |
| Regex/intent classifier antes do LLM | Backend faz regex pt-BR antes do LLM. Mais rápido mas frágil — variações de fraseado quebram. | |
| Tool LangChain + comando rápido /lembra | Tool + slash-command no input box. UX power-user adicional. | |

**User's choice:** LangChain tool createReminderTool

### Q2: Como o usuário LISTA/CANCELA lembretes pendentes?

| Option | Description | Selected |
|--------|-------------|----------|
| Tools LLM: listReminders + cancelReminder | Mais 2 tools no agent. "quais lembretes tenho?" → listReminders. "cancela o do PR" → cancelReminder. Conversacional, zero UI nova. | ✓ |
| Painel UI em Settings (lista + botões delete) | Section "Lembretes" com tabela e botão cancelar. Zero LLM cost. Mas quebra fluxo voice-first. | |
| Tools LLM + painel UI Settings (ambos) | Tudo: tools p/ conversacional + painel p/ visão geral. Mais surface. | |

**User's choice:** Tools LLM: listReminders + cancelReminder

### Q3: Quando reminder é criado/cancelado, qual feedback imediato?

| Option | Description | Selected |
|--------|-------------|----------|
| Tool retorna string pt-BR + LLM ecoa | Tool retorna ex: "Lembrete criado pra 30 minutos: revisar o PR." LLM coloca isso na resposta. Padrão Phase 65 D-16. Voz fala via TTS streaming. | ✓ |
| SSE event + toast no chat | Tool emite event SSE, renderer mostra toast/chip especial. Mais visual mas duplica mensagem (LLM já vai falar). | |
| Tool string + toast não-bloqueante (mesmo modelo Phase 54) | Tool retorna string + dispara toast leve. Reusa primitivo Phase 54. | |

**User's choice:** Tool retorna string pt-BR + LLM ecoa

### Q4: Expressões de tempo aceitas pelo createReminderTool — quão flexível?

| Option | Description | Selected |
|--------|-------------|----------|
| Schema Zod simples: { delayMs } OU { atIso } | LLM já parseia "em 30 min" e "amanhã às 9h". Zero parsing pt-BR no backend. Confia no LLM. | ✓ |
| Schema natural + chrono-node parser | Tool aceita string natural pt-BR, backend usa chrono-node. Nova dep. | |
| Schema Zod estrito + recurring opcional | Como op 1 + campo opcional cron string. PROACT-07 (recurring) é OUT-OF-SCOPE. | |

**User's choice:** Schema Zod simples: { delayMs } OU { atIso }

---

## Disparo & quiet hours

### Q1: Quando reminder dispara fora de quiet hours, qual a sequência/canais de output?

| Option | Description | Selected |
|--------|-------------|----------|
| Notif nativa + TTS + chat bubble (paralelos) | Tudo simultâneo. Cobre PROACT-02/03 (notif + áudio TTS no horário exato). | ✓ |
| Notif nativa + TTS só (sem bubble) | OS notification + voz, mas não polui o chat. Perde histórico visível. | |
| Toast no app + TTS, sem notif OS | Só dentro do app + voz. Quebra PROACT-03 ("notificação nativa do Windows"). | |

**User's choice:** Notif nativa + TTS + chat bubble (paralelos)

### Q2: Configuração de quiet hours — quantas janelas e como representar?

| Option | Description | Selected |
|--------|-------------|----------|
| Uma janela cross-day (start HH:MM, end HH:MM) | Backend interpreta cross-midnight automaticamente. Cobre o caso comum (sono noturno). MVP enxuto. | ✓ |
| Uma janela + flag enabled (toggle rápido) | Como op 1 + switch. UX "Don't disturb today". | |
| Múltiplas janelas (array) | Cobre casos como almoço + noite + reunião. UI mais complexa. | |

**User's choice:** Uma janela cross-day (start HH:MM, end HH:MM)

### Q3: Reminder agendado cai DENTRO do quiet hours. Comportamento?

| Option | Description | Selected |
|--------|-------------|----------|
| Adia até o fim do quiet hours | Status "deferred". Garante que o lembrete acontece (cumpre intuição do usuário). | ✓ |
| Suprime totalmente (silencia & marca fired) | Lembrete pula. Simples mas viola intenção (criou lembrete, não quer perder). | |
| Só notif visual silenciosa, sem TTS | OS notification sem som + sem TTS. Electron silent não é confiável cross-platform. | |

**User's choice:** Adia até o fim do quiet hours

### Q4: Notificações proativas que NÃO são lembretes (folder watcher, resumo diário) durante quiet hours?

| Option | Description | Selected |
|--------|-------------|----------|
| Tudo segue mesma regra (silencia/adia) | Folder watcher e resumo diário respeitam quiet igual. Watcher agrega arquivos novos e dispara um único resumo no fim. | ✓ |
| Folder watcher silencia; resumo diário respeita | Watcher só ignora durante quiet (sem agregar). Mais simples mas perde notifs. | |
| Cada tipo tem flag separada em Settings | Toggles independentes. Mais control mas UI mais densa. | |

**User's choice:** Tudo segue mesma regra (silencia/adia)

---

## Monitor de pasta + resumo diário

### Q1: Folder watcher — quantas pastas e escopo de configuração?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 pasta + flag enabled | Settings: "Pasta monitorada: <path>" + toggle. MVP. Cobre critério ("pasta configurada", singular). | ✓ |
| N pastas (array de configs) | Lista de pastas com toggle individual. UI mais complexa. | |
| 1 pasta + recursivo opcional | Como op 1 + checkbox "incluir subpastas". | |

**User's choice:** 1 pasta + flag enabled

### Q2: Estado inicial e throttling do folder watcher?

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot inicial silencioso + debounce 2s p/ batches | chokidar com ignoreInitial: true + agrupa <2s em 1 notif. Sem spam. | ✓ |
| Snapshot inicial silencioso + 1 notif por arquivo | ignoreInitial:true mas cada add = uma notif. Pode floodar. | |
| Notifica tudo na primeira execução + debounce | ignoreInitial:false. Spam inicial gigante. | |

**User's choice:** Snapshot inicial silencioso + debounce 2s p/ batches

### Q3: Resumo diário — que dados entram?

| Option | Description | Selected |
|--------|-------------|----------|
| Memórias + ações do dia (LLM gera) | Backend coleta turns de chat + actions + lembretes próximas 24h. LLM gera 3-5 frases pt-BR. | ✓ |
| Só lembretes pendentes nas próximas 24h | Sem LLM, determinístico. Mais barato mas pobre — não reflete "resumo do dia". | |
| LLM + dados + agentic task | Spawna LangGraph task com tools (memory, MCP). Mais poderoso mas overhead. | |

**User's choice:** Memórias + ações do dia (LLM gera)

### Q4: Horário do resumo diário + formato de entrega?

| Option | Description | Selected |
|--------|-------------|----------|
| Horário config (default 09:00) + áudio TTS + texto na conversa | Cron `0 9 * * *`. kokoro lê + bubble + Notification. Cobre PROACT-06 ("áudio + texto"). | ✓ |
| Horário config + só texto (sem TTS) | Bubble + Notification, sem fala. Viola PROACT-06. | |
| Horário config + flag opcional "falar resumo" | Toggle "Falar resumo em voz alta". Default on. Mais flexível. | |

**User's choice:** Horário config (default 09:00) + áudio TTS + texto na conversa

### Q5: Filtros do folder watcher e tamanho da janela "arquivo novo"?

| Option | Description | Selected |
|--------|-------------|----------|
| Sem filtro de extensão + só "add" events (não change/unlink) | Notifica TODO arquivo novo. UI Settings simples. PROACT-05 fala "novo arquivo chega". | ✓ |
| Filtro de extensões opcional + só add | Settings: campo "extensões". Mais control mas mais UI. | |
| Filtro extensões + add/change/unlink (3 tipos) | Notifs separadas. Mais ruído. | |

**User's choice:** Sem filtro de extensão + só "add" events (não change/unlink)

---

## Claude's Discretion

Áreas onde Claude tem flexibilidade durante research/plan:

- Schema exato da tabela `reminders` (índices, tipos refinados)
- Persistência de quietHours em electron-store vs SQLite
- Política de retenção de reminders fired/cancelled
- Idempotência em duplo-fire (cron x timer manual)
- Texto exato do prompt do resumo diário
- Templates pt-BR (notif title, TTS phrasing)
- Hot-reload do chokidar quando folderWatchPath muda

## Deferred Ideas

Ideas mencionadas durante a discussão que viraram phases futuras:

- Recurring reminders (PROACT-07 out-of-scope)
- Auto-detect quiet hours por plataforma (PROACT-08 out-of-scope)
- Múltiplas pastas monitoradas
- Folder watch recursivo
- Filtro de extensões
- Painel UI em Settings com lista de lembretes
- Snooze, edição de lembrete existente
- Telemetria fired/missed
- Action buttons na Notification nativa
- MCP integration no resumo diário (emails)
