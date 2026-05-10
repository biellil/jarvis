---
phase: 67
slug: jarvis-proativo
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-09
updated: 2026-05-10
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
| 67-01-01 | 01 | 0 | All | — | Stub-first test files exist | wave-0 | `test -f apps/backend-ts/src/proactive/__tests__/scheduler.test.ts` | ✅ | ✅ green |
| 67-02-01 | 02 | 1 | PROACT-01,02,03 | T-67-01 | Reminder schema validates delayMs/atIso bounds | unit | `npx vitest run reminders` | ✅ | ✅ green |
| 67-02-02 | 02 | 1 | PROACT-01 | — | createReminderTool returns pt-BR string | unit | `npx vitest run reminders.tools` | ✅ | ✅ green |
| 67-03-01 | 03 | 1 | PROACT-01,02,03,04 | T-67-02 | node-cron schedules + bootstrap restore + quiet hours defer | integration | `npx vitest run scheduler` | ✅ | ✅ green |
| 67-04-01 | 04 | 1 | PROACT-04 | — | isInQuietHours cross-midnight algorithm | unit | `npx vitest run quiet-hours` | ✅ | ✅ green |
| 67-05-01 | 05 | 1 | PROACT-05 | — | chokidar add events + 2s debounce + ignoreInitial | integration | `npx vitest run folder-watcher` | ✅ | ✅ green |
| 67-06-01 | 06 | 1 | PROACT-06 | — | dailySummary LLM call + degradation fallback | unit | `npx vitest run daily-summary` | ✅ | ✅ green |
| 67-07-01 | 07 | 2 | PROACT-02,03,04,05,06 | T-67-03 | SSE /api/proactive/stream emits typed events | integration | `npx vitest run proactive.route` | ✅ | ✅ green |
| 67-08-01 | 08 | 2 | PROACT-02,03 | — | Desktop main consumer dispatches Notification + IPC | unit | `npx vitest run proactive` (desktop) | ✅ | ✅ green |
| 67-09-01 | 09 | 2 | PROACT-04,05,06 | — | Settings section persists/applies quiet/folder/summary | unit | `npx vitest run ProactiveSection` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Stub-first test files (Phase 66-01 pattern). Vitest test files with `it.todo()` BEFORE implementation, so plans can reference real `<verify>` commands.

- [x] `apps/backend-ts/src/proactive/__tests__/scheduler.test.ts` — implemented (PROACT-01,02,03,04)
- [x] `apps/backend-ts/src/proactive/__tests__/quiet-hours.test.ts` — implemented (12 tests, PROACT-04 cross-midnight)
- [x] `apps/backend-ts/src/proactive/__tests__/folder-watcher.test.ts` — implemented (9 tests, PROACT-05)
- [x] `apps/backend-ts/src/proactive/__tests__/daily-summary.test.ts` — implemented (9 tests, PROACT-06)
- [x] `apps/backend-ts/src/proactive/__tests__/reminders.test.ts` — implemented (Reminders CRUD)
- [x] `apps/backend-ts/src/proactive/__tests__/reminders.tools.test.ts` — implemented (LangChain tools)
- [x] `apps/backend-ts/src/routes/__tests__/proactive.route.test.ts` — implemented (11 tests, SSE route)
- [x] `apps/desktop/src/main/ipc/__tests__/proactive.test.ts` — implemented (15 tests + 6 todo for v1.1)
- [x] `apps/desktop/src/renderer/src/settings/__tests__/ProactiveSection.test.tsx` — implemented (6 tests)
- [x] `node-cron@^4.2.1` + `chokidar@5.0.0` installed in `apps/backend-ts/package.json`

## Phase 67 Test Summary

**Targeted phase 67 tests:** 82/82 passing
- backend-ts: 7 files, 61 tests (quiet-hours, folder-watcher, daily-summary, scheduler, reminders, reminders.tools, proactive.route)
- desktop: 2 files, 21 tests (proactive consumer/IPC, ProactiveSection)

**Backend-ts suite:** 590 passed, 1 skipped, 1 todo (no failures)

**Desktop suite:** 891 passed, 39 failed (pre-existing failures unrelated to phase 67 — voiceHandler, vramDetection, integration-chat, security, ttsPlayer, etc. Confirmed failing at base commit `bc180b7` before phase 67 work).

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** automated tests green; manual UAT pending (5 scenarios in 67-10-PLAN.md task 2).
