---
phase: 67
slug: jarvis-proativo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured in apps/backend-ts and apps/desktop) |
| **Config file** | `apps/backend-ts/vitest.config.ts`, `apps/desktop/vitest.config.ts` |
| **Quick run command** | `pnpm --filter backend-ts test:run -- <pattern>` |
| **Full suite command** | `pnpm test:run` (root) |
| **Estimated runtime** | ~30-60 seconds full backend; ~90s full monorepo |

---

## Sampling Rate

- **After every task commit:** Run targeted test for the file just touched (e.g., `pnpm --filter backend-ts test:run -- proactive/scheduler`)
- **After every plan wave:** Run `pnpm --filter backend-ts test:run` and `pnpm --filter desktop test:run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Filled in by planner per task. Below lists EXPECTED targets. The map is updated when plans are written.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 67-01-01 | 01 | 0 | All | — | Stub-first test files exist | wave-0 | `test -f apps/backend-ts/src/proactive/__tests__/scheduler.test.ts` | ❌ W0 | ⬜ pending |
| 67-02-01 | 02 | 1 | PROACT-01,02,03 | T-67-01 | Reminder schema validates delayMs/atIso bounds | unit | `pnpm --filter backend-ts test:run -- reminders` | ❌ W0 | ⬜ pending |
| 67-02-02 | 02 | 1 | PROACT-01 | — | createReminderTool returns pt-BR string | unit | `pnpm --filter backend-ts test:run -- reminders.tools` | ❌ W0 | ⬜ pending |
| 67-03-01 | 03 | 1 | PROACT-01,02,03,04 | T-67-02 | node-cron schedules + bootstrap restore + quiet hours defer | integration | `pnpm --filter backend-ts test:run -- scheduler` | ❌ W0 | ⬜ pending |
| 67-04-01 | 04 | 1 | PROACT-04 | — | isInQuietHours cross-midnight algorithm | unit | `pnpm --filter backend-ts test:run -- quiet-hours` | ❌ W0 | ⬜ pending |
| 67-05-01 | 05 | 1 | PROACT-05 | — | chokidar add events + 2s debounce + ignoreInitial | integration | `pnpm --filter backend-ts test:run -- folder-watcher` | ❌ W0 | ⬜ pending |
| 67-06-01 | 06 | 1 | PROACT-06 | — | dailySummary LLM call + degradation fallback | unit | `pnpm --filter backend-ts test:run -- daily-summary` | ❌ W0 | ⬜ pending |
| 67-07-01 | 07 | 2 | PROACT-02,03,04,05,06 | T-67-03 | SSE /api/proactive/stream emits typed events | integration | `pnpm --filter backend-ts test:run -- proactive.route` | ❌ W0 | ⬜ pending |
| 67-08-01 | 08 | 2 | PROACT-02,03 | — | Desktop main consumer dispatches Notification + IPC | unit | `pnpm --filter desktop test:run -- proactive.consumer` | ❌ W0 | ⬜ pending |
| 67-09-01 | 09 | 2 | PROACT-04,05,06 | — | Settings section persists/applies quiet/folder/summary | unit | `pnpm --filter desktop test:run -- ProactiveSection` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Stub-first test files (Phase 66-01 pattern). Vitest test files with `it.todo()` BEFORE implementation, so plans can reference real `<verify>` commands.

- [ ] `apps/backend-ts/src/proactive/__tests__/scheduler.test.ts` — stubs for PROACT-01,02,03,04
- [ ] `apps/backend-ts/src/proactive/__tests__/quiet-hours.test.ts` — stubs for PROACT-04 cross-midnight
- [ ] `apps/backend-ts/src/proactive/__tests__/folder-watcher.test.ts` — stubs for PROACT-05
- [ ] `apps/backend-ts/src/proactive/__tests__/daily-summary.test.ts` — stubs for PROACT-06
- [ ] `apps/backend-ts/src/proactive/__tests__/reminders.test.ts` — stubs for reminder CRUD
- [ ] `apps/backend-ts/src/proactive/__tests__/reminders.tools.test.ts` — stubs for createReminderTool/list/cancel
- [ ] `apps/backend-ts/src/routes/__tests__/proactive.test.ts` — stubs for SSE route
- [ ] `apps/desktop/src/main/ipc/__tests__/proactive.test.ts` — stubs for desktop consumer
- [ ] `apps/desktop/src/renderer/src/settings/__tests__/ProactiveSection.test.tsx` — stubs for Settings UI
- [ ] Install `node-cron@^4.2.1` + `@types/node-cron` in `apps/backend-ts/package.json`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Notificação nativa OS aparece | PROACT-02, PROACT-03 | Electron Notification renders OS-level — only OS can confirm visibility | 1. Configure folder watch + drop arquivo. 2. Verificar banner OS aparece com nome+caminho. 3. Click no banner → janela do JARVIS foca. |
| TTS fala o lembrete corretamente em pt-BR | PROACT-02 | Perceptual quality of kokoro/Murf voice — auditory check only | 1. Criar lembrete: "me lembra em 1 minuto de testar". 2. Aguardar 1min. 3. TTS fala "Lembrete: testar." em pt-BR claro. |
| Resumo diário tem tom natural pt-BR | PROACT-06 | LLM output quality is qualitative | 1. Aguardar horário configurado (ou setar p/ daqui 2min). 2. Verificar que TTS lê resumo natural. 3. Bubble no chat tem mesmo texto. |
| Quiet hours bloqueia tudo proativo | PROACT-04 | Cross-platform timing + audio silence verification | 1. Configurar quiet 12:00-13:00 (durante teste). 2. Criar reminder p/ 12:30. 3. Verificar nada toca às 12:30. 4. Verificar dispara às 13:00. 5. Drop arquivo em pasta às 12:35. 6. Verificar buffer dispara às 13:00. |
| node-cron timezone alinhado com config OS | PROACT-01, PROACT-06 | Tests run in CI UTC; user's local clock is what matters | 1. Setar resumo p/ daqui 3min em horário local. 2. Confirmar dispara no horário local. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
