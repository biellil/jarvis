---
phase: 21-cutover-python-deprecation
verified: 2026-04-10T21:50:51Z
status: passed
score: 6/6 must-haves verified
gaps: []
---

# Phase 21: Cutover Python Deprecation — Verification Report

**Phase Goal:** Make TypeScript the permanent default backend and completely remove the Python backend from the monorepo.
**Verified:** 2026-04-10T21:50:51Z
**Status:** gaps_found — 2 gaps blocking complete goal achievement
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Gateway roteia 100% dos requests para backendTsUrl sem qualquer lógica condicional | VERIFIED | backendRouter.ts and backendRouter.test.ts absent from middleware/; config.ts has 3 fields only (backendTsUrl, gatewayPort, apiKey); chat.ts uses config.backendTsUrl in all 3 routes |
| 2 | Nenhum arquivo backendRouter.ts ou backendRouter.test.ts existe em apps/gateway/src/middleware/ | VERIFIED | middleware/ contains only errorHandler.ts and validate.ts |
| 3 | O diretório src/jarvis/ não existe mais no monorepo | FAILED | src/jarvis/ exists with core/, llm/ subdirs (containing only __pycache__); src/jarvis.egg-info/ also remains |
| 4 | docker-compose.yml contém apenas backend-ts e gateway (sem python-service) | VERIFIED | docker-compose.yml has exactly 2 services (gateway, backend-ts); no python-service, FASTAPI_URL, depends_on, or Dockerfile.python references |
| 5 | README.md não menciona Python backend, porta 8000, FastAPI ou uvicorn | VERIFIED | No matches for "python backend", "FastAPI", "uvicorn", "src/jarvis" (as a path in project tree), or "legado v1.0"; status badge reads "v1.3 completo — stack TypeScript-only. Backend Python removido." |
| 6 | .env não contém FASTAPI_URL nem SQLITE_PATH ativos | FAILED | .env line 21: SQLITE_PATH=data/jarvis.db; .env line 62: FASTAPI_URL=http://127.0.0.1:8000 |

**Score:** 4/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/gateway/src/config.ts` | 3 fields only: backendTsUrl, gatewayPort, apiKey | VERIFIED | Exactly 3 fields, no fastapiUrl |
| `apps/gateway/src/routes/chat.ts` | 3 routes using config.backendTsUrl directly | VERIFIED | grep -c "config.backendTsUrl" returns 3; no resolveUpstreamUrl or backendRouter imports |
| `apps/gateway/src/middleware/backendRouter.ts` | DELETED | VERIFIED | File does not exist |
| `apps/gateway/src/middleware/backendRouter.test.ts` | DELETED | VERIFIED | File does not exist |
| `docker-compose.yml` | 2 services: gateway + backend-ts | VERIFIED | Exactly 2 services confirmed |
| `src/jarvis/` | DELETED (non-existent) | FAILED | Directory exists; contains core/__pycache__, llm/__pycache__, __pycache__ |
| `src/jarvis.egg-info/` | DELETED (non-existent) | FAILED | Directory exists with Python packaging metadata |
| `Dockerfile.python` | DELETED | VERIFIED | File does not exist |
| `README.md` | No Python backend references; contains "backend-ts" | VERIFIED | backend-ts appears 4 times; no Python backend or FastAPI references |
| `.env.example` | No FASTAPI_URL or SQLITE_PATH; BACKEND_TS_URL and CHROMA_PATH present | VERIFIED | Confirmed clean; BACKEND_TS_URL, CHROMA_PATH, JARVIS_API_KEY all present |
| `.env` | No FASTAPI_URL or SQLITE_PATH | FAILED | Both vars present on lines 21 and 62 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| apps/gateway/src/routes/chat.ts | config.backendTsUrl | direct import of config | WIRED | import on line 4; used in lines 19, 68, and the audio route |
| docker-compose.yml | Dockerfile.backend-ts | build.dockerfile | WIRED | Line 16: `dockerfile: Dockerfile.backend-ts` |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase is a deletion/cleanup phase, not a feature introducing dynamic data rendering.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| backendRouter files absent | ls /c/jarvis/apps/gateway/src/middleware/ | errorHandler.ts, validate.ts only | PASS |
| config.ts has only 3 fields | cat config.ts | backendTsUrl, gatewayPort, apiKey | PASS |
| chat.ts uses backendTsUrl 3 times | grep -c "config.backendTsUrl" chat.ts | 3 | PASS |
| docker-compose has 2 services only | grep "^  [a-z]" docker-compose.yml | gateway, backend-ts, jarvis-net | PASS |
| src/jarvis/ removed | ls /c/jarvis/src/jarvis/ | EXISTS (core/, llm/, __pycache__) | FAIL |
| .env clean of Python vars | grep "FASTAPI_URL\|SQLITE_PATH" .env | lines 21 and 62 match | FAIL |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VAL-08 | 21-01, 21-03 | TypeScript backend hardcoded as default | SATISFIED | config.ts has only backendTsUrl; chat.ts routes directly to it |
| VAL-09 | 21-01, 21-03 | Feature flag / backendRouter removed | SATISFIED | backendRouter.ts and .test.ts deleted; no resolveUpstreamUrl references anywhere |
| VAL-10 | 21-02, 21-03 | Python backend physically removed from monorepo | BLOCKED | src/jarvis/ and src/jarvis.egg-info/ still exist; .env still contains FASTAPI_URL and SQLITE_PATH |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/gateway/src/routes/chat.ts | 16 | `// GW-01: POST /chat — proxy to FastAPI POST /chat` | Info | Stale comment — routes to backend-ts not FastAPI; functional routing is correct |
| apps/gateway/src/routes/chat.ts | 28 | `"FastAPI error"` string literal in Error constructor | Info | Stale error message label — does not affect routing behavior |
| apps/gateway/src/routes/chat.ts | 44 | `// GW-02: GET /chat/stream — SSE passthrough from FastAPI GET /chat/stream` | Info | Stale comment — same as above |
| src/jarvis/ | — | Python directory not removed | Blocker | Violates D-02: Python backend must be completely removed from monorepo |
| src/jarvis.egg-info/ | — | Python packaging artifact not removed | Blocker | Leftover Python build artifact; indicates src/ was not cleaned properly |
| .env | 21 | `SQLITE_PATH=data/jarvis.db` | Blocker | Plan 03 Task 2 required removing this line; it was not removed |
| .env | 62 | `FASTAPI_URL=http://127.0.0.1:8000` | Blocker | Plan 03 Task 2 required removing this line; it was not removed |

