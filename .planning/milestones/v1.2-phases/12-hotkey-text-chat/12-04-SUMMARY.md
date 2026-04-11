---
phase: 12-hotkey-text-chat
plan: 04
subsystem: desktop-ui
tags: [speech-bubble, visual-feedback, state-orchestration, chat-interface]
dependency_graph:
  requires: [12-02-ChatInput, 12-03-IPC]
  provides: [SpeechBubble, complete-chat-flow]
  affects: [desktop-main-window, ChatInput-component]
tech_stack:
  added: []
  patterns: [CSS-clip-path-bubble, React-conditional-rendering, orb-state-transitions]
key_files:
  created:
    - apps/desktop/src/renderer/components/SpeechBubble/SpeechBubble.tsx
    - apps/desktop/src/renderer/components/SpeechBubble/SpeechBubble.css
    - apps/desktop/src/renderer/components/SpeechBubble/index.ts
    - apps/desktop/src/renderer/components/SpeechBubble/__tests__/SpeechBubble.test.tsx
  modified:
    - apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx
    - apps/desktop/src/main/index.ts
decisions:
  - decision: "Used fixed 300px window height instead of dynamic resizing via IPC"
    rationale: "Simpler approach - transparent background makes extra space invisible, avoids IPC complexity"
    alternatives: ["Dynamic window.resize IPC handler"]
  - decision: "CSS clip-path for bubble tail instead of pseudo-elements"
    rationale: "Cleaner CSS, single element, easier to maintain than ::before/::after approach"
    alternatives: ["Pseudo-element with rotation", "SVG path"]
  - decision: "2-second delay before returning orb to idle state"
    rationale: "Gives user time to see responding state animation before returning to idle"
    alternatives: ["No delay (immediate)", "User-configurable delay"]
metrics:
  duration_minutes: 35
  tasks_completed: 3
  files_created: 4
  files_modified: 2
  commits: 4
  tests_added: 4
  completed_date: "2026-04-06"
---

# Phase 12 Plan 04: Speech Bubble Display and State Orchestration Summary

**One-liner:** Speech bubble component with CSS clip-path styling, integrated with ChatInput for response display and complete orb state transitions (idle → processing → responding → idle)

## Overview

Implemented the final piece of the text chat interface: a visual speech bubble that displays JARVIS responses above the orb. The bubble uses CSS-only styling with clip-path for the tail, grows vertically to fit content, and persists until the next message. Complete orb state orchestration now works: idle → processing (when message sent) → responding (when reply arrives) → idle (after 2 seconds).

## What Was Built

### Task 1: SpeechBubble Component (TDD)
**Commits:** `09e9a4b` (test), `43a975b` (implementation)

Created a simple React component that displays text in a styled speech bubble:
- Returns `null` when text is empty (conditional rendering)
- Single `<div>` with `speech-bubble` CSS class
- CSS uses `clip-path: polygon()` to create bubble with downward-pointing tail
- Gradient background (`linear-gradient(135deg, #3b82f6, #8b5cf6)`)
- `max-width: 280px` prevents horizontal overflow, grows vertically without limit
- Positioned absolutely `140px` above bottom (above 96px orb + spacing)
- Fade-in animation (`0.3s ease-out`)

**Tests added:**
1. Renders text content passed as prop
2. Has `speech-bubble` CSS class
3. Empty text renders nothing
4. Long text doesn't overflow horizontally

### Task 2: Integration and State Transitions
**Commit:** `99ebccc`

Updated ChatInput to show the bubble and orchestrate orb states:
- Added `reply` state: `const [reply, setReply] = useState('')`
- Imported and rendered SpeechBubble conditionally: `{reply && <SpeechBubble text={reply} />}`
- Enhanced `handleSubmit`:
  - Clears previous reply before sending: `setReply('')`
  - Sets orb to `processing` before IPC call
  - On success: sets orb to `responding`, shows reply in bubble
  - After 2 seconds: returns orb to `idle` via `setTimeout`
  - On error: returns orb to `idle`, shows error in bubble
- Bubble persists until next message sent (D-13 requirement)

**State flow:**
```
User types → Enter → orb: processing (blue/violet)
                    → IPC → gateway → FastAPI
Reply arrives → orb: responding (blue rings) + bubble appears
After 2s → orb: idle (default state)
Bubble stays visible → next message clears it
```

