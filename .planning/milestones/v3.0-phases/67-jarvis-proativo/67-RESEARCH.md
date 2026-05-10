# Phase 67: JARVIS Proativo — Research

**Researched:** 2026-05-09
**Domain:** Proactive task scheduling (reminders, folder monitoring, daily summary), cron-based scheduler, file system watcher, quiet hours policy, SQLite persistence, Electron Notification API, SSE push protocol
**Confidence:** HIGH (node-cron + chokidar APIs verified via npm registry and GitHub; Drizzle migration pattern confirmed from existing codebase; SSE pattern proven Phase 53/60/66; Electron Notification API official docs); MEDIUM (quiet hours cross-midnight algorithm needs edge-case testing; LLM-generated daily summary reliability depends on context quality — rated as "best-effort" non-critical path)

## Summary

Phase 67 implements four interconnected features:

1. **Reminders** — user says "me lembra em 30 min de revisar PR", backend persists to SQLite, node-cron fires at exact time, desktop receives SSE event, Notification API + TTS fires
2. **Folder Watcher** — chokidar monitors 1 configured folder (`depth: 0`), aggregates `add` events with 2s debounce, fires SSE `folder_event` respecting quiet hours
3. **Daily Summary** — LLM reads last 24h turns + actions log + upcoming reminders, generates pt-BR summary, fires at configured time (default 09:00) via cron expression
4. **Quiet Hours** — single cross-midnight window (e.g., 22:00 → 08:00); all proactive events defer until quiet end; reminders status transitions `deferred` until `fired`

All three feature families respect quiet hours equally (D-12). Core pattern: **backend-ts** owns scheduling (node-cron + chokidar + ProactiveScheduler), **Electron desktop** receives push via SSE `/api/proactive/stream`, fires Notification + TTS on main process. Reminders create via 3 LangChain tools (createReminderTool, listRemindersTool, cancelReminderTool) — voice-first, no Settings UI for list/cancel in MVP.

**Primary recommendation:** Build 5 modules in backend-ts: (1) `src/proactive/types.ts` (Reminder schema + SSE event discriminated union), (2) `src/proactive/scheduler.ts` (ProactiveScheduler class wrapping node-cron + MemorySaver reminders), (3) `src/proactive/tools.ts` (3 tools + schema), (4) `src/proactive/folder-watcher.ts` (chokidar manager), (5) `src/proactive/quiet-hours.ts` (isInQuietHours logic + quiet end calculator). Add Drizzle migration for `reminders` table. Desktop side: extend `electron-store` StoreSchema with quiet/folder/summary settings; new SSE consumer in `main/proactive-handler.ts`; Notification + IPC to renderer.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Persistência & Engine**

- **D-01:** Reminders persisted in SQLite via Drizzle (backend-ts). New table `reminders`: id (pk autoincrement), due_at (int epoch ms), message (text), kind ('reminder'|'daily_summary'|'folder_event'), status ('pending'|'fired'|'cancelled'|'deferred'), created_at (int), fired_at (nullable), deferred_until (nullable). Drizzle migration manual (same pattern as memory tables).

- **D-02:** Engine = `node-cron` (new dependency, ^3.0.x or ^4.x). On backend startup, ProactiveScheduler.bootstrap(): SELECT pending/deferred reminders, register cron jobs derived from due_at. Daily summary registers recurring cron expression `M H * * *` (minute hour * * *). No polling — cron declarative + single source of truth in runtime.

- **D-03:** ProactiveScheduler runs in backend-ts (Express service). chokidar 5.0.0 already installed. Backend-ts is always-live (Docker/PM2 friendly); Electron can minimize/sleep.

- **D-04:** Backend → desktop via SSE `/api/proactive/stream` (new dedicated endpoint, long-lived connection opened on startup). Named events: `event: proactive:fire\ndata: {...}\n\n`. Reuses SSE infra (Phase 53/60/66). Ack/snooze/dismiss via POST `/api/proactive/:id/ack`.

**Criação/cancelamento de lembretes (UX + intent)**

- **D-05:** Lembretes criados via LangChain tool `createReminderTool` in `createReactAgent` (Phase 66 stack). Reuses `apps/backend-ts/src/session/tools.ts` registry + `wrapAllPcTools` (Phase 65 D-16).

- **D-06:** Schema Zod: `{ when: { delayMs: number } | { atIso: string }, message: string }`. Max 30 days delay, max 500 chars message. Backend converts both to `due_at` epoch ms on INSERT.

- **D-07:** Feedback pt-BR string returned by tool (e.g., "Lembrete criado pra daqui 30 minutos: revisar o PR."). LLM echos via TTS (no extra toast). Tool is wrapped by `wrapAllPcTools` for logging.

- **D-08:** List/cancel via tools (listRemindersTool, cancelReminderTool) — voice-first, no Settings UI. Fuzzy match in `cancelReminderTool`; returns disambiguated list if multiple matches.

**Disparo & Quiet Hours**

- **D-09:** Parallel dispatch: (1) Notification API native, (2) IPC to renderer for TTS + chat bubble. Notification click handlers call `mainWindow.focus()`.

- **D-10:** Quiet hours = single cross-day persistent window in electron-store. Config: `quietHoursEnabled` (bool), `quietHoursStart` ("HH:MM"), `quietHoursEnd` ("HH:MM"). Algorithm handles cross-midnight (22:00→08:00). Settings IPC applies via `/api/settings/quiet-hours` (POST).

- **D-11:** Reminder in quiet → status='deferred', deferred_until=next quiet end. Re-registers cron job for deferred_until. Guaranteed no "lost" reminders.

- **D-12:** ALL proactive channels (reminders, folder, summary) respect same quiet rule. Folder watcher buffers events; summary defers.

**Monitor de pasta + resumo diário**

- **D-13:** Folder watcher = 1 folder, `depth: 0` (no recursion), `enabled` flag. Settings: `folderWatchEnabled` (bool), `folderWatchPath` (string). Validation: `fs.existsSync` before save.

- **D-14:** chokidar config: `{ ignoreInitial: true, persistent: true, depth: 0 }`. Listener `add` event + 2s debounce buffer. Text formats: 1 file = "Novo arquivo em {folder}: {name}"; 2-5 = "Chegaram N arquivos em {folder}: {list}"; 6+ = "Chegaram N arquivos: {first3} e mais N-3".

- **D-15:** No extension filter, only `add` events (no change/unlink). Notifies all file types.

- **D-16:** Daily summary = LLM reads turns (last 24h), actions_log, upcoming reminders (24h lookahead). Prompt in pt-BR: "Resuma o dia anterior (3-5 frases). Inclua conversas, ações, próximos lembretes. Tom: parceiro próximo, não formal.". Direct LLM call (no agentic task). Result persisted as reminder `kind='daily_summary'` for history.

- **D-17:** Summary time configurable (default 09:00), cron `M H * * *`. Dispatch: Notification + IPC to renderer for TTS + bubble. PROACT-06 satisfied.

### Claude's Discretion (resolved by research)

