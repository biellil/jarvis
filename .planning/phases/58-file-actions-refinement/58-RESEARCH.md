# Phase 58: File Actions Refinement - Research

**Researched:** 2026-05-06  
**Domain:** File action confirmation logic, fallback handlers, path canonicalization  
**Confidence:** HIGH

## Summary

Phase 58 refines the file action system (built in Phase 55) by introducing a **distinction between read-only and destructive actions**. Currently, all file actions require explicit user confirmation via toast. This phase separates them:

- **Read-only actions** (openFolder, openFile, viewContent): Execute immediately without confirmation
- **Destructive actions** (deleteFile, moveFile, renameFile): Retain explicit user confirmation
- **Fallback handler**: Failed file opens (unregistered file types) now fall back to OS default app via `open` package
- **Path safety**: All paths are canonicalized with `path.resolve()` before any operation to prevent symlink traversal

**Primary recommendation:** Implement a `requiresConfirmation` Set in the confirmation toast logic; refactor openFileHandler to attempt shell.openPath first, then fallback to the `open` package; ensure path.resolve() is applied at the dispatcher level (already done) and before openPath calls.

## Standard Stack

### Core Libraries
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.1.1 | Desktop application runtime | Provides shell.openPath() for cross-platform file opening (Windows Explorer/Finder/Files) |
| open | 11.0.0 | Fallback file opener for unregistered handlers | Cross-platform (Windows/macOS/Linux); handles .zip, executables, and files with no registered app; pure Node.js, no native dependencies |
| path (Node.js stdlib) | — | Path utilities, canonicalization | Provides path.resolve() for cross-platform symlink-safe path normalization |
| fs (Node.js stdlib) | — | File system operations | readFile already used for viewContent; stat for size checks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| electron.shell | 41.1.1 | Cross-platform file/URL opening | Primary attempt for file opens; OpenPath is the Electron-blessed API for this |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron.shell.openPath + open package | platform-specific spawning (start/xdg-open/open) | Requires conditional imports, loses Electron sandbox safety; open package is already maintained and handles platform detection |
| Manual child_process.execFile calls | Just rely on shell.openPath | shell.openPath fails silently on unregistered handlers (returns error string); no fallback → user gets nothing |

**Installation** (already installed in Phase 57):
```bash
npm install open@11.0.0
```

**Version verification:**
- open@11.0.0 — published February 2024, actively maintained, pure ESM
- Supports Node.js 18.18.0+; JARVIS targets 3.10+

## Architecture Patterns

### Recommended Confirmation Logic
```typescript
// Phase 58 refinement: only these actions require confirmation
const requiresConfirmation: Set<FileAction> = new Set([
  'deleteFile',
  'moveFile',
  'renameFile'
]);

// In ActionConfirmationToast: only show if requiresConfirmation.has(action)
// Otherwise, dispatch action immediately without toast
```

