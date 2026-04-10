---
quick_task: 260410-sox
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop/src/main/index.ts
  - apps/desktop/src/shared/ipc-types.ts
  - apps/desktop/src/preload/index.ts
  - apps/desktop/src/renderer/src/styles/globals.css
  - apps/desktop/src/renderer/src/App.tsx
  - apps/desktop/src/renderer/src/App.css
  - apps/desktop/src/main/__tests__/window-config.test.ts
autonomous: true

must_haves:
  truths:
    - "Only the glass orb is visible on desktop — no dark rectangle or box around it"
    - "Clicks on transparent areas outside the orb pass through to the desktop"
    - "Mouse events are captured when hovering over the orb (drag works)"
    - "Window is 160x160 — no excess invisible rectangle below orb"
  artifacts:
    - path: "apps/desktop/src/main/index.ts"
      provides: "BrowserWindow with transparent config + IPC handler"
      contains: "backgroundColor: '#00000000', hasShadow: false, setIgnoreMouseEvents"
    - path: "apps/desktop/src/renderer/src/styles/globals.css"
      provides: "html element transparency"
      contains: "html { background: transparent"
    - path: "apps/desktop/src/main/__tests__/window-config.test.ts"
      provides: "Updated size/transparency tests"
      contains: "160, '#00000000', hasShadow: false"
  key_links:
    - from: "App.tsx onMouseEnter/onMouseLeave"
      to: "ipcMain.on('window:set-ignore-mouse')"
      via: "preload setIgnoreMouseEvents → ipcRenderer.send"
      pattern: "setIgnoreMouseEvents"
---

<objective>
Fix the Electron orb widget so only the glass orb sphere is visible on the desktop — no surrounding dark rectangle, no OS shadow box. Transparent areas outside the orb must pass clicks through to the desktop. The window shrinks from 128×300 to 160×160.

Purpose: The orb should float on the desktop as a pure glass sphere with no visual container. Current state shows an opaque or dark rectangle behind the orb due to missing transparency flags, wrong window dimensions, and the `html` element lacking `background: transparent`.

Output: 160×160 transparent window, orb centered, click-through in transparent zones, IPC toggle for mouse capture when hovering over orb, updated tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: BrowserWindow transparency + IPC click-through</name>
  <files>apps/desktop/src/main/index.ts, apps/desktop/src/shared/ipc-types.ts, apps/desktop/src/preload/index.ts</files>
  <action>
Three files, all IPC wiring for transparent window and click-through.

**apps/desktop/src/main/index.ts**
1. Add `ipcMain` to the electron import (existing import has `app, BrowserWindow, dialog, screen` — add `ipcMain`).
2. In the BrowserWindow constructor options:
   - Change `width: 128` → `width: 160`
   - Change `height: 300` → `height: 160`
   - Add `backgroundColor: '#00000000'` (explicit transparent hex — omitting backgroundColor on Windows 11 defaults to white)
   - Add `hasShadow: false` (OS shadow paints a visible rectangle behind the window)
3. After the `mainWindow.once('ready-to-show', ...)` block, add:
   ```ts
   mainWindow.setIgnoreMouseEvents(true, { forward: true });
   ```
   This makes transparent areas click-through by default. `forward: true` keeps mousemove events flowing into the renderer so the orb can detect hover.
4. After the `setupIpcHandlers(mainWindow)` call, add the IPC listener:
   ```ts
   ipcMain.on('window:set-ignore-mouse', (_event, ignore: boolean) => {
     mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
   });
   ```

**apps/desktop/src/shared/ipc-types.ts**
In `IPC_CHANNELS` object add:
```ts
SET_IGNORE_MOUSE: 'window:set-ignore-mouse',
```
In `JarvisAPI` interface add:
```ts
setIgnoreMouseEvents: (ignore: boolean) => void;
```

**apps/desktop/src/preload/index.ts**
In the contextBridge `api` object add:
```ts
setIgnoreMouseEvents: (ignore: boolean): void => {
  ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE, ignore);
},
```
  </action>
  <verify>
    <automated>cd /c/jarvis && pnpm --filter @jarvis/desktop run type-check 2>&1 | tail -20</automated>
  </verify>
  <done>TypeScript compiles without errors. IPC_CHANNELS.SET_IGNORE_MOUSE exists, JarvisAPI has setIgnoreMouseEvents, main registers the ipcMain handler, BrowserWindow has width:160, height:160, backgroundColor:'#00000000', hasShadow:false.</done>
