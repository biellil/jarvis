---
phase: quick-260514-sjn
plan: 01
type: quick
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/desktop/electron.vite.config.ts

must_haves:
  truths:
    - "'open' package is externalized and not bundled by Rollup"
    - "Build completes without errors related to 'open' package"
  artifacts:
    - path: "apps/desktop/electron.vite.config.ts"
      provides: "MAIN_EXTERNALS array with 'open' entry"
      contains: "'open'"
  key_links:
    - from: "rollupOptions.external"
      to: "MAIN_EXTERNALS"
      via: "array reference"
      pattern: "external: MAIN_EXTERNALS"
---

<objective>
Add 'open' package to the MAIN_EXTERNALS array in electron.vite.config.ts to fix build error.

Purpose: The 'open' package is causing a build error because it's being bundled by Rollup when it should be externalized. The 'open' package uses platform-specific child process calls that cannot be bundled properly.

Output: Updated electron.vite.config.ts with 'open' in MAIN_EXTERNALS list, allowing the build to complete successfully.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/jarvis/.planning/STATE.md
@C:/jarvis/apps/desktop/electron.vite.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 'open' to MAIN_EXTERNALS array</name>
  <files>apps/desktop/electron.vite.config.ts</files>
  <action>
Add the string 'open' to the MAIN_EXTERNALS array (currently lines 94-104).

Insert it after 'kokoro-js' and before 'sharp', maintaining the alphabetical-like grouping pattern and existing comment structure.

The 'open' package uses platform-specific child process calls to open URLs/files in the system's default application. Like other native or system-dependent packages (electron-store, onnxruntime-node, kokoro-js, sharp), it must be externalized so it's not bundled by Rollup and can execute properly at runtime.

No other changes needed — the existing rollupOptions.external already references MAIN_EXTERNALS.
  </action>
  <verify>
    <automated>
# Verify 'open' appears in MAIN_EXTERNALS
grep -n "'open'" apps/desktop/electron.vite.config.ts

# Verify build completes without errors
cd apps/desktop && npm run build
    </automated>
  </verify>
  <done>
- 'open' string appears in MAIN_EXTERNALS array
- Build completes without bundling errors related to 'open'
- Config file maintains proper formatting and comments
  </done>
</task>

</tasks>

<verification>
1. MAIN_EXTERNALS array contains 'open' entry
2. `npm run build` in apps/desktop completes successfully
3. No Rollup warnings about external dependencies
</verification>

<success_criteria>
- Build process completes without errors
- 'open' package is properly externalized
- Config file maintains readability with existing pattern
</success_criteria>

<output>
After completion, create `.planning/quick/260514-sjn-adicionar-open-lista-main-externals-em-a/260514-sjn-SUMMARY.md`
</output>
