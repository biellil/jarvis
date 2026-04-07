---
phase: 14
slug: typescript-backend-scaffolding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 |
| **Config file** | vitest.config.ts (Wave 0 creates) |
| **Quick run command** | `pnpm --filter backend-ts test --run` |
| **Full suite command** | `pnpm --filter backend-ts test --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter backend-ts test --run`
- **After every plan wave:** Run `pnpm --filter backend-ts test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 0 | INFRA-04 | integration | `vitest test/health.test.ts -t "GET /health" --run` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 0 | INFRA-02 | integration | `pnpm --filter backend-ts build` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | INFRA-01 | unit | `vitest test/package.test.ts -t "package.json" --run` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | INFRA-03 | unit | `vitest test/npmrc.test.ts -t "shamefully-hoist" --run` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 2 | INFRA-04 | integration | `pnpm --filter backend-ts test --run` | ✅ W0 | ⬜ pending |
| 14-04-01 | 04 | 3 | INFRA-05 | smoke | Manual: `docker build -f Dockerfile.backend-ts -t backend-ts-test .` | N/A | ⬜ pending |
| 14-05-01 | 05 | 4 | INFRA-06 | smoke | Manual: Docker Compose health check verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/health.test.ts` — integration test for GET /health endpoint (INFRA-04)
- [ ] `vitest.config.ts` — minimal config with globals: true, root: "."
- [ ] Test helper utilities for createApp() imports and supertest setup

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker image builds with native module support | INFRA-05 | Infrastructure validation; automating Docker build tests adds complexity disproportionate to value at scaffolding phase | Run `docker build -f Dockerfile.backend-ts -t backend-ts-test .` and verify exit code 0 |
| Docker Compose service starts with health check passing | INFRA-06 | Full stack integration; requires running Docker Compose environment | Run `docker-compose up -d backend-ts && sleep 35 && docker-compose ps \| grep backend-ts \| grep healthy` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