### File Open Handler with Fallback
```typescript
// apps/desktop/src/main/actions/file-actions.ts
import { open } from 'open';

export async function openFileHandler(filePath: string): Promise<ActionExecuteResult> {
  // 1. Canonicalize (already done in dispatcher via path.resolve)
  // 2. Attempt Electron shell.openPath first (preferred, sandbox-safe)
  const errMsg = await shell.openPath(filePath);
  if (!errMsg) {
    return { success: true };
  }
  
  // 3. If shell.openPath fails, fallback to 'open' package
  // (handles unregistered file types like .zip)
  try {
    await open(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to open file: ${describeError(err)}` };
  }
}
```

### Path Canonicalization (Already Implemented)
Location: `apps/desktop/src/main/actions/file-action-dispatcher.ts`

Current implementation uses `nodePath.resolve()` implicitly via `nodePath.join()`. **Phase 58 refinement**: Explicitly call `path.resolve()` at the handler level as well, for defense-in-depth:

```typescript
// In openFileHandler / openFolderHandler, before any operation:
const safePath = path.resolve(filePath);
// Then pass safePath to shell.openPath or open()
```

### Anti-Patterns to Avoid
- **Hardcoding platform-specific CLI names**: Don't call `start`, `xdg-open`, `open` directly — use the `open` package for cross-platform abstraction
- **Showing confirmation toast for read-only actions**: Confirmation should only block on destructive operations; read-only actions should be instant
- **Trusting shell.openPath return value as "file opened"**: Return value '' means success, but it's async — file may fail to open after we return. Current error-string pattern is correct, but fallback handling is essential for robustness

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform file opener for unknown file types | Custom platform detection + spawning start/xdg-open/open | `open` package (npm install open) | Handles Linux/macOS/Windows transparently; detects environment (WSL, Wayland); maintained package avoids bitrot |
| Symlink traversal protection | Manual string manipulation or regex | `path.resolve()` from Node.js stdlib | path.resolve normalizes `.`, `..`, symlinks; cross-platform safe (handles Windows `\` vs Unix `/`) |
| File type determination | Regex on file extension | File extension validation in zod schema (already done in request-file-action.ts) | Validation happens at tool input level; handlers trust the path is safe |

**Key insight:** Electron shell.openPath does NOT throw errors on unregistered file types — it returns an error string instead. Without fallback, users see "nothing happened" for `.zip` files. The `open` package was designed exactly for this scenario.

## Common Pitfalls

### Pitfall 1: shell.openPath Failure ≠ User Error
**What goes wrong:** User tries to open a `.zip` file. shell.openPath returns error string "No application found for this file type". Message is shown to user, but nothing opens.  
**Why it happens:** shell.openPath relies on OS file associations. `.zip` files may not have a registered default handler on Linux, or user's handler may be misconfigured.  
**How to avoid:** Always implement a fallback to the `open` package, which has its own heuristics for finding handlers.  
**Warning signs:** Test with file types that are uncommon on the target OS (`.zip` on Linux servers, executables on macOS with SIP, etc).

### Pitfall 2: Read-Only Action Toast Confirmation UX
**What goes wrong:** User asks "show me the Downloads folder". JARVIS shows a 10-second confirmation toast. User perception: slow and annoying.  
**Why it happens:** Current Phase 55 implementation treats all actions uniformly — ALL require confirmation.  
**How to avoid:** Separate actions into `requiresConfirmation` Set. Read-only actions (openFolder, openFile, viewContent) skip the confirmation toast entirely and execute immediately.  
**Warning signs:** User says "why is JARVIS asking permission for a read operation?"; test user takes >2 seconds to click "Permitir" for simple opens.

### Pitfall 3: Symlink Traversal via Path Manipulation
**What goes wrong:** LLM crafts path "../../../etc/passwd" intending to read outside home. If paths are not canonicalized, this succeeds.  
**Why it happens:** Without `path.resolve()`, relative paths can escape the intended boundary.  
**How to avoid:** Call `path.resolve()` on all paths before any open/read operation. Current dispatcher does this; Phase 58 adds explicit `path.resolve()` call in handlers for defense-in-depth.  
**Warning signs:** Verify with test: `path.resolve(os.homedir(), "../../../etc/passwd")` → should resolve to a path OUTSIDE home, caught by validation layer (not executor's job, but good to be aware).

### Pitfall 4: Confirmation Toast Never Clears on Delete/Move Action Timeout
**What goes wrong:** User asks "delete file X". Toast shows for 10s, user doesn't respond. Toast times out, action is aborted, but UI still shows "pending" state.  
**Why it happens:** onTimeout in ActionConfirmationToast needs to properly clear pendingAction in the hook.  
**How to avoid:** Ensure `sendAck('timeout')` is called on timer expiry, clearing pendingAction (already implemented in Phase 54 tests).  
**Warning signs:** Start a delete, wait 10+ seconds without clicking, then ask to delete another file → second action doesn't show toast (toast is still mounted).

## Code Examples

### Confirmation Logic in ActionConfirmationToast
```typescript
// apps/desktop/src/renderer/src/App.tsx (ActionConfirmationToast component)
// Phase 58 refinement: only show toast for destructive actions

