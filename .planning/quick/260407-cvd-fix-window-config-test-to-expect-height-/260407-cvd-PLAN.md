---
task: 260407-cvd
type: execute
wave: 1
depends_on: []
files_modified: [apps/desktop/src/main/__tests__/window-config.test.ts]
autonomous: true
---

<objective>
Fix window configuration test to expect the correct height value (300) that was set in Phase 12-04.

Purpose: Align test assertions with the actual implementation that uses 300px height for speech bubble.
Output: Updated test file with correct height expectation.
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
  <name>Task 1: Update height test assertion</name>
  <files>apps/desktop/src/main/__tests__/window-config.test.ts</files>
  <action>
    Update the window configuration test to expect height: 300 instead of height: 128.
    This aligns with the Phase 12-04 decision for fixed 300px window height for the speech bubble.

    Changes needed:
    1. Line 36: Update test description from "Window size 128x128" to "Window size 128x300 (Phase 12-04)"
    2. Line 41-42: Update test to check for height: 300 instead of height: 128

    The width remains 128 as before - only height has changed per the speech bubble requirements.
  </action>
  <verify>
    <automated>pnpm --filter desktop test window-config</automated>
  </verify>
  <done>Test passes with height: 300 assertion</done>
</task>

</tasks>

<verification>
All window configuration tests pass with the updated height value.
</verification>

<success_criteria>
- Window config test expects height: 300
- Test description reflects Phase 12-04 requirements
- All tests in window-config.test.ts pass
</success_criteria>

<output>
After completion, create `.planning/quick/260407-cvd-fix-window-config-test-to-expect-height-/260407-cvd-SUMMARY.md`
</output>