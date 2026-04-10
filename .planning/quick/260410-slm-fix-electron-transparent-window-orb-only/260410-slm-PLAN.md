---
phase: quick
plan: 260410-slm
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop/src/main/index.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "The Electron window shows only the orb and its glow — no dark rectangle visible"
    - "Window background is fully transparent where no pixels are painted"
  artifacts:
    - path: apps/desktop/src/main/index.ts
      provides: BrowserWindow config with transparent: true and no backgroundColor
  key_links:
    - from: apps/desktop/src/main/index.ts
      to: Electron BrowserWindow
      via: "transparent: true without backgroundColor override"
      pattern: "transparent: true"
---

<objective>
Remove the `backgroundColor` property from the Electron BrowserWindow config so the
`transparent: true` setting takes full effect.

Purpose: The dark rectangle (#0F172A) is painting over the transparent compositing layer,
making the entire 128x300 window opaque. Removing it leaves the window fully transparent
so only painted renderer pixels (the orb + glow) are visible.

Output: Modified `apps/desktop/src/main/index.ts` with `backgroundColor` line removed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove backgroundColor from BrowserWindow config</name>
  <files>apps/desktop/src/main/index.ts</files>
  <action>
    In `createWindow()`, delete line 40:
    ```
    backgroundColor: '#0F172A',  // Match UI-SPEC slate-900
    ```
    Leave all other BrowserWindow options intact. `transparent: true` already on line 42
    will now fully control compositing.

    Do NOT replace it with `backgroundColor: 'transparent'` or `backgroundColor: '#00000000'`
    — the correct fix is complete removal, which lets Electron default to the native
    transparent compositing path.
  </action>
  <verify>
    <automated>cd C:/jarvis && pnpm --filter desktop test --run 2>&1 | tail -20</automated>
  </verify>
  <done>
    Line `backgroundColor: '#0F172A'` no longer exists in `apps/desktop/src/main/index.ts`.
    All existing tests pass (window-config.test.ts does not assert on backgroundColor).
  </done>
</task>

</tasks>

<verification>
After task completes:
- Confirm `backgroundColor` is absent from BrowserWindow options in index.ts
- Run `pnpm --filter desktop test --run` — all tests green
- Optional manual check: `pnpm --filter desktop dev` and verify only the orb renders, no dark rectangle
</verification>

<success_criteria>
`apps/desktop/src/main/index.ts` contains `transparent: true` with no `backgroundColor`
property in BrowserWindow config. Desktop test suite passes.
</success_criteria>

<output>
After completion, create `.planning/quick/260410-slm-fix-electron-transparent-window-orb-only/260410-slm-SUMMARY.md`
with what was changed and the commit hash.
</output>