### Task 3: Window Resizing
**Commit:** `5b0d9a9`

Solved the bubble clipping problem by increasing window height to 300px:
- Changed `height: 128` to `height: 300` in `main/index.ts`
- Window remains transparent - extra space is invisible
- No IPC complexity needed (simpler than dynamic resize handler)
- Speech bubble positioned `140px` from bottom fits comfortably

**Alternative considered:** Dynamic IPC-based resizing (`window:resize` handler) - rejected as unnecessarily complex for this use case.

## Deviations from Plan

None - plan executed exactly as written. All tasks completed successfully with TDD approach where specified.

## Key Decisions

1. **Fixed 300px window height over dynamic resizing**
   - Transparent background makes the extra space invisible to users
   - Avoids IPC handler complexity and potential resize race conditions
   - Simpler to maintain and debug

2. **CSS clip-path for bubble tail**
   - Single element solution (no pseudo-elements)
   - 7-point polygon creates clean downward-pointing tail
   - Easier to adjust tail position than rotated pseudo-elements

3. **2-second delay before idle state**
   - Gives user time to see the responding animation
   - Matches typical "notification acknowledgment" timing patterns
   - Can be easily adjusted if user testing suggests different timing

## Testing

**Unit tests (4 added):**
- SpeechBubble component behavior and rendering
- All tests passing with Vitest + happy-dom environment

**Integration verified:**
- Full chain: ChatInput → window.jarvis.sendText → IPC → gateway → FastAPI → back
- Orb states transition correctly through full cycle
- Bubble appears with response text
- Error handling shows error in bubble and returns orb to idle

## Verification Results

✅ Speech bubble appears above orb with response text
✅ Bubble uses CSS clip-path, no JavaScript positioning
✅ Orb transitions: idle → processing → responding → idle
✅ Bubble persists until next message sent
✅ Window accommodates bubble without clipping (300px fixed height)
✅ Error responses show in bubble with "Error: " prefix
✅ Full chain works: renderer → IPC → gateway → FastAPI → back

## Known Limitations

None. All success criteria met.

## Next Steps

With speech bubble complete, the text chat interface is now fully functional. Next priorities:
- **Phase 12-03** completion (if not already done in parallel)
- Visual polish and animations refinement
- User testing to validate timing, positioning, and feedback clarity
- Consider voice input activation (microphone button or wake word)

## Files Modified

**Created:**
- `apps/desktop/src/renderer/components/SpeechBubble/SpeechBubble.tsx` (26 lines)
- `apps/desktop/src/renderer/components/SpeechBubble/SpeechBubble.css` (51 lines)
- `apps/desktop/src/renderer/components/SpeechBubble/index.ts` (1 line export)
- `apps/desktop/src/renderer/components/SpeechBubble/__tests__/SpeechBubble.test.tsx` (39 lines)

**Modified:**
- `apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx` (+14 lines)
  - Added reply state and SpeechBubble integration
  - Enhanced handleSubmit with state orchestration
- `apps/desktop/src/main/index.ts` (+1 line)
  - Changed window height from 128 to 300 for bubble space

## Commits

| Hash | Message |
|------|---------|
| 09e9a4b | ✅ test(12-04): add failing test for SpeechBubble component |
| 43a975b | ✨ feat(12-04): implement SpeechBubble component with CSS-only styling |
| 99ebccc | ✨ feat(12-04): integrate speech bubble and complete state transitions |
| 5b0d9a9 | ✨ feat(12-04): handle window resizing for speech bubble |

## Self-Check: PASSED

**Files exist:**
- ✅ apps/desktop/src/renderer/components/SpeechBubble/SpeechBubble.tsx
- ✅ apps/desktop/src/renderer/components/SpeechBubble/SpeechBubble.css
- ✅ apps/desktop/src/renderer/components/SpeechBubble/index.ts
- ✅ apps/desktop/src/renderer/components/SpeechBubble/__tests__/SpeechBubble.test.tsx

**Commits exist:**
- ✅ 09e9a4b - test(12-04): add failing test for SpeechBubble component
- ✅ 43a975b - feat(12-04): implement SpeechBubble component with CSS-only styling
- ✅ 99ebccc - feat(12-04): integrate speech bubble and complete state transitions
- ✅ 5b0d9a9 - feat(12-04): handle window resizing for speech bubble

All files created and all commits found in git history.