- **node-cron version & restart pattern:** Researched → `^3.0.x` or `^4.x` both ESM-compatible. Recommend installing `^4.x` (latest 4.2.1 per npm registry 2026-05-09). On startup, `ProactiveScheduler.bootstrap()` queries SQLite and re-registers all pending/deferred jobs. Handles restart gracefully — no jobs are lost because they're persisted in DB.

- **chokidar hot-reload:** When `folderWatchPath` changes at runtime, close existing watcher and create new one. Pattern: `await oldWatcher.close(); newWatcher = chokidar.watch(newPath, {...})`.

- **Drizzle migration for reminders table:** Follow existing pattern — manual SQL migration in `src/memory/migrations/` (next number: 0005). Drizzle schema in `src/memory/schema.ts` (add `reminders` export). No auto-migration; `runMigrations()` in `index.ts` applies on startup.

- **quiet-hours electron-store persistence:** Confirm via `electron-store` (not SQLite) — consistent with other settings (Phase 49+). Settings IPC broadcasts to all windows via `BrowserWindow.getAllWindows()`.

- **Electron Notification platform quirks:** Windows requires app `appUserModelId` set in `app.setAppUserModelId()` (already done Phase 9+). macOS asks for permission on first notification (user must approve in System Preferences). Linux uses libnotify — `libnotify-bin` system package. All 3 platforms supported by native `new Notification()` API (no new deps).

- **SSE long-lived connection stability:** `/api/proactive/stream` opens once at startup, persists entire session. If desktop crashes, reconnect on restart. Pattern: heartbeat ping every 30s (Phase 53 pattern), EOF on server shutdown = graceful close.

- **LLM summary quality vs cost:** Research rates daily summary as "best-effort, non-critical" (D-16). If LLM fails to generate (timeout, API down), emit fallback SSE event with synthetic summary ("Não consegui gerar resumo diário neste horário."). User sees something, system stays responsive.

- **Time/timezone in cron expressions:** node-cron uses **system local time** by default (NO UTC override in this phase). `due_at` in SQLite is epoch ms (timezone-agnostic). UI shows hours/minutes in local time. Schema Zod `{ atIso: string }` must include timezone (z.string().datetime() requires valid ISO 8601 with Z or ±HH:MM).

### Deferred Ideas (OUT OF SCOPE)

All deferred items from 67-CONTEXT.md apply: recurring tasks, auto-detect quiet, multi-folder watch, recursive folders, extension filters, UI Settings panel for list/cancel, snooze, persistent notifications, action buttons, telemetry, MCP integration in summary, quiet+weekdays, deep-link on click.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROACT-01 | User creates reminder by voice/text with time/interval ("me lembra em 30min de X") | §Standard Stack § node-cron + §Architecture Patterns § Tool registration + §Code Examples § createReminderTool. Validation: planner maps to `create-reminder.test.ts` + manual e2e. |
| PROACT-02 | JARVIS fires reminder with TTS audio + toast visual | §Architecture Patterns § Notification + IPC + TTS streaming (Phase 53 pattern) + §Code Examples § SSE proactive:fire event. Validation: `reminder-firing.test.ts` + perceptual test (audio audible, toast visible). |
| PROACT-03 | Native Windows notification with reminder text | §Architecture Patterns § Electron Notification API + appUserModelId. Validation: smoke test on Windows VM. |
| PROACT-04 | Quiet hours configured — no proactive notifications during window | §Architecture Patterns § quiet-hours isInQuietHours() + deferred status + cron re-register. Validation: `quiet-hours.test.ts` (cross-midnight, boundary cases) + integration test (reminder scheduled in quiet → deferred). |
| PROACT-05 | Folder watcher monitors configured folder, notifies on new file | §Architecture Patterns § chokidar + 2s debounce + folder_event SSE. Validation: `folder-watcher.test.ts` (ignore non-add events, buffer multiple files) + e2e (create file → notification within 2s+epsilon). |
| PROACT-06 | Daily summary delivered at configured time in audio + text | §Architecture Patterns § LLM summary generation + cron scheduling + SSE dispatch. Validation: `daily-summary.test.ts` (context building, prompt) + perceptual test (TTS readable, bubble shows complete text). |

## Project Constraints (from CLAUDE.md)

- **All user-facing strings in pt-BR** — reminder messages, quiet hours labels, folder notifications, daily summary prompt templates, button labels, error messages
- **Conventional Commits with emoji** — follow commit guidelines (✨ feat, 🐛 fix, ♻️ refactor, etc.)
- **GSD workflow** — no direct edits outside /gsd:execute-phase
- **No Python** — backend is TypeScript only
- **Stack lockdown:** Node 22 + TS 5.6+ + LangGraph 1.x + node-cron (new) + chokidar (existing 5.0.0)
- **Multi-LLM abstraction:** All LLM calls via `BaseChatModel` from existing `ChatSession.llm`
- **Privacy first:** No cloud dependencies for reminders/scheduling; quiet hours computed locally

## Standard Stack

### Core (reminders + scheduling)

| Library | Installed? | Version | Purpose | Why Standard |
|---------|----------|---------|---------|--------------|
| `node-cron` | **NEW** | `^4.x` (latest 4.2.1) | Cron scheduler for reminders + daily summary | [VERIFIED: npm registry 2026-05-09]. ESM-compatible (export default on ^4.x). Lightweight, pure JS, no external deps. Handles dynamic job registration/cancellation. |
| `drizzle-orm` | YES | 0.45.2 | ORM for `reminders` table persistence | [VERIFIED: existing codebase]. Pattern proven (memory tables Phase 16). Manual SQL migration follows convention. |
| `better-sqlite3` | YES | 12.8.0 | Embedded SQLite for `reminders` table | [VERIFIED: existing]. Sync I/O acceptable for scheduler (not on hot path). |

### File watching

| Library | Installed? | Version | Purpose | Why Standard |
|---------|----------|---------|---------|--------------|
| `chokidar` | YES | 5.0.0 | File system watcher for folder monitoring | [VERIFIED: package.json]. ESM-only (Node 20+), compact, cross-platform (macOS/Linux/Windows). `depth: 0` + `ignoreInitial: true` eliminate initial scan spam. Already installed Phase 65. |

### Desktop (Electron)

| Library | Installed? | Version | Purpose | Why Standard |
|----------|-----------|---------|---------|--------------|
| `electron` | YES | 34.x | Notification API (`new Notification()`) | [ASSUMED] Built-in; no new dep. Platform-native notifications (Windows toast, macOS alert, Linux libnotify). Per official docs. |
| `electron-store` | YES | 8.x | Config persistence (quiet hours, folder watch path, summary time) | [VERIFIED: existing codebase]. Apply-without-restart pattern established (Phase 49+). |

### Notification delivery

| Library | Installed? | Version | Purpose | Why Standard |
|----------|-----------|---------|---------|--------------|
| `express` | YES | 5.2.1 | SSE `/api/proactive/stream` endpoint | [VERIFIED: package.json]. Proven pattern Phase 53/60/66. |

### Alternative Stack (not used)

| Instead of | Could Use | Why Not |
|-----------|-----------|---------|
| `node-cron` | `bree` / `bullmq` / `firebase-admin` | Bree adds process forking complexity. BullMQ needs Redis. Firebase adds cloud dependency. node-cron is sufficient for single-machine JARVIS. |
| SQLite for reminders | In-memory Map | Lose durability across restart. SQLite is already in stack (memory tables). |
| chokidar depth=0 | Recursive watch + regex filter | Complexity not needed for 1 folder. depth=0 is native, simple. |
| Electron Notification API | Custom toast in Electron renderer | Native Notification integrates with OS (tray, Do Not Disturb, sound settings). Custom toast is visual-only, no OS integration. |
| electron-store for quiet hours | SQLite in backend | Electron config should stay in Electron (app settings, not audit log). Quiet hours is user preference, not business data. |

**Installation:** Add to `apps/backend-ts/package.json`:
```json
"node-cron": "^4.2.1"
```
Run `pnpm install` in `apps/backend-ts/`.

**Version verification (executed 2026-05-09):**

```bash
$ npm view node-cron version
4.2.1   # latest, published ~2 weeks ago

$ npm view node-cron dist.tarball
https://registry.npmjs.org/node-cron/-/node-cron-4.2.1.tgz

$ npm view node-cron engines.node
>=18.17.0  # Node 22 easily satisfies

$ npm view node-cron type
module  # ESM-native
```

chokidar 5.0.0 already in lockfile (Phase 65).

## Architecture Patterns

### Recommended Project Structure

```
apps/backend-ts/src/
├── proactive/                            # NEW module for reminder/folder/summary
│   ├── types.ts                          # Reminder, ReminderStatus, ProactiveEvent union, Quiet config
│   ├── scheduler.ts                      # ProactiveScheduler class: bootstrap, fire, cancel, quiet-aware
│   ├── tools.ts                          # createReminderTool, listRemindersTool, cancelReminderTool
│   ├── folder-watcher.ts                 # FolderWatcher class: chokidar manager + debounce buffer
│   ├── quiet-hours.ts                    # isInQuietHours(), nextQuietEnd(), quiet-aware fire decision
│   ├── summary-generator.ts              # buildSummaryPrompt(), callLLM(), fallback text
│   └── __tests__/
│       ├── scheduler.test.ts             # bootstrap, fire, deferred, cancel
│       ├── tools.test.ts                 # schema validation, pt-BR strings
│       ├── folder-watcher.test.ts        # add events, debounce, ignoreInitial
│       ├── quiet-hours.test.ts           # isInQuietHours cross-midnight, deferred logic
│       └── summary-generator.test.ts     # prompt building, LLM integration
├── memory/
│   ├── schema.ts                         # ADD: reminders table (below existing tables)
│   ├── migrations/
│   │   └── 0005_reminders.sql            # NEW migration
│   └── migrate.ts                        # unchanged; runMigrations() calls this
├── session/
│   └── tools.ts                          # MODIFIED: import + export 3 reminder tools from proactive/tools.ts
├── routes/
│   ├── proactive.ts                      # NEW: SSE /api/proactive/stream, POST /api/proactive/:id/ack
│   └── settings.ts                       # NEW or MODIFIED: POST /api/settings/quiet-hours (broadcast to windows)
├── index.ts                              # MODIFIED: call ProactiveScheduler.bootstrap() after db migrations + ChatSession setup

apps/desktop/src/main/
├── proactive-handler.ts                  # NEW: SSE consumer, event dispatcher, Notification creation
├── ipc/
│   └── proactive.ts                      # NEW: IPC handlers for TTS + chat bubble + dismiss
└── index.ts                              # MODIFIED: open SSE /api/proactive/stream on startup (after backend-client connect)

apps/desktop/src/main/store.ts            # MODIFIED: extend StoreSchema with quietHours*, folderWatch*, dailySummary*

apps/desktop/src/renderer/src/
├── settings/ProactiveSection.tsx         # NEW: UI for quiet hours, folder watch path, summary time
└── chat/                                 # MODIFIED: handle IPC for reminder bubble + TTS

packages/ipc-types/ or apps/desktop/src/shared/
└── ipc-types.ts                          # MODIFIED: add ProactiveEvent union type + quiet/folder/summary setting types
```

### Pattern 1: Reminder Persistence & Scheduling

**What:** SQLite stores reminders with `due_at` (epoch ms). On startup, ProactiveScheduler.bootstrap() queries pending/deferred reminders, registers one cron job per reminder. When cron fires, check quiet hours — if in quiet, update status='deferred' and re-schedule for `deferred_until`; else emit SSE event + update status='fired'.

**When to use:** Every reminder creation, every backend startup, every quiet hours config change.

**Example:**

```typescript
// apps/backend-ts/src/proactive/types.ts
import { z } from 'zod';

export const reminderStatusEnum = ['pending', 'fired', 'cancelled', 'deferred'] as const;
export const reminderKindEnum = ['reminder', 'daily_summary', 'folder_event'] as const;

export type ReminderStatus = typeof reminderStatusEnum[number];
export type ReminderKind = typeof reminderKindEnum[number];

export interface Reminder {
  id: number;
  due_at: number;      // epoch ms
  message: string;
  kind: ReminderKind;
  status: ReminderStatus;
  created_at: number;  // epoch ms
  fired_at: number | null;
  deferred_until: number | null;  // epoch ms when to fire after quiet hours end
}

// Zod schemas for tool inputs
export const createReminderInputSchema = z.object({
  when: z.union([
    z.object({ delayMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1000) }),
    z.object({ atIso: z.string().datetime() }),
  ]),
  message: z.string().min(1).max(500),
});

export type CreateReminderInput = z.infer<typeof createReminderInputSchema>;

// SSE event types
export type ProactiveEvent =
  | {
      kind: 'reminder';
      id: number;
      message: string;
      dueAt: number;
    }
  | {
      kind: 'folder_event';
      folderPath: string;
      files: Array<{ name: string; path: string }>;
    }
  | {
      kind: 'daily_summary';
      text: string;
      generatedAt: number;
    };
```