</task>

<task type="auto">
  <name>Task 2: Renderer transparency + orb layout + mouse handlers</name>
  <files>apps/desktop/src/renderer/src/styles/globals.css, apps/desktop/src/renderer/src/App.tsx, apps/desktop/src/renderer/src/App.css</files>
  <action>
**apps/desktop/src/renderer/src/styles/globals.css**
Add at the top of the file (before or after the existing `* { ... }` block):
```css
html {
  background: transparent;
  overflow: hidden;
}
```
The `html` element was missing `background: transparent` — only `body` had it. This causes a white/colored rectangle because the browser paints the html root before body.

**apps/desktop/src/renderer/src/App.css**
- Change `min-height: 300px` → `min-height: 160px` in `.app-container`
- Change `justify-content: flex-end` → `justify-content: center` in `.app-container` (was flex-end to push chat bubble down in the old 300px window; now window is 160px and orb should be centered)

**apps/desktop/src/renderer/src/App.tsx**
On the root container `<div>` (the one with `h-screen w-screen flex items-center justify-center`):
1. Remove `WebkitAppRegion: 'drag'` from the root div inline style (if present there)
2. Add mouse event handlers:
   ```tsx
   onMouseEnter={() => window.jarvis.setIgnoreMouseEvents?.(false)}
   onMouseLeave={() => window.jarvis.setIgnoreMouseEvents?.(true)}
   ```
   When mouse enters the orb area → disable click-through (allow drag). When mouse leaves → re-enable click-through.
3. Move `WebkitAppRegion: 'drag'` to the div wrapping `<Orb />` directly, not the root div.

Do NOT remove ChatInput component code — just leave it in place (it will be hidden below the 160px viewport, which is acceptable for this fix; it will be redesigned in v1.4).
  </action>
  <verify>
    <automated>cd /c/jarvis && pnpm --filter @jarvis/desktop run type-check 2>&1 | tail -20</automated>
  </verify>
  <done>globals.css has `html { background: transparent; overflow: hidden; }`. App.css has min-height: 160px and justify-content: center. App.tsx root div has onMouseEnter/onMouseLeave calling setIgnoreMouseEvents. TypeScript compiles clean.</done>
</task>

<task type="auto">
  <name>Task 3: Update window-config tests for new dimensions and transparency</name>
  <files>apps/desktop/src/main/__tests__/window-config.test.ts</files>
  <action>
Update the existing window-config tests to match the new BrowserWindow options:

1. Find assertions for `width: 128` → change to `width: 160`
2. Find assertions for `height: 300` → change to `height: 160`
3. Add assertion for `backgroundColor: '#00000000'`:
   ```ts
   expect(capturedOptions.backgroundColor).toBe('#00000000');
   ```
4. Add assertion for `hasShadow: false`:
   ```ts
   expect(capturedOptions.hasShadow).toBe(false);
   ```

These tests verify the BrowserWindow constructor received the correct transparency configuration. The existing test structure (mock BrowserWindow capturing constructor options) does not need to change — only the expected values.
  </action>
  <verify>
    <automated>cd /c/jarvis && pnpm --filter @jarvis/desktop run test -- --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>All window-config tests pass. Tests assert width:160, height:160, backgroundColor:'#00000000', hasShadow:false.</done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `pnpm --filter @jarvis/desktop run type-check` — zero errors
2. `pnpm --filter @jarvis/desktop run test` — all tests pass including updated window-config tests
3. Manual: run `pnpm --filter @jarvis/desktop run dev`, observe only the glass orb is visible on desktop with no rectangle behind it
</verification>

<success_criteria>
- BrowserWindow is 160×160 with backgroundColor '#00000000' and hasShadow false
- `html` element has `background: transparent` in globals.css
- Transparent zones outside the orb pass mouse clicks to the desktop
- Mouse entering the orb disables click-through; leaving re-enables it
- All tests pass
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, commit with:
```
✨ feat(desktop): transparent orb window — remove rectangle, 160x160, click-through
```
No Co-Authored-By lines. No Generated-with-Claude lines.
</output>
