---
status: partial
phase: 10-frameless-widget-window
source: [10-VERIFICATION.md]
started: 2026-04-06T15:46:00Z
updated: 2026-04-06T15:46:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Visual Window Appearance
expected: Widget appears at bottom-right corner (16px offset from edges) with no white flash during load. Window is frameless (no title bar, no borders) and has transparent background (slate-900 visible).
result: [pending]

### 2. Always-On-Top Behavior
expected: Widget remains visible over all other windows including maximized windows. Does not require clicking to bring to front.
result: [pending]

### 3. Tray Icon Visibility
expected: Cyan circle icon appears in system tray with tooltip "JARVIS". Single-click shows menu with exactly 3 items: Show, Hide, Quit. All menu items execute their actions correctly.
result: [pending]

### 4. Position Persistence
expected: After dragging window to a new position, quitting the app, and relaunching, window appears at the dragged position (not default bottom-right). Position is saved in electron-store config.json.
result: [pending]

### 5. Taskbar/Alt+Tab Exclusion
expected: Widget does not appear in Windows taskbar or Alt+Tab switcher during normal operation.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