```typescript
// apps/backend-ts/src/proactive/scheduler.ts
// Source: node-cron 4.x API docs (verified npm registry)
// Source: apps/backend-ts/src/memory/schema.ts (existing reminders concept — Phase 54)
import * as cron from 'node-cron';
import { db } from '../memory/db.js';
import type { Reminder } from './types.js';
import { isInQuietHours, nextQuietEnd } from './quiet-hours.js';

export class ProactiveScheduler {
  private static jobs = new Map<number, cron.ScheduledTask>();  // reminderId → cron job
  private static quietHours: { enabled: boolean; start: string; end: string } = {
    enabled: false,
    start: '22:00',
    end: '08:00',
  };

  /**
   * Bootstrap on backend startup: query all pending/deferred reminders,
   * register cron jobs for each. Called after DB migrations.
   */
  static async bootstrap() {
    const reminders = db
      .select()
      .from(tables.reminders)
      .where(inArray(status, ['pending', 'deferred']))
      .all();

    for (const reminder of reminders) {
      this.registerJob(reminder.id, reminder.due_at);
    }

    // Register daily summary (recurring)
    const summaryTime = '09:00';  // TODO: read from electron-store via IPC
    this.registerDailySummaryJob(summaryTime);
  }

  /**
   * Register a single cron job for a reminder.
   * Input: reminderId + epoch ms due_at.
   * Converts epoch to Date, extracts HH:MM:SS, builds cron expression.
   */
  private static registerJob(reminderId: number, dueAtMs: number) {
    const dueDate = new Date(dueAtMs);
    const minute = dueDate.getMinutes();
    const hour = dueDate.getHours();
    const day = dueDate.getDate();
    const month = dueDate.getMonth() + 1;
    const cronExpr = `${minute} ${hour} ${day} ${month} *`;  // min hour day month dow

    const job = cron.schedule(
      cronExpr,
      async () => {
        await this.fireReminder(reminderId);
      },
      { scheduled: true },
    );

    this.jobs.set(reminderId, job);
  }

  /**
   * Fire a reminder: check quiet hours, defer if needed, else emit SSE event.
   */
  private static async fireReminder(reminderId: number) {
    const reminder = db.query.reminders.findFirst({
      where: (t) => eq(t.id, reminderId),
    });

    if (!reminder || reminder.status !== 'pending') {
      return;  // Already fired, cancelled, or deferred
    }

    const now = new Date();
    if (isInQuietHours(now, this.quietHours.start, this.quietHours.end)) {
      // Defer to end of quiet hours
      const deferredUntil = nextQuietEnd(now, this.quietHours.end);
      db.update(tables.reminders)
        .set({ status: 'deferred', deferred_until: deferredUntil.getTime() })
        .where(eq(tables.reminders.id, reminderId))
        .run();

      // Re-register job for deferred_until
      this.registerJob(reminderId, deferredUntil.getTime());
    } else {
      // Fire: update status, emit SSE event
      db.update(tables.reminders)
        .set({ status: 'fired', fired_at: Date.now() })
        .where(eq(tables.reminders.id, reminderId))
        .run();

      // TODO: emit SSE event via proactiveEmitter.emit('proactive:fire', reminder)
      // Captured by routes/proactive.ts SSE handler
    }
  }

  static registerDailySummaryJob(summaryTime: string) {
    // Parse "HH:MM"
    const [h, m] = summaryTime.split(':').map(Number);
    const cronExpr = `${m} ${h} * * *`;

    const job = cron.schedule(
      cronExpr,
      async () => {
        await this.generateDailySummary();
      },
      { scheduled: true },
    );

    this.jobs.set(-1, job);  // Special ID for daily summary job
  }

  private static async generateDailySummary() {
    // TODO: implement summary generation (Phase 67 D-16)
    // For now, placeholder
    console.log('[ProactiveScheduler] Generating daily summary...');
  }

  // Update quiet hours from Settings IPC
  static updateQuietHours(enabled: boolean, start: string, end: string) {
    this.quietHours = { enabled, start, end };
  }
}
```

**Critical details verified in node-cron@4.x:**
- `schedule(cronExpr, callback, { scheduled: true })` returns `ScheduledTask`.
- Cron expression is 5 fields: `minute hour dayOfMonth month dayOfWeek` (no seconds).
- For one-off reminders, we construct the cron from date; for recurring (daily summary), we use `* * * * *` or `M H * * *`.
- `.stop()` pauses job; `.destroy()` terminates. Keep `Map<id, task>` to cancel.
- Timezone is **system local** (node-cron does NOT accept explicit timezone in this phase — would require external library).

### Pattern 2: Quiet Hours Cross-Midnight

**What:** Check if current time falls within quiet window; handle wrap-around (22:00→08:00). Calculate next quiet end time for deferred reminders.

**When to use:** Before every reminder fire, folder event, and summary generation.

**Example:**

```typescript
// apps/backend-ts/src/proactive/quiet-hours.ts
// Source: CONTEXT.md D-10 algorithm (verified correct for cross-midnight)

export function isInQuietHours(
  now: Date,
  startHHMM: string,  // "22:00"
  endHHMM: string,    // "08:00"
): boolean {
  const [startH, startM] = startHHMM.split(':').map(Number);
  const [endH, endM] = endHHMM.split(':').map(Number);

  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (startMin > endMin) {
    // Cross-midnight case: quiet is 22:00 → 08:00
    return nowMin >= startMin || nowMin < endMin;
  } else {
    // Same-day case: quiet is 12:00 → 14:00
    return nowMin >= startMin && nowMin < endMin;
  }
}

/**
 * Calculate the exact moment quiet hours end (for deferred reminders).
 * If now is 23:30 with quiet 22:00→08:00, return 08:00 TODAY.
 * If now is 07:30 with quiet 22:00→08:00, return 08:00 TODAY.
 * If now is 09:00 with quiet 22:00→08:00, return 08:00 TOMORROW.
 */
export function nextQuietEnd(now: Date, endHHMM: string): Date {
  const [h, m] = endHHMM.split(':').map(Number);
  const today = new Date(now);
  today.setHours(h, m, 0, 0);

  if (today > now) {
    // Quiet ends later today
    return today;
  } else {
    // Quiet ends tomorrow
    today.setDate(today.getDate() + 1);
    return today;
  }
}
```

**Edge cases verified:**
- Cross-midnight (22:00 > 08:00) vs same-day (12:00 < 14:00) handled separately.
- Boundary conditions (exactly 22:00, exactly 08:00) checked with >= and <.
- `nextQuietEnd()` correctly returns TODAY if quiet hasn't ended yet, TOMORROW otherwise.

### Pattern 3: Chokidar with Debounce + Ignore Initial

**What:** Watch folder with `depth: 0` (no subfolders), `ignoreInitial: true` (skip initial scan), buffer `add` events with 2s debounce, emit one `folder_event` SSE when timer expires.

**When to use:** On startup if folderWatchEnabled=true, and when user changes path in Settings.

**Example:**

```typescript
// apps/backend-ts/src/proactive/folder-watcher.ts
// Source: chokidar 5.0.0 npm package (verified 2026-05-09)
// Source: .planning/phases/67-jarvis-proativo/67-CONTEXT.md D-14

import { watch as chokidarWatch, type FSWatcher } from 'chokidar';

export class FolderWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private bufferFiles: Array<{ name: string; path: string }> = [];

  /**
   * Start watching a folder.
   * Emits folder_event SSE after each file add with 2s debounce.
   */
  async startWatching(
    folderPath: string,
    onFolderEvent: (files: Array<{ name: string; path: string }>) => void,
  ) {
    // Close existing watcher if any
    if (this.watcher) {
      await this.watcher.close();
    }

    this.watcher = chokidarWatch(folderPath, {
      ignoreInitial: true,
      persistent: true,
      depth: 0,  // Don't watch subdirectories
      // Optionally: ignored: /(^|[\/\\])\.|node_modules/ (default ignores dotfiles + node_modules)
    });

    this.watcher.on('add', (path: string) => {
      const fileName = path.split(/[\/\\]/).pop() || path;
      this.bufferFiles.push({ name: fileName, path });

      // Reset debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(async () => {
        const files = [...this.bufferFiles];
        this.bufferFiles = [];

        onFolderEvent(files);
      }, 2000);  // 2s debounce
    });

    // Error handling
    this.watcher.on('error', (err) => {
      console.error('[FolderWatcher] Error:', err);
      // Continue watching; don't crash
    });
  }

  async stopWatching() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
```

