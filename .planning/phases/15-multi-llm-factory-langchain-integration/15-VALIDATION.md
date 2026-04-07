---
phase: 15
slug: multi-llm-factory-langchain-integration
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-07
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 |
| **Config file** | vitest.config.ts (inherited from Phase 14) |
| **Quick run command** | `pnpm --filter backend-ts test --run` |
| **Full suite command** | `pnpm --filter backend-ts test --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter backend-ts test --run`
- **After every plan wave:** Run `pnpm --filter backend-ts test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 0 | LLM-TS-01 | unit | `vitest test/llm/factory.test.ts -t "createLLM factory" --run` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 0 | LLM-TS-02 | unit | `vitest test/llm/providers/lmstudio.test.ts -t "LM Studio" --run` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 0 | LLM-TS-03 | unit | `vitest test/config/validation.test.ts -t "version check" --run` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | LLM-TS-01 | integration | `pnpm --filter backend-ts test test/llm/factory.test.ts --run` | ✅ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | LLM-TS-02 | integration | `pnpm --filter backend-ts test test/integration/lmstudio.test.ts --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/llm/factory.test.ts` — Unit tests for createLLM factory function (LLM-TS-01)
- [ ] `test/llm/providers/lmstudio.test.ts` — Unit tests for LM Studio provider configuration (LLM-TS-02)
- [ ] `test/llm/providers/claude.test.ts` — Unit tests for Claude provider configuration (LLM-TS-01)
- [ ] `test/llm/providers/openai.test.ts` — Unit tests for OpenAI provider configuration (LLM-TS-01)
- [ ] `test/config/validation.test.ts` — Unit tests for Settings class and zod validation (LLM-TS-03)
- [ ] `test/integration/lmstudio.test.ts` — Integration test with real LM Studio (skips if offline)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LM Studio integration test | LLM-TS-02 | Requires LM Studio running locally; automated test skips if offline | 1. Start LM Studio on http://localhost:1234<br>2. Run `pnpm --filter backend-ts test test/integration/lmstudio.test.ts --run`<br>3. Verify test passes with real response from LM Studio |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
