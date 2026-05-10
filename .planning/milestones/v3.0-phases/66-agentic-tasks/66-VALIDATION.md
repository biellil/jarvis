---
phase: 66
slug: agentic-tasks
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of test mappings: `66-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (existing — apps/backend-ts and apps/desktop both use it) |
| **Config file** | `apps/backend-ts/vitest.config.ts`, `apps/desktop/vitest.config.ts` |
| **Quick run command** | `pnpm --filter backend-ts test --run -- src/agent` |
| **Full suite command** | `pnpm test` (workspace root) |
| **Estimated runtime** | ~12-25 seconds per affected package; full ~90s |

---

## Sampling Rate

- **After every task commit:** Run scoped quick command for the touched package (`pnpm --filter <pkg> test --run -- <area>`)
- **After every plan wave:** Run `pnpm test` (full workspace)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (quick), 120 seconds (full workspace)

---

## Per-Task Verification Map

To be filled by gsd-planner per generated plan task. Below is the requirement-level expected coverage skeleton — each row maps to one or more PLAN.md tasks.

| Requirement | Test Type | Component | Automated Command | Source File Existence | Status |
|-------------|-----------|-----------|-------------------|------------------------|--------|
| AGENT-01 | integration | agent graph end-to-end | `pnpm --filter backend-ts test --run -- src/agent/graph` | ❌ W0 (file does not exist yet) | ⬜ pending |
| AGENT-01 | integration | sendStream routes multi-step requests through graph | `pnpm --filter backend-ts test --run -- src/session/chat-session` | ✅ (existing test) | ⬜ pending |
| AGENT-02 | unit | planner schema (Zod) + withStructuredOutput | `pnpm --filter backend-ts test --run -- src/agent/planner` | ❌ W0 | ⬜ pending |
| AGENT-02 | integration | interrupt() pauses graph; Command(resume='confirm') resumes | `pnpm --filter backend-ts test --run -- src/agent/graph` | ❌ W0 | ⬜ pending |
| AGENT-02 | integration | Command(resume='cancel') terminates with task:cancelled | `pnpm --filter backend-ts test --run -- src/agent/graph` | ❌ W0 | ⬜ pending |
| AGENT-02 | integration | Command(resume={edit}) re-runs planner with feedback | `pnpm --filter backend-ts test --run -- src/agent/graph` | ❌ W0 | ⬜ pending |
| AGENT-02 | unit | TaskCheckList renders 3 buttons in `awaiting-confirmation` state | `pnpm --filter desktop test --run -- TaskCheckList` | ❌ W0 | ⬜ pending |
| AGENT-02 | unit | confirm/cancel/edit text keyword detection (pt-BR) | `pnpm --filter desktop test --run -- task-keywords` | ❌ W0 | ⬜ pending |
| AGENT-03 | unit | SSE writer emits task:plan / step:start / step:end / done events | `pnpm --filter backend-ts test --run -- src/agent/graph` | ❌ W0 | ⬜ pending |
| AGENT-03 | integration | streamMode='custom' writer routes events through /api/chat/stream | `pnpm --filter backend-ts test --run -- src/routes/chat` | ✅ (extend existing) | ⬜ pending |
| AGENT-03 | unit | TaskCheckList transitions checkbox states on step:end events | `pnpm --filter desktop test --run -- TaskCheckList` | ❌ W0 | ⬜ pending |
| AGENT-03 | unit | Orb badge displays `AGENT N/M` while task active; reverts on done | `pnpm --filter desktop test --run -- Orb` | ✅ (extend existing) | ⬜ pending |
| AGENT-04 | unit | cancel flag set via POST /api/tasks/:id/cancel propagates to state | `pnpm --filter backend-ts test --run -- src/routes/tasks` | ❌ W0 | ⬜ pending |
| AGENT-04 | unit | executor checks state.cancelRequested before each step iteration | `pnpm --filter backend-ts test --run -- src/agent/executor` | ❌ W0 | ⬜ pending |
| AGENT-04 | integration | AbortSignal threads to fetch tools; aborted tool throws expected error | `pnpm --filter backend-ts test --run -- src/agent/executor` | ❌ W0 | ⬜ pending |
| AGENT-04 | integration | MCP tool-adapter forwards signal to client.callTool({signal}) | `pnpm --filter backend-ts test --run -- src/mcp/client/tool-adapter` | ✅ (extend existing) | ⬜ pending |
| AGENT-04 | unit | request_file_action AbortSignal compose with 13s timeout | `pnpm --filter backend-ts test --run -- src/session/request-file-action` | ✅ (extend existing) | ⬜ pending |
| AGENT-04 | integration | task:cancelled event emitted with `atStep` field | `pnpm --filter backend-ts test --run -- src/agent/graph` | ❌ W0 | ⬜ pending |
| AGENT-04 | unit | sendAudioAndHandle short-circuits to /resume\|/cancel when task active | `pnpm --filter desktop test --run -- voice/sendAudioAndHandle` | ✅ (extend existing) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note:** The planner will replace this skeleton with a concrete task-by-task map (Task ID → Plan → Wave → REQ → Test Type → Command → Status). Skeleton above is a Wave 0 sizing guide for how many test files need stubs.

---

## Wave 0 Requirements

Wave 0 must create test stubs for all NEW source files referenced above before any Wave 1 implementation runs. New files to stub:

- [ ] `apps/backend-ts/src/agent/__tests__/graph.test.ts` — agent graph integration stubs (AGENT-01/02/03/04)
- [ ] `apps/backend-ts/src/agent/__tests__/planner.test.ts` — Zod schema + withStructuredOutput unit stubs (AGENT-02)
- [ ] `apps/backend-ts/src/agent/__tests__/executor.test.ts` — cancel gate + AbortSignal threading stubs (AGENT-04)
- [ ] `apps/backend-ts/src/routes/__tests__/tasks.test.ts` — POST /api/tasks/:id/cancel + /resume route stubs (AGENT-02/04)
- [ ] `apps/desktop/src/renderer/src/chat/__tests__/TaskCheckList.test.tsx` — checklist component variants + state transitions (AGENT-02/03)
- [ ] `apps/desktop/src/renderer/src/voice/__tests__/task-keywords.test.ts` — pt-BR keyword detection (AGENT-02/04)

Existing infrastructure to reuse (no new install):
- vitest already configured in both packages
- happy-dom env already configured for renderer tests
- vi.mock patterns established (Phase 53 streaming-tts, Phase 65 mcp client tests)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Voice STT detection of "cancela"/"para" during executing state on real microphone | AGENT-04 | Whisper STT noise sensitivity on user's actual hardware/environment is non-deterministic; no automated mic input in CI | 1. Start task that runs ≥10s. 2. Say "cancela" mid-execution. 3. Verify task halts within 1s. Repeat in WW/AL/PTT modes. |
| TTS sumário pronunciation on Kokoro / Murf for plans with 3, 5, 7 steps | AGENT-02 | Kokoro voice quality for dynamic copy ("vou fazer N coisas: ...") is a perceptual judgment; only meaningful with audio playback | 1. Trigger 3 task lengths. 2. Listen for natural cadence + correct truncation phrase. 3. Confirm in pt-BR not en-US. |
| Orb badge "AGENT 3/7" readability on transparent frameless widget over varying desktop wallpapers | AGENT-03 | Glassmorphism contrast varies with user background; not snapshot-testable | 1. Run task with frameless widget over light, dark, and image desktop. 2. Confirm badge text legible in all three. |
| End-to-end voice path: wake word → multi-step request → confirm by voice → execution → cancel by voice | AGENT-01/02/03/04 | Full voice round-trip is human-perceptible only; integrates STT/TTS/audio devices that CI can't drive | 1. "Hey JARVIS, organize minha pasta de Downloads". 2. Wait for plan TTS. 3. Say "vai". 4. Mid-execution, say "cancela". 5. Confirm chat shows expected sequence. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (6 new test files listed above)
- [ ] No watch-mode flags (--watch is forbidden in CI commands)
- [ ] Feedback latency < 30s for quick, < 120s for full
- [ ] `nyquist_compliant: true` set in frontmatter (after planner fills per-task map)

**Approval:** pending — gsd-planner to convert per-requirement skeleton into per-task map; gsd-plan-checker validates completeness before flipping `nyquist_compliant: true`.