const requiresConfirmation: Set<FileAction> = new Set([
  'deleteFile',
  'moveFile',
  'renameFile'
]);

// In ActionConfirmationToast props handler:
if (!requiresConfirmation.has(action)) {
  // Read-only: execute immediately, no toast
  await window.jarvis.actions.execute({
    requestId,
    action,
    path
  });
  return;
}

// Destructive: show toast and wait for user response
// (existing logic)
```

### openFileHandler with Fallback
```typescript
// Source: apps/desktop/src/main/actions/file-actions.ts
import { open } from 'open';

export async function openFileHandler(filePath: string): Promise<ActionExecuteResult> {
  try {
    // 1. Try shell.openPath first (Electron's preferred, sandbox-safe method)
    const errMsg = await shell.openPath(filePath);
    if (!errMsg) {
      return { success: true };
    }
    
    // 2. shell.openPath failed; fallback to 'open' package
    // (handles .zip, unregistered file types, WSL, etc)
    try {
      await open(filePath);
      return { success: true };
    } catch (fallbackErr) {
      // Both methods failed; return meaningful error
      return {
        success: false,
        error: `Unable to open file: shell.openPath returned "${errMsg}"; fallback open() also failed: ${describeError(fallbackErr)}`
      };
    }
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}
```

### Path Canonicalization in Handler
```typescript
// Source: apps/desktop/src/main/actions/file-actions.ts
import path from 'node:path';

export async function openFolderHandler(folderPath: string): Promise<ActionExecuteResult> {
  try {
    // Defense-in-depth: explicit resolve in handler (dispatcher also calls it)
    const safePath = path.resolve(folderPath);
    
    const errMsg = await shell.openPath(safePath);
    if (errMsg) {
      return { success: false, error: `shell.openPath failed: ${errMsg}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}
```

## Runtime State Inventory

Not applicable — Phase 58 is pure feature refinement (confirmation logic, fallback handler). No stored data, service config, or OS registration changes required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 + React Testing Library |
| Config file | `apps/desktop/vitest.config.ts` |
| Quick run command | `npm test -- --run file-actions.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FACT-10 | openFolder executes without confirmation toast | unit + integration | `npm test -- --run confirmation-toast.test.tsx -t "read-only"` | ✅ (need Wave 0 update) |
| FACT-10 | openFile executes without confirmation toast | unit + integration | `npm test -- --run confirmation-toast.test.tsx -t "read-only"` | ✅ (need Wave 0 update) |
| FACT-10 | viewContent executes without confirmation toast | unit + integration | `npm test -- --run confirmation-toast.test.tsx -t "read-only"` | ✅ (need Wave 0 update) |
| FACT-11 | deleteFile requires confirmation (when implemented) | unit + integration | `npm test -- --run confirmation-toast.test.tsx -t "destructive"` | ❌ Wave 0 — deleteFile action not yet in FileAction enum |
| FACT-11 | moveFile requires confirmation (when implemented) | unit + integration | `npm test -- --run confirmation-toast.test.tsx -t "destructive"` | ❌ Wave 0 — moveFile action not yet in FileAction enum |
| FACT-11 | renameFile requires confirmation (when implemented) | unit + integration | `npm test -- --run confirmation-toast.test.tsx -t "destructive"` | ❌ Wave 0 — renameFile action not yet in FileAction enum |
| FACT-12 | openFile with .zip falls back to `open` package | unit | `npm test -- --run file-actions.test.ts -t "openFile.*fallback"` | ❌ Wave 0 — need fallback test |
| FACT-12 | openFile tries shell.openPath first | unit | `npm test -- --run file-actions.test.ts -t "openFile.*shell"` | ✅ (existing test) |
| FACT-12 | openFile error shows on both failures | unit | `npm test -- --run file-actions.test.ts -t "openFile.*error"` | ✅ (existing test) |

### Sampling Rate
- **Per task commit:** `npm test -- --run file-actions.test.ts` (openFile/openFolder/viewContent tests)
- **Per wave merge:** `npm test -- --run confirmation-toast.test.tsx` (check requiresConfirmation logic doesn't break existing toast)
- **Phase gate:** Full suite green (`npm test -- --run`) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/desktop/src/main/actions/__tests__/file-actions.test.ts` — add test for openFileHandler fallback to `open` package (REQ FACT-12)
- [ ] `apps/desktop/src/renderer/src/__tests__/confirmation-toast.test.tsx` — add test for requiresConfirmation Set filtering (REQ FACT-10)
- [ ] `apps/desktop/src/shared/ipc-types.ts` — extend FileAction enum to include 'deleteFile', 'moveFile', 'renameFile' (REQ FACT-11 prerequisite)
- [ ] `apps/desktop/src/main/actions/file-actions.ts` — implement deleteFileHandler, moveFileHandler, renameFileHandler (REQ FACT-11 prerequisite)
- [ ] Mocks in test files: vi.mock('open', ...) in file-actions.test.ts to control fallback behavior

*(No other gaps — existing test infrastructure covers confirmation toast timeout logic and path resolution.)*

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `path` module | Path canonicalization | ✓ | stdlib (v22.11.0) | — |
| Electron shell.openPath | Primary file open handler | ✓ | 41.1.1 | Use `open` package if shell.openPath returns error |
| `open` package (npm) | Fallback file open handler | ✓ | 11.0.0 | — (if open fails, return error to user) |

**Missing dependencies with no fallback:** None — all required dependencies already installed.

**Notes:**
- open@11.0.0 installed in Phase 57 (v2.3 architecture notes, new packages section)
- Verified in apps/backend-ts/package.json (not needed there) and should be in apps/desktop/package.json (needs verification in Wave 0)

## Sources

### Primary (HIGH confidence)
- **Electron shell.openPath API** — Official Electron docs; sandbox-safe cross-platform file opener; returns error string (not exception) on failure
- **open package (npm)** — [GitHub: sindresorhus/open](https://github.com/sindresorhus/open); v11.0.0 published February 2024; 4.5M weekly downloads; handles .zip, unregistered handlers, WSL detection
- **Node.js path.resolve()** — Official Node.js stdlib; cross-platform path normalization; symlink-safe via OS-level resolution

### Secondary (MEDIUM confidence)
- **Phase 55 LLM Actions implementation** — Existing codebase; file-actions.ts and file-action-dispatcher.ts already implement path resolution and shell.openPath pattern
- **Phase 54 Confirmation Toast** — Existing test suite (confirmation-toast.test.tsx) proves toast lifecycle, timeout handling, pendingAction state management

### Tertiary (implementation patterns from codebase)
- StateAD.md: requiresConfirmation Set pattern used in Phase 55 for action whitelist validation

## Metadata

**Confidence breakdown:**
- **Standard Stack: HIGH** — Electron and open package are well-established, versions verified; Node.js stdlib is stable
- **Architecture: HIGH** — File action pattern fully established in Phase 55; Phase 58 is refinement (confirmation filtering + fallback), not new architecture
- **Pitfalls: HIGH** — Confirmation UX pitfall based on Phase 55 experience; symlink traversal risk documented in existing code; shell.openPath failure mode known from Electron docs
- **Code Examples: HIGH** — Existing Phase 55 code provides reference; fallback pattern is standard JS try-catch with open package

**Research date:** 2026-05-06  
**Valid until:** 2026-05-13 (7 days — file I/O is stable, but open package upstream may release patches)

---

## Phase Requirements Summary

| ID | Status | Coverage |
|----|--------|----------|
| **FACT-10** | Pending | Read-only actions (openFolder, openFile, viewContent) skip confirmation; execute immediately |
| **FACT-11** | Pending | Destructive actions (deleteFile, moveFile, renameFile) require explicit confirmation via toast |
| **FACT-12** | Pending | Failed file opens fall back to `open` package; path.resolve() prevents symlink traversal |

All three requirements are data-gated by the FileAction enum extension (deleteFile, moveFile, renameFile not yet in ipc-types.ts).