---

### Human Verification Required

No human verification needed — all remaining gaps are programmatically verifiable and confirmed as failures.

---

### Gaps Summary

Two distinct gaps block full goal achievement:

**Gap 1 — src/jarvis/ not fully removed.**
The plan required `rm -rf src/jarvis/` and conditional `rmdir src/`. The source `.py` files appear to have been deleted (no `.py` files found under `src/`), but the directory skeleton and `__pycache__` bytecode files were left behind. Additionally, `src/jarvis.egg-info/` (Python packaging metadata generated by `pip install -e .`) was not removed. The `src/` directory itself still exists with these two subdirectories. This directly blocks requirement VAL-10 (Python backend physically removed from monorepo).

**Gap 2 — .env active file not cleaned.**
Plan 03 Task 2 explicitly required removing `SQLITE_PATH=data/jarvis.db` and `FASTAPI_URL=http://127.0.0.1:8000` from the active `.env` file. Neither line was removed. The `.env.example` was correctly cleaned (VERIFIED), but the active `.env` was skipped. The FASTAPI_URL line even has a comment confirming it is a Python legacy var (`# Python backend (legado, usado apenas pra E2E validation Phase 20)`), making the omission visible.

**What is correct:**
- Gateway cleanup (Plan 21-01): fully complete — backendRouter deleted, config.ts simplified to 3 fields, chat.ts hardcoded to backendTsUrl, all 3 route usages confirmed.
- Docker Compose cleanup (Plan 21-02 Task 2): fully complete — 2-service compose confirmed, no python-service references.
- Dockerfile.python: deleted correctly.
- README.md: correctly updated — status badge updated, src/jarvis path removed from project tree, no FastAPI/uvicorn references.
- .env.example: correctly cleaned — no FASTAPI_URL or SQLITE_PATH.

**Root cause of gaps:** Plan 21-02 Task 1 (delete src/jarvis/) appears to have been partially executed — Python source files were removed but the directory structure and `__pycache__` bytecode files were not. Plan 21-03 Task 2 was applied to `.env.example` but not to `.env`.

---

_Verified: 2026-04-10T21:50:51Z_
_Verifier: Claude (gsd-verifier)_
