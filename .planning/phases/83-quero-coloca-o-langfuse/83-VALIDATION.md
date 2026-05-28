---
phase: 83
slug: quero-coloca-o-langfuse
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-27
---

# Phase 83 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 (existing in backend-ts) |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npm test -- src/observability/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/observability/`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 83-01-01 | 01 | 0 | TBD-01 | unit | `npm test -- observability/langfuse.test.ts` | ❌ W0 | ⬜ pending |
| 83-01-02 | 01 | 0 | TBD-02 | integration | `npm test -- routes/chat.test.ts` | ❌ W0 | ⬜ pending |
| 83-01-03 | 01 | 0 | TBD-03 | unit | `npm test -- memory/vectors.test.ts` | ❌ W0 | ⬜ pending |
| 83-01-04 | 01 | 0 | TBD-04 | unit | `npm test -- mcp/tool-adapter.test.ts` | ❌ W0 | ⬜ pending |
| 83-02-01 | 02 | 1 | TBD-01,02 | unit+int | `npm test -- observability/langfuse.test.ts` | ❌ W0 | ⬜ pending |
| 83-02-02 | 02 | 1 | TBD-03 | unit | `npm test -- memory/vectors.test.ts` | ❌ W0 | ⬜ pending |
| 83-02-03 | 02 | 1 | TBD-04 | unit | `npm test -- mcp/tool-adapter.test.ts` | ❌ W0 | ⬜ pending |
| 83-03-01 | 03 | 2 | TBD-05,06 | integration | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/observability/langfuse.test.ts` — unit tests para createLangfuseHandler, config, error handling
- [ ] `src/observability/langfuse.ts` — módulo principal (stub Wave 0)
- [ ] Updated `src/routes/chat.test.ts` — integration test com mocked handler
- [ ] Updated `src/memory/vectors.test.ts` — ChromaDB span wrapping
- [ ] Updated `src/mcp/client/tool-adapter.test.ts` — MCP tool span verification
- [ ] `infra/langfuse/docker-compose.yml` — self-hosted stack
- [ ] `.env.example` — LANGFUSE_ENABLED, LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Traces aparecem no Langfuse UI com planner+executor nodes | TBD-05 | Requer Docker + Langfuse running | 1. Start infra/langfuse/docker-compose.yml 2. Set LANGFUSE_ENABLED=true + keys 3. Enviar mensagem ao JARVIS 4. Verificar trace no UI http://localhost:3000 |
| Langfuse desabilitado não adiciona latência | TBD-06 | Benchmark manual | Comparar tempo de resposta com LANGFUSE_ENABLED=false vs sem a variável |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
