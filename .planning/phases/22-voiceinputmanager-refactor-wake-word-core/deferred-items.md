# Deferred Items — Phase 22

## Pre-existing test failures (not caused by Plan 22-01)

Confirmed pre-existing via `git stash` run on master before Plan 22-01 changes.
Out of scope for Plan 22-01 (mic-ownership refactor).

### 1. `src/main/__tests__/integration-chat.test.ts` — full file failure

- **Status:** Pre-existing (fails on baseline master at ec0103c)
- **Scope:** main process chat integration, unrelated to ptt-hotkey/voice input ownership
- **Action:** Defer. Needs separate investigation, likely related to gateway/backend client mocks.

### 2. `src/main/__tests__/tray.test.ts` — "DESK-04 has exactly 3 menu items"

- **Status:** Pre-existing
- **Scope:** tray menu structure assertion
- **Action:** Defer. Menu item count drifted in prior phase; test needs update.

### 3. `src/renderer/components/Orb/__tests__/Orb.test.tsx` — 2 failures

- "renders with idle animation and cyan color (ORB-01)"
- "applies 300ms transition for smooth state changes (D-04)"
- **Status:** Pre-existing
- **Scope:** Orb component — selector `[style*="width: 96px"]` returns null
- **Action:** Defer. Likely Phase 23 (ORB-POL) will revisit these as it touches
  orb visuals. Suggested: update selectors when ORB-POL-01 is implemented.

## Pass/Fail accounting for Plan 22-01

- Before Plan 22-01 (baseline master): 3 failed | 15 passed / 3 failing files
- After Plan 22-01: 3 failed | 227 passed / 3 failing files
- Net delta: +212 passing (Plan 22-01 Wave 0 tests + voiceInputManager + ptt-hotkey refactor tests
  all green), zero new regressions.

## Plan 22-03 scope check

Plan 22-03 só toca em: `scripts/`, `.github/workflows/`, `apps/desktop/resources/`,
`apps/desktop/.env.example`, `.gitignore`, `apps/desktop/electron.vite.config.ts`
(envDir), `apps/desktop/package.json` (scripts field). Nenhum código de runtime
main/renderer. Zero regressões introduzidas.

Test suite antes do Plan 22-03 (HEAD=cf985cc do Plan 22-02 Wave 1):
`Test Files 4 failed | 23 passed (27)` — mesmo estado após Plan 22-03.

As 4 falhas são:
- `integration-chat.test.ts` (pré-existente — ver item 1 acima)
- `tray.test.ts` (pré-existente — ver item 2 acima)
- `Orb.test.tsx` (pré-existente — ver item 3 acima)
- `WakeWordEngine.test.ts` (Plan 22-02 TDD Wave 0 — failing esperado, será GREEN em Plan 22-04)

**Nenhuma dessas falhas é causada por Plan 22-03.**
