---
phase: 8
slug: docker-compose
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Docker smoke tests (manual) + pytest (Python) + vitest (Node) |
| **Config file** | `pyproject.toml` / `apps/gateway/vitest.config.ts` |
| **Quick run command** | `docker build -f Dockerfile.python -t jarvis-python . && docker build -f Dockerfile.node -t jarvis-gateway .` |
| **Full suite command** | `docker compose up --wait && docker compose exec python-service python -c "import faster_whisper; import sounddevice; print('OK')" && curl -f http://localhost:3000/api/health` |
| **Estimated runtime** | ~3-5 minutes (image builds) |

---

## Sampling Rate

- **After every task commit:** `docker build` for the affected Dockerfile succeeds
- **After every plan wave:** Full smoke test suite: build → up → exec imports → curl endpoints
- **Before `/gsd:verify-work`:** `docker compose up --wait` succeeds + all smoke tests green
- **Max feedback latency:** 5 minutes (image build + container start)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | DOCKER-01 | smoke | `docker build -f Dockerfile.python -t jarvis-python .` | ❌ Wave 0 | ⬜ pending |
| 08-01-02 | 01 | 1 | DOCKER-01 | smoke | `docker compose exec python-service python -c "import faster_whisper; import sounddevice; import kokoro; print('OK')"` | ❌ Wave 0 | ⬜ pending |
| 08-01-03 | 01 | 1 | DOCKER-02 | smoke | `docker build -f Dockerfile.node -t jarvis-gateway .` | ❌ Wave 0 | ⬜ pending |
| 08-01-04 | 01 | 1 | DOCKER-05 | security | `.dockerignore` exists at repo root + `docker history jarvis-python` output has no `.env`/`API_KEY` | ❌ Wave 0 | ⬜ pending |
| 08-02-01 | 02 | 2 | DOCKER-03 | smoke | `docker compose up --wait && docker compose ps` — all services healthy | ❌ Wave 0 | ⬜ pending |
| 08-02-02 | 02 | 2 | DOCKER-03 | behavioral | `docker compose logs gateway` shows no requests before python-service is healthy | ❌ Wave 0 (manual) | ⬜ pending |
| 08-02-03 | 02 | 2 | DOCKER-04 | behavioral | `docker compose down && docker compose up --wait && curl -f http://localhost:3000/api/health` | ❌ Wave 0 (manual) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Docker infrastructure tests require working Dockerfiles and running containers — no unit test stubs needed. Wave 0 is the creation of the files themselves:

- [ ] `Dockerfile.python` — multi-stage Python build (this IS Wave 0)
- [ ] `Dockerfile.node` — multi-stage Node build (this IS Wave 0)
- [ ] `docker-compose.yml` — compose orchestration (this IS Wave 0)
- [ ] `.dockerignore` — root-level ignore file (this IS Wave 0)

*Existing pytest + vitest infrastructure covers all non-Docker requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gateway waits for Python health | DOCKER-03 | Requires observing startup sequence in real time | Run `docker compose up` (no `--wait`), watch logs — gateway must not start until python-service shows `healthy` |
| Data persists after restart | DOCKER-04 | Requires state before/after | Send a message, run `docker compose down`, run `docker compose up --wait`, check that message history is in response |
| `.env` absent from image layers | DOCKER-05 | Requires inspecting Docker layer history | `docker history --no-trunc jarvis-python \| grep -iE "api_key\|openai\|anthropic"` must return empty |
| ML imports work in container | DOCKER-01 | Requires running container | `docker compose exec python-service python -c "import faster_whisper; import sounddevice; import kokoro; print('OK')"` must exit 0 |

---

## Validation Sign-Off

- [ ] All tasks have smoke test or manual verification steps
- [ ] Wave 0 = the Dockerfiles themselves (creation is verification)
- [ ] No watch-mode flags in any test command
- [ ] `nyquist_compliant: true` set in frontmatter after smoke tests pass

**Approval:** pending
