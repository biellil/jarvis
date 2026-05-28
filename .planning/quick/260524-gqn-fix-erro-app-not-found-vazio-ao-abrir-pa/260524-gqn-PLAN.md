---
type: quick
autonomous: true
files_modified:
  - apps/backend-ts/src/session/pc-tools.ts
  - apps/backend-ts/test/fixtures/tools/open_app.json
  - apps/backend-ts/test/fixtures/tools/close_app.json
---

<objective>
Fix two bugs in pc-tools.ts causing "App not found: ''" errors and missing open_folder support.

Bug 1: `open_app` and `close_app` send `args: { app: app_name }` but Python reads `params.get("app_name", "")` — key mismatch returns empty string every time.
Bug 2: No `createOpenFolderTool()` exists, so LLM falls back to open_app with wrong params when user asks to open a folder.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Fix key mismatch in open_app and close_app, add open_folder tool</name>
  <files>apps/backend-ts/src/session/pc-tools.ts</files>
  <action>
Three changes in this file:

1. In `createOpenAppTool` (line 36), change the args key:
   - Before: `args: { app: app_name }`
   - After:  `args: { app_name: app_name }`

2. In `createCloseAppTool` (line 56), same fix:
   - Before: `args: { app: app_name }`
   - After:  `args: { app_name: app_name }`

3. Add a new exported function `createOpenFolderTool()` in the `// ---------- files ----------` section, after `createCloseAppTool` and before `createListFilesTool`:

```typescript
export function createOpenFolderTool() {
  return tool(
    async ({ path }: { path: string }) => {
      return buildResult({ action: 'open_folder', args: { path } });
    },
    {
      name: 'open_folder',
      description:
        'Abre uma pasta no explorador de arquivos. Use quando o usuário pedir para abrir, ' +
        'mostrar ou navegar até uma pasta (ex: "abre a pasta Downloads", "mostra meus documentos").',
      schema: z.object({
        path: z
          .string()
          .describe('Caminho da pasta a abrir (ex: "~/Downloads", "C:\\\\Users\\\\user\\\\Documents").'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}
```

4. In `createAllPcTools()`, add `createOpenFolderTool()` to the return array, right after `createCloseAppTool()`.
  </action>
  <verify>npx tsc --noEmit -p apps/backend-ts/tsconfig.json</verify>
  <done>TypeScript compiles without errors; open_app/close_app send app_name key; open_folder tool exists in createAllPcTools()</done>
</task>

<task type="auto">
  <name>Task 2: Update snapshot fixtures and add open_folder fixture</name>
  <files>
    apps/backend-ts/test/fixtures/tools/open_app.json
    apps/backend-ts/test/fixtures/tools/close_app.json
    apps/backend-ts/test/fixtures/tools/open_folder.json
  </files>
  <action>
1. Update `open_app.json` — change the args key to match the fix:
   - Before: `{"action": "open_app", "args": {"app": "firefox"}}`
   - After:  `{"action": "open_app", "args": {"app_name": "firefox"}}`

2. Update `close_app.json` — same key fix:
   - Before: `{"action": "close_app", "args": {"app": "vlc"}}`
   - After:  `{"action": "close_app", "args": {"app_name": "vlc"}}`

3. Create new file `apps/backend-ts/test/fixtures/tools/open_folder.json`:
   `{"action": "open_folder", "args": {"path": "~/Downloads"}}`
  </action>
  <verify>
Run snapshot tests: cd apps/backend-ts && npx jest --testPathPattern=tools --passWithNoTests
If no snapshot test exists yet, verify files exist and have correct JSON with: node -e "const f=require('./test/fixtures/tools/open_app.json'); console.assert(f.args.app_name === 'firefox', 'key mismatch')" from apps/backend-ts
  </verify>
  <done>Fixture files reflect the corrected key names; open_folder.json exists; no snapshot test failures</done>
</task>

</tasks>

<success_criteria>
- `open_app` tool sends `{ app_name: "..." }` — Python's `params.get("app_name", "")` returns the correct name
- `close_app` tool sends `{ app_name: "..." }` — same fix
- `open_folder` tool exists, sends `{ action: "open_folder", args: { path } }` matching Python's handler
- All fixture JSONs are consistent with the new payloads
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, commit with:
`🐛 fix(pc-tools): corrigir key mismatch em open_app/close_app e adicionar tool open_folder`
</output>