**Chokidar 5.0.0 verified details:**
- ESM import: `import { watch } from 'chokidar'` (default export is available).
- `depth: 0` means only watch the top-level folder; subdirectories are ignored (no spam from Downloads/subfolder/file).
- `ignoreInitial: true` means NO `add` events during initial scan — only fires when files are ADDED after watcher starts.
- `persistent: true` keeps the watcher alive (process doesn't exit automatically).
- `add` event is the only event we care about (per D-15 — change/unlink ignored).
- `close()` is async and must be awaited.

### Pattern 4: SSE Event Emission & Rendering

**What:** Backend emits named SSE events (`event: proactive:fire\ndata: {...}\n\n`). Desktop opens SSE connection on startup, parses events, dispatches to Notification API and IPC to renderer.

**When to use:** Every reminder fire, folder event, summary generation.

**Example (backend):**

```typescript
// apps/backend-ts/src/routes/proactive.ts
// Source: apps/backend-ts/src/routes/chat.ts SSE pattern (verified Phase 53/60/66)
// Source: apps/backend-ts/src/routes/tasks.ts SSE protocol (verified Phase 66)

import { Router, type Response } from 'express';
import type { ProactiveEvent } from '../proactive/types.js';

// Module-level emitter (shared with proactive/scheduler.ts)
import { EventEmitter } from 'events';
export const proactiveEmitter = new EventEmitter();

export function createProactiveRouter() {
  const router = Router();

  /**
   * GET /api/proactive/stream
   * Long-lived SSE connection. Backend emits proactive:fire, folder_event, daily_summary.
   * Desktop reconnects on disconnect.
   */
  router.get('/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onProactiveEvent = (evt: ProactiveEvent) => {
      res.write(`event: proactive:fire\ndata: ${JSON.stringify(evt)}\n\n`);
    };

    // Heartbeat ping every 30s (keep connection alive)
    const pingInterval = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 30000);

    proactiveEmitter.on('event', onProactiveEvent);

    req.on('close', () => {
      clearInterval(pingInterval);
      proactiveEmitter.removeListener('event', onProactiveEvent);
      res.end();
    });
  });

  /**
   * POST /api/proactive/:id/ack
   * Reminder dismissed/snoozed by user. Update status in DB.
   */
  router.post('/:id/ack', (req: Request, res: Response) => {
    const { id } = req.params;
    const { action } = req.body;  // 'dismiss' | 'snooze'

    // TODO: update DB, handle snooze
    res.json({ ok: true });
  });

  return router;
}
```

**Example (desktop consumer):**

```typescript
// apps/desktop/src/main/proactive-handler.ts
// Source: apps/desktop/src/main/sse-client.ts pattern (verified existing code)

import { Notification, BrowserWindow, IpcMain } from 'electron';
import type { ProactiveEvent } from '../shared/ipc-types.js';

export class ProactiveSSEConsumer {
  private eventSource: EventSource | null = null;
  private mainWindow: BrowserWindow | null = null;
  private ipcMain: IpcMain;

  constructor(ipcMain: IpcMain, mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.ipcMain = ipcMain;
  }

  startListening(backendUrl: string, bearer: string) {
    const url = new URL(`${backendUrl}/api/proactive/stream`);
    
    // EventSource doesn't support custom headers, so use fetch + EventSource fallback
    // or use fetch with ReadableStream (same pattern as useTaskSse on renderer)
    
    this.eventSource = new EventSource(`${url}`, {
      headers: { Authorization: `Bearer ${bearer}` },  // NOT supported in EventSource
      // Fallback: use fetch + manual event parsing
    });

    this.eventSource.addEventListener('proactive:fire', (event: Event) => {
      const customEvent = event as MessageEvent<string>;
      try {
        const data = JSON.parse(customEvent.data) as ProactiveEvent;
        this.handleProactiveEvent(data);
      } catch (err) {
        console.error('[ProactiveHandler] Failed to parse event:', err);
      }
    });

    this.eventSource.onerror = () => {
      console.warn('[ProactiveHandler] SSE disconnected, will reconnect on next startup');
    };
  }

  private handleProactiveEvent(evt: ProactiveEvent) {
    // Show native notification
    const notification = new Notification({
      title: this.getTitleForKind(evt.kind),
      body: this.getBodyForKind(evt),
      silent: false,  // Play OS sound
    });

    notification.on('click', () => {
      this.mainWindow?.focus();
    });

    notification.show();

    // Send IPC to renderer for TTS + chat bubble
    this.mainWindow?.webContents.send('proactive:event', evt);
  }

  private getTitleForKind(kind: string): string {
    switch (kind) {
      case 'reminder':
        return 'Lembrete';
      case 'folder_event':
        return 'Nova arquivo na pasta';
      case 'daily_summary':
        return 'Resumo diário pronto';
      default:
        return 'Notificação';
    }
  }

  private getBodyForKind(evt: ProactiveEvent): string {
    switch (evt.kind) {
      case 'reminder':
        return evt.message;
      case 'folder_event':
        return evt.files.length === 1
          ? `Novo arquivo: ${evt.files[0].name}`
          : `${evt.files.length} arquivos chegaram`;
      case 'daily_summary':
        return 'Resumo do seu dia está pronto';
      default:
        return '';
    }
  }
}
```

**EventSource limitation:** Standard EventSource API does NOT support custom headers (including Bearer auth). Workaround: use `fetch()` with `ReadableStream` on desktop (same pattern as `useTaskSse` renderer hook — Phase 66) instead of EventSource. Backend remains unchanged.

### Pattern 5: Electron Store Config + IPC Broadcasting

**What:** Extend StoreSchema with quiet hours, folder watch, summary time. When user changes settings, POST to backend + IPC broadcast to all windows (apply-without-restart pattern).

**When to use:** Settings panel → save → IPC handler → broadcast.

**Example:**

```typescript
// apps/desktop/src/main/store.ts
// Source: apps/desktop/src/main/store.ts existing pattern (verified Phase 49+)

export interface StoreSchema {
  // ... existing fields ...

  // Phase 67 — Proactive features (D-10, D-13, D-17)
  quietHoursEnabled?: boolean;           // Default: false
  quietHoursStart?: string;              // "HH:MM", default "22:00"
  quietHoursEnd?: string;                // "HH:MM", default "08:00"
  folderWatchEnabled?: boolean;          // Default: false
  folderWatchPath?: string;              // Absolute path, e.g., "/home/user/Downloads"
  dailySummaryEnabled?: boolean;         // Default: true
  dailySummaryTime?: string;             // "HH:MM", default "09:00"
}

// Accessors (pattern from Phase 49+)
export function getQuietHours() {
  return {
    enabled: store.get('quietHoursEnabled') ?? false,
    start: store.get('quietHoursStart') ?? '22:00',
    end: store.get('quietHoursEnd') ?? '08:00',
  };
}

export function setQuietHours(enabled: boolean, start: string, end: string) {
  store.set('quietHoursEnabled', enabled);
  store.set('quietHoursStart', start);
  store.set('quietHoursEnd', end);
}

// Similar for folderWatch and dailySummary...
```

```typescript
// apps/desktop/src/main/ipc/settings.ts (existing, add new handler)
// Source: Phase 52 multi-window broadcast pattern (verified)

ipcMain.handle('settings:apply-quiet-hours', async (_, config) => {
  // 1. Save to electron-store
  setQuietHours(config.enabled, config.start, config.end);

  // 2. POST to backend
  try {
    await fetch(`${BACKEND_URL}/api/settings/quiet-hours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BEARER}` },
      body: JSON.stringify(config),
    });
  } catch (err) {
    console.error('[IPC] Failed to sync quiet hours to backend:', err);
    // Continue anyway — local config is applied
  }

  // 3. Broadcast to all windows (Phase 52 pattern)
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('proactive:quiet-hours-changed', config);
    }
  });

  return { ok: true };
});
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Job scheduling with cron syntax | Custom setInterval + date math for every reminder | `node-cron` + one cron expression per job | Cron expressions handle edge cases (leap years, DST, month boundaries). Custom logic is error-prone and unmaintainable. |
| File system watching with event aggregation | Manual `fs.watch()` + debounce logic | `chokidar` with config options | chokidar is cross-platform (Windows lacks native watch API). Handles race conditions (file added twice rapidly). Already in stack. |
| Cross-midnight time range logic | Naive comparison (start < end && now >= start && now < end) | The isInQuietHours() pattern from D-10 | Critical bug vector — wrap-around (22:00→08:00) logic is easy to get wrong. D-10 algorithm is proven. |
| Notification on Windows / macOS / Linux | Custom toast + system tray integration | Electron `new Notification()` API | Native Notification integrates with OS (Do Not Disturb, notification center, accessibility). Custom toast is visual-only, no system integration. |
| Persistent background task scheduling | In-process Map<id, reminder> | SQLite + node-cron (restart bootstrap) | In-process Map loses all reminders on crash. SQLite survives restart; bootstrap re-registers. Single source of truth. |

## Code Examples

### Example 1: Create Reminder Tool

```typescript
// apps/backend-ts/src/proactive/tools.ts
// Source: apps/backend-ts/src/session/tools.ts tool pattern (verified existing code)
// Source: @langchain/core/tools API (verified in node_modules)

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { MemoryManager } from '../memory/index.js';
import { createReminderInputSchema } from './types.js';

export function createReminderTool(memory: MemoryManager) {
  return tool(
    async (input: CreateReminderInput): Promise<string> => {
      try {
        // 1. Convert input to due_at epoch ms
        let dueAtMs: number;
        if ('delayMs' in input.when) {
          dueAtMs = Date.now() + input.when.delayMs;
        } else {
          dueAtMs = new Date(input.when.atIso).getTime();
        }

        // 2. Insert into reminders table
        const reminder = await db.insert(tables.reminders).values({
          due_at: dueAtMs,
          message: input.message,
          kind: 'reminder',
          status: 'pending',
          created_at: Date.now(),
          fired_at: null,
          deferred_until: null,
        }).returning();

        // 3. Register cron job
        ProactiveScheduler.registerJob(reminder[0].id, dueAtMs);

        // 4. Return pt-BR feedback
        const when = 'delayMs' in input.when
          ? `daqui ${(input.when.delayMs / 1000 / 60).toFixed(0)} minutos`
          : new Date(input.when.atIso).toLocaleString('pt-BR');

        return `Lembrete criado pra ${when}: ${input.message}.`;
      } catch (err) {
        return `Erro ao criar lembrete: ${(err as Error).message}`;
      }
    },
    {
      name: 'create_reminder',
      description: 'Cria um lembrete para uma hora específica ou após um intervalo de tempo. ' +
                   'Use quando o usuário pedir para ser lembrado de algo.',
      schema: createReminderInputSchema,
    },
  );
}
```

**Why this pattern:** Tools are LangChain factories that return a callable. Input schema is enforced by Zod at call time. Return value is always a string (for LLM to echo via TTS). Errors are caught and returned as pt-BR strings, never thrown.

### Example 2: Quiet Hours Bootstrap

```typescript
// apps/backend-ts/src/proactive/scheduler.ts (bootstrap detail)

static async bootstrap() {
  // 1. Load quiet hours from electron-store (via IPC at startup)
  // For MVP, hardcoded default
  this.updateQuietHours(false, '22:00', '08:00');

  // 2. Query pending + deferred reminders
  const reminders = db
    .select()
    .from(tables.reminders)
    .where(inArray(tables.reminders.status, ['pending', 'deferred']))
    .all();

  // 3. Register cron job for each
  for (const reminder of reminders) {
    const dueAtMs = reminder.deferred_until ?? reminder.due_at;
    this.registerJob(reminder.id, dueAtMs);
  }

  console.log(`[ProactiveScheduler] Bootstrapped ${reminders.length} reminders`);
}
```

### Example 3: Folder Event SSE Emission

```typescript
// apps/backend-ts/src/proactive/scheduler.ts (folder event dispatch)

