---
phase: 07-monorepo-express-gateway
plan: "01"
subsystem: gateway
tags: [monorepo, pnpm, express, typescript, zod, validation, error-handling]
dependency_graph:
  requires: []
  provides: [pnpm-workspace, gateway-foundation, zod-validation-middleware, error-handler-middleware]
  affects: [07-02-proxy-routes]
tech_stack:
  added: [express@5.2.1, zod@4.3.6, undici@8.0.2, typescript@6.0.2, vitest@4.1.2, supertest@7.2.2, tsx@4.21.0]
  patterns: [pnpm-workspaces, express-app-factory, zod-middleware, error-normalization]
key_files:
  created:
    - pnpm-workspace.yaml
    - package.json
    - pnpm-lock.yaml
    - packages/gateway/package.json
    - packages/gateway/tsconfig.json
    - packages/gateway/src/config.ts
    - packages/gateway/src/app.ts
    - packages/gateway/src/index.ts
    - packages/gateway/src/middleware/validate.ts
    - packages/gateway/src/middleware/errorHandler.ts
    - packages/gateway/vitest.config.ts
    - packages/gateway/test/helpers.ts
    - packages/gateway/test/error.test.ts
  modified:
    - .env
    - .gitignore
decisions:
  - "pnpm workspaces with packages/* glob — single pnpm install installs all Node deps alongside Python codebase"
  - "No dotenv import in config.ts — uses --env-file flag in package.json scripts to share root .env"
  - "errorHandler never exposes err.stack — GW-04 compliance enforced by design"
  - "supertest added as devDep for HTTP-level middleware testing without running a server"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  files_created: 13
  files_modified: 2
---

# Phase 7 Plan 01: Monorepo Scaffold + Gateway Foundation Summary

**One-liner:** pnpm workspace with Express 5 + TypeScript 6 gateway using Zod v4 middleware for request validation (GW-05) and error normalization (GW-04), 6 vitest tests passing.

## What Was Built

Scaffolded the pnpm monorepo workspace coexisting with the Python codebase, and created the complete Express/TypeScript gateway foundation at `packages/gateway/`.

### Workspace Structure

```
jarvis/                        (root)
├── pnpm-workspace.yaml        packages/* workspace declaration
├── package.json               root manifest (private, engines node>=22)
├── pnpm-lock.yaml             lockfile (134 packages)
├── .env                       +FASTAPI_URL, +GATEWAY_PORT
└── packages/
    └── gateway/
        ├── package.json       @jarvis/gateway, express 5, zod 4, undici 8
        ├── tsconfig.json      extends @tsconfig/node22
        ├── vitest.config.ts
        ├── src/
        │   ├── config.ts      reads FASTAPI_URL and GATEWAY_PORT
        │   ├── app.ts         createApp() factory
        │   ├── index.ts       entry point (listens on config.gatewayPort)
        │   └── middleware/
        │       ├── validate.ts     Zod validation middleware + ChatRequestSchema
        │       └── errorHandler.ts error normalization (GW-04)
        └── test/
            ├── helpers.ts
            └── error.test.ts  6 tests (GW-04 + GW-05)
```

### Key Design Decisions

- **No dotenv import:** config.ts reads `process.env` directly — the `--env-file ../../.env` flag in package.json scripts loads the shared root `.env` before Node starts
- **Error shape GW-04:** `{ error: true, code: string, message: string }` — never includes stack trace by design
- **Validation shape GW-05:** Invalid payload returns 400 with `code: "VALIDATION_ERROR"` before reaching proxy logic
- **Express 5 error handling:** Thrown errors are caught automatically in Express 5 async routes — no need for try/catch wrappers

## Verification Results

```
pnpm install          ✓  134 packages installed
tsc --noEmit          ✓  TypeScript compiles cleanly (0 errors)
vitest --run          ✓  6/6 tests passing
python -m pytest      ✓  251/251 Python tests unaffected
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 — Workspace scaffold | 63dbb3a | chore(07-01): scaffold pnpm workspace and gateway package |
| 2 — Gateway foundation | 6eefd56 | feat(07-01): Express gateway foundation with validation and error handling |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Config] Added node_modules/ to .gitignore**
- **Found during:** Task 1
- **Issue:** The .gitignore did not include `node_modules/` — this would have caused all 134 Node packages to be staged for git commit
- **Fix:** Added `node_modules/` and `pnpm-debug.log*` entries to .gitignore before committing
- **Files modified:** .gitignore
- **Commit:** Included in 63dbb3a

## Known Stubs

None — no placeholder data, hardcoded values, or incomplete data wiring. The gateway app factory (`createApp`) has comments indicating where Plan 02 will wire chat and health routes, but this is intentional scaffolding (the middleware is fully functional).

## Self-Check: PASSED

All files exist on disk and both commits are present in git log.