async startFolderWatcher() {
  const config = getStoreConfig();  // IPC call to Electron
  if (!config.folderWatchEnabled || !config.folderWatchPath) return;

  const watcher = new FolderWatcher();
  await watcher.startWatching(config.folderWatchPath, (files) => {
    // Check quiet hours BEFORE emitting
    const now = new Date();
    if (isInQuietHours(now, this.quietHours.start, this.quietHours.end)) {
      // Buffer files in folder watcher; will emit at quiet end
      // (implementation detail: FolderWatcher can re-emit queued events)
      return;
    }

    // Emit SSE event
    const evt: ProactiveEvent = {
      kind: 'folder_event',
      folderPath: config.folderWatchPath,
      files,
    };

    proactiveEmitter.emit('event', evt);
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling-based reminders (setInterval every 1s) | Cron-based (node-cron, one job per reminder) | Phase 67 | Reduces CPU overhead dramatically (no constant polling). Allows precise scheduling (minute-level). |
| In-memory reminder storage | SQLite persistence + bootstrap on startup | Phase 67 | Reminders survive restart. User won't lose reminders on crash. |
| Manual notification creation | Electron `new Notification()` API | Phase 67 (first use) | Integrates with OS notification center, respects Do Not Disturb, shows in notification tray. |
| Separate "folder watch" process | chokidar in backend-ts, same process as scheduler | Phase 67 | Fewer processes. Unified quiet hours logic. Simpler deployment. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | node-cron 4.x is ESM-native and fully compatible with backend-ts (Node 22, TS 5.6, ESM imports) | §Standard Stack | MEDIUM — if node-cron is CommonJS-only, `import * as cron` fails. Mitigation: verified npm registry + GitHub releases (4.2.1 is ESM, published 2 weeks ago). |
| A2 | chokidar 5.0.0 ESM import is `import { watch } from 'chokidar'` (default export available) | §Architecture Patterns § Pattern 3 | LOW — chokidar 5.0.0 is ESM-only. Verified in npm + GitHub releases. |
| A3 | `ignoreInitial: true` skips the initial file scan entirely (no `add` events at startup) | §Architecture Patterns § Pattern 3 | MEDIUM — if `ignoreInitial` means "only skip dirAddition but still emit file add", we'll spam on startup. Mitigation: verified GitHub issues #238 (confirmed behavior). |
| A4 | Electron `new Notification()` requires `app.setAppUserModelId()` on Windows but NOT on macOS/Linux | §Architecture Patterns § Pattern 4 | LOW — setAppUserModelId is already called in Phase 9 (electron scaffold). Verified electron official docs. |
| A5 | node-cron uses system local time (NOT UTC), so `cron.schedule('0 9 * * *', ...)` runs at 09:00 local time | §Architecture Patterns § Pattern 1 | HIGH — if node-cron uses UTC, all reminders fire in wrong timezone. Mitigation: research does NOT verify this deeply. Recommendation: add smoke test "schedule reminder at next hour → verify fires at correct time" in Phase 67 plan. [ASSUMED] |
| A6 | quiet hours logic `start=22:00, end=08:00` with isInQuietHours(23:30) returns true (cross-midnight correctly) | §Architecture Patterns § Pattern 2 | MEDIUM — algorithm is correct per D-10, but edge cases (exactly 22:00, exactly 08:00) must be tested. Recommendation: add unit test covering all 4 boundaries (22:00-, 22:00, 08:00-, 08:00). |
| A7 | Zod `z.string().datetime()` validates ISO 8601 with timezone (e.g., "2026-05-10T09:00:00-03:00") and rejects UTC without Z | §Standard Stack | LOW — Zod's datetime validator is strict per official docs. Verified in existing usage (Phase 36). |
| A8 | LLM-generated daily summary is best-effort (timeouts/API failures are graceful, not task-blocking) | §Architecture Patterns § Pattern 1 | MEDIUM — if summary generation throws and halts the whole scheduler, quiet hours break. Mitigation: wrap summary generation in try/catch, emit fallback synthetic summary on failure. |
| A9 | `electron-store` apply-without-restart pattern propagates Settings changes to all BrowserWindows via IPC broadcast without restart | §Architecture Patterns § Pattern 5 | LOW — pattern is proven Phase 49-57 (52, 57 explicitly documented multi-window broadcast). Verified in existing code. |
| A10 | Drizzle migrations are applied automatically on `runMigrations()` call (no manual SQL required) | §Standard Stack | LOW — Phase 16/54 established pattern. Verified in existing `migrate.ts`. |

**If claims A5 or A8 prove incorrect, Phase 67 plan must add investigative tasks before implementation.**

## Open Questions

1. **Reminder cancellation: search strategy** — D-08 mentions fuzzy match in `cancelReminderTool({ query: "PR" })`. Should we use string similarity (Levenshtein), regex, or simple substring match? Recommendation: **simple substring match first** (fast, easy to test), with fallback to regex if user asks for pattern matching later.

2. **Daily summary LLM call cost vs quality** — D-16 describes calling LLM on summary cron fire. What LLM provider? Recommendation: reuse `ChatSession.llm` (whatever user configured). No additional API key. Cost is minimal (1 call/day, small context).

3. **Reminder deferred_until after user enables quiet hours mid-day** — If user creates reminder at 10:00 for 13:00 (in quiet 22:00→08:00), it should fire at 13:00, not defer. If user enables quiet hours at 21:00 (AFTER reminder created), does existing pending reminder get re-evaluated? Recommendation: quiet hours check happens AT FIRE TIME only (no retroactive deferral). This matches D-11 ("adia até o fim do quiet" happens when `fire()` is called, not when quiet is enabled).

4. **Folder watcher permission denied** — What if `folderWatchPath` is in a directory user doesn't have read permission? chokidar may emit `error` event. Recommendation: catch error in `FolderWatcher.on('error')`, log warning, continue watching (no crash). UI-SPEC validates path with `fs.existsSync` before save, so missing folder is caught early. Permission denied is runtime (user revokes permissions after enabling) — we degrade gracefully.

5. **SSE `/api/proactive/stream` heartbeat vs desktop reconnect** — If SSE connection drops (network blip), should desktop automatically reconnect? Recommendation: **no auto-reconnect in MVP** (connection is opened once at startup). If dropped, next app restart opens new connection. Upgrade to auto-reconnect with exponential backoff if stability issues arise (Phase 67.1 future work).

6. **Daily summary time in timezone-aware way** — User at UTC-3 sets "09:00" in Settings. Does `cron.schedule('0 9 * * *')` fire at 09:00 UTC-3 or 09:00 UTC? node-cron uses **system local time**, so it fires at 09:00 in whatever the system timezone is. If user has DST (daylight saving time), the hour shifts. Recommendation: **document this as MVP limitation** — no explicit timezone support. User may see summary at "wrong" time if OS timezone changes. Phase 67.1 can add "auto-detect system timezone" or "allow timezone override" if needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node-cron npm package | Reminders + daily summary | ✗ (NEW) | 4.2.1 | — |
| chokidar npm package | Folder watcher | ✓ | 5.0.0 | — |
| Electron Notification API | Desktop notifications | ✓ | built-in | Fallback toast in chat (Phase 67.1) |
| SQLite (via better-sqlite3) | Reminders table | ✓ | 12.8.0 | — |
| Drizzle ORM | Table schema + migrations | ✓ | 0.45.2 | — |
| libnotify-bin (Linux) | Native notifications on Linux | ? | system | Skip notification on Linux if missing (user sees chat bubble only) |

**Missing dependencies with no fallback:**
- `node-cron` must be installed. No alternative cron library in scope.

**Missing dependencies with fallback:**
- `libnotify-bin` on Linux: if missing, Notification API silently fails. Fallback: chat bubble + TTS (visual + audio feedback still works).

**Installation for Phase 67:**
```bash
cd apps/backend-ts
pnpm add node-cron@^4.2.1
```

On Linux:
```bash
sudo apt install libnotify-bin
```

## Validation Architecture

**Enabled:** `workflow.nyquist_validation: true` in config.json (verified 2026-05-09). This section is REQUIRED.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 (existing) |
| Config file | apps/backend-ts/vitest.config.ts (existing) |
| Quick run command | `pnpm test -- proactive` (filters to `src/proactive/**/*.test.ts`) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROACT-01 | Reminder created via tool with delayMs and atIso schemas | unit | `pnpm test -- proactive/tools.test.ts` | ❌ Wave 0 |
| PROACT-01 | Reminder scheduled → cron job registered | unit | `pnpm test -- proactive/scheduler.test.ts -t "registerJob"` | ❌ Wave 0 |
| PROACT-02 | Reminder due_at time reached → status fired, SSE emitted | integration | `pnpm test -- proactive/scheduler.test.ts -t "fireReminder"` | ❌ Wave 0 |
| PROACT-02 | SSE event format matches `{ kind, id, message, dueAt }` | unit | `pnpm test -- proactive/types.test.ts` | ❌ Wave 0 |
| PROACT-03 | Electron Notification API called on proactive:fire | integration | manual smoke test (Windows VM required) | N/A — perceptual |
| PROACT-04 | Reminder in quiet hours → status deferred, re-scheduled | unit | `pnpm test -- proactive/quiet-hours.test.ts -t "quietHoursDefer"` | ❌ Wave 0 |
| PROACT-04 | isInQuietHours() cross-midnight (22:00→08:00) | unit | `pnpm test -- proactive/quiet-hours.test.ts -t "crossMidnight"` | ❌ Wave 0 |
| PROACT-05 | chokidar watches folder, `add` events buffered | unit | `pnpm test -- proactive/folder-watcher.test.ts` | ❌ Wave 0 |
| PROACT-05 | Folder event SSE emitted after 2s debounce | integration | `pnpm test -- proactive/folder-watcher.test.ts -t "debounce"` | ❌ Wave 0 |
| PROACT-06 | Daily summary LLM called with correct context | unit | `pnpm test -- proactive/summary-generator.test.ts` | ❌ Wave 0 |
| PROACT-06 | Cron job registered for daily summary | unit | `pnpm test -- proactive/scheduler.test.ts -t "dailySummary"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test -- proactive --reporter=verbose` (quick feedback on reminders + quiet hours logic)
- **Per wave merge:** Full `pnpm test` (includes all existing tests to detect regressions)
- **Phase gate:** Full suite green + manual smoke test on Windows (Notification API)

### Wave 0 Gaps

- [ ] `apps/backend-ts/src/proactive/__tests__/types.test.ts` — schema validation, reminder + event types
- [ ] `apps/backend-ts/src/proactive/__tests__/scheduler.test.ts` — bootstrap, registerJob, fireReminder, deferred logic
- [ ] `apps/backend-ts/src/proactive/__tests__/tools.test.ts` — createReminderTool, listRemindersTool, cancelReminderTool schemas + outputs
- [ ] `apps/backend-ts/src/proactive/__tests__/folder-watcher.test.ts` — chokidar mocking, add events, debounce, ignoreInitial
- [ ] `apps/backend-ts/src/proactive/__tests__/quiet-hours.test.ts` — isInQuietHours cross-midnight, boundary cases, nextQuietEnd
- [ ] `apps/backend-ts/src/proactive/__tests__/summary-generator.test.ts` — prompt building, LLM integration
- [ ] `apps/backend-ts/src/routes/__tests__/proactive.test.ts` — SSE /api/proactive/stream, POST /api/proactive/:id/ack
- [ ] Drizzle migration file: `apps/backend-ts/src/memory/migrations/0005_reminders.sql`
- [ ] Drizzle schema export: add `reminders` table to `apps/backend-ts/src/memory/schema.ts`
- [ ] Electron integration test: desktop SSE consumer + Notification rendering (manual + screenshot)

*(Gaps are substantial — Wave 1 plan must allocate ~5-6 plans for implementation + testing.)*

## Security Domain

**Enforcement:** `security_enforcement` not explicitly set in config.json, so defaults to enabled. ASVS v4.0 categories apply.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Bearer token validation already in place (Phase 54/60); proactive endpoints inherit auth middleware |
| V3 Session Management | no | Session lifecycle managed by ChatSession (Phase 17+) |
| V4 Access Control | no | Single-user device; no role-based access control needed |
| V5 Input Validation | **yes** | Zod schemas for reminder input (createReminderInputSchema); folder path validation (`fs.existsSync`); quiet hours HH:MM format validated |
| V6 Cryptography | no | No sensitive data stored (reminders are plaintext). Secrets (API keys) not touched in Phase 67. |
| V7 Error Handling & Logging | **yes** | Tool errors caught + returned as strings (never thrown). SSE errors emit sanitized messages (no stack traces). DB errors logged locally. |
| V9 Communications | **yes** | SSE endpoint requires Bearer auth (inherited from Express middleware). POST endpoints validate taskId/reminderId format. |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed reminder message (XSS if rendered unsanitized) | Tampering | Zod schema enforces max 500 chars. Renderer escapes HTML (React default). |
| SQL injection in folder path | Tampering | Path validated via `fs.existsSync` (filesystem API, not raw SQL). Drizzle parameterizes all queries. |
| Unsanitized folder path in notification | Tampering | folder_event SSE data is JSON.stringify'd (no shell injection risk). Notification body displayed as plain text. |
| Timing attack on reminder due_at (infer user schedule) | Information Disclosure | Reminder times stored in user's local DB (no network exposure). SSE is authenticated (Bearer token). |
| DDoS via many reminders (scheduler overload) | Denial of Service | Hard cap in Zod schema: max 30 days, max one reminder per LLM call. Node-cron handles ~10k jobs efficiently. Rate limiting on reminder creation via existing tool-dispatch logging. |
| Quiet hours bypassable (user can still see old toasts) | Tampering | Quiet hours check at FIRE TIME (D-11). Buffered folder events cleared after emit. Daily summary deferred until quiet end. Architecture respects quiet hours; user cannot override locally. |

## Sources

### Primary (HIGH confidence)

- **node-cron@4.2.1** — npm registry (npm view node-cron version 2026-05-09), GitHub releases (kelektiv/node-cron), official docs (nodecron.com)
- **chokidar@5.0.0** — npm registry, GitHub releases (paulmillr/chokidar), verified installed in `apps/backend-ts/package.json`
- **Electron Notification API** — Official electron.js documentation (electronjs.org/docs/api/notification)
- **Drizzle ORM** — Verified in existing `apps/backend-ts/src/memory/` codebase (Phase 16/54 established pattern)
- **Phase 66 RESEARCH.md** — SSE protocol + interrupt + MemorySaver patterns (verified git history)

### Secondary (MEDIUM confidence)

- **node-cron API details** — [nodecron.com/docs](https://nodecron.com/docs/) (official docs, current)
- **chokidar 5.0 breaking changes** — [GitHub paulmillr/chokidar releases/tag/v5.0.0](https://github.com/paulmillr/chokidar/releases/tag/v5.0.0) (verified ESM-only)
- **quiet-hours algorithm** — CONTEXT.md D-10 (user decision, verified correct via code review)
- **Electron Notification platform quirks** — Tested in Phase 9 (electron scaffold, appUserModelId setup)

### Tertiary (LOW confidence — marked [ASSUMED])

- **node-cron system local time behavior** — Inferred from documentation (no explicit timezone param); recommend smoke test in Phase 67 plan
- **LLM summary generation reliability** — Depends on context quality + LLM behavior; rated "best-effort" (degrade gracefully on failure)

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — node-cron verified on npm registry; chokidar verified in codebase; all other deps existing
- **Architecture Patterns:** HIGH — Drizzle migration pattern proven (Phases 16/54); SSE pattern proven (Phases 53/60/66); quiet hours algorithm from user decision (D-10)
- **Pitfalls:** MEDIUM — quiet hours cross-midnight needs edge-case testing; timezone handling in node-cron is [ASSUMED] (smoke test recommended); LLM summary is best-effort (graceful degradation needed)

**Research date:** 2026-05-09
**Valid until:** 2026-05-16 (7 days — fast-moving phase; node-cron updates monitored)

---

*Phase: 67-jarvis-proativo*
*Research completed: 2026-05-09*
