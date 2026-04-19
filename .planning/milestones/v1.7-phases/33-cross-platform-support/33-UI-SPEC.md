---
status: draft
phase: 33
phase_name: Cross-Platform Support
milestone: v1.7
design_system: Tailwind CSS (custom)
shadcn_initialized: false
tool: none
last_updated: "2026-04-15T00:00:00.000Z"
---

# Phase 33: Cross-Platform Support — UI Design Contract

## Summary

Phase 33 adds macOS and Linux support to the existing Electron app. **No new UI components or visual changes are required.** The visual design is already complete and shipped in v1.6 (Windows). This phase ensures the **same orb UI and interaction patterns** work identically on macOS and Linux without regression on Windows.

---

## Design System State

### Framework & Approach
- **Tool:** None — custom Tailwind CSS (no component library)
- **Status:** Existing design tokens and animations are complete and stable
- **Variants:** Only platform-specific CSS needed (e.g., `webkit-app-region`, compositor assumptions)

### Existing Token Definitions (from v1.6)

#### Color Palette
**Orb State Colors** (60/30/10 split: idle dominant, listening/processing/responding secondary, burst/accent tertiary)
- `orb-idle`: #06B6D4 (cyan-500) — dominant surface color, 60% of idle time
- `orb-listen`: #F59E0B (amber-500) — secondary (listening state), 30% of voice interactions
- `orb-process`: #8B5CF6 (violet-500) — tertiary (processing state), 10% accent reserved for agent thinking
- `orb-respond`: #3B82F6 (blue-500) — tertiary (responding state), 10% accent reserved for AI speaking
- `orb-followup`: #0EA5E9 (sky-400) — Phase 28 addition, 10% accent for multi-turn follow-up

**Semantic Colors**
- `glass-bg`: rgba(255, 255, 255, 0.08) — glassmorphism background
- `glass-border`: rgba(255, 255, 255, 0.12) — glassmorphism border overlay

**Glow/Shadow Colors** (per state, for drop-shadow effect)
- Idle: rgba(43, 168, 212, 0.55) — cyan teal
- Listening: rgba(245, 158, 11, 0.55) — amber
- Processing: rgba(139, 92, 246, 0.55) — violet
- Responding: rgba(59, 130, 246, 0.55) — blue
- Awaiting follow-up: rgba(14, 165, 233, 0.55) — sky-400

#### Typography
**Font Family**
- Font: Inter + system fallback (-apple-system, BlinkMacSystemFont, Segoe UI)
- Weight: 400 (regular) — no bold text required in this phase

**Font Sizes**
- Body: 14px (for occasional UI text like tooltips, but not used in Phase 33)
- Label: 12px (for tooltip-like labels, minimal use)
- Heading: 16px (if needed for future Settings UI; not used in Phase 33)

**Line Heights**
- No multi-line text in Phase 33; inherited from browser default or Tailwind

#### Spacing
- 8-point scale: 4, 8, 16, 24, 32, 48, 64px
- `orb` custom: 96px (12 × 8px grid unit for orb window dimensions)
- Window size: 160×160px (v1.4 Phase 10 decision)

#### Shadows & Effects
**Glassmorphism**
- Backdrop blur: 12px (`backdrop-blur-glass`)
- Border radius: 16px (`rounded-glass`)
- Box shadow: `0 4px 24px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.1)`

**Orb Shadows** (glow halos per state)
- `shadow-orb-idle`: 0 0 24px rgba(6, 182, 212, 0.6), 0 0 48px rgba(6, 182, 212, 0.4)
- `shadow-orb-listen`: 0 0 24px rgba(245, 158, 11, 0.6), 0 0 48px rgba(245, 158, 11, 0.4)
- `shadow-orb-process`: 0 0 24px rgba(139, 92, 246, 0.6), 0 0 48px rgba(139, 92, 246, 0.4)
- `shadow-orb-respond`: 0 0 24px rgba(59, 130, 246, 0.6), 0 0 48px rgba(59, 130, 246, 0.4)
- `shadow-orb-followup`: 0 0 24px rgba(14, 165, 233, 0.6), 0 0 48px rgba(14, 165, 233, 0.4)

#### Animations
**State Animations**
- `pulse-idle`: 2s ease-in-out, scale 1→1.05→1, opacity full
- `pulse-listen`: 1s ease-in-out, scale 1→1.08→1, more eager than idle
- `spin-process`: 2s linear, rotate 0→360°, scale 1→1.05→1
- `pulse-followup`: 1.5s ease-in-out, scale 1→1.06→1 (Phase 28 multi-turn)
- `idle-breath`: 6s ease-in-out infinite, hue-rotate ±10°, brightness 0.97–1.04 (Phase 25)

**Event Animations**
- `wake-burst`: 350ms ease-out, scale 1.0→1.1→1.0 (wake word detected)
- `wake-burst-ring`: 350ms ease-out, amber ring opacity 0→1→0

**Reduced Motion**
- `@media (prefers-reduced-motion: reduce)` applies simplified/frozen keyframes to all animations

---

## Visual Contracts: Phase 33 Changes

### Windows (Regression Protection)

**No visual changes.** All existing styling and animations must work identically to v1.6.

- Orb appearance: 128×128px cyan glass sphere (idle state)
- Window: 160×160px, frameless, transparent, positioned bottom-right
- Tray icon: PNG colorful (Windows style, not template)
- Drop shadow: Present on orb via `filter: drop-shadow()`
- Animations: All state transitions (idle→listening→processing→responding→awaiting-followup) intact

### macOS

**Same visual design as Windows; platform-specific behaviors:**

1. **Frameless Window** — `titleBarStyle: 'hiddenInset'` or `frame: false`
   - No bounding rect change
   - Transparent background must render identically
   - Drop shadow (`filter: drop-shadow()`) must display without clipping

2. **Orb Appearance** — Identical to Windows
   - 128×128px glass sphere
   - Gradients and glow effects must match Windows pixel-for-pixel
   - Idle breathing animation (Phase 25) applies on all platforms

3. **Tray Icon** — PNG colorful (no template variant for v1.7)
   - Menu bar placement above screen clock
   - Size: standard macOS menu bar size (18×18px icon with padding)
   - Menu items: Settings, Quit (exact copy/content TBD in Phase 34)

4. **Interaction Aspects** (not new CSS, but platform behavior)
   - Global hotkey (`Cmd+Space` for PTT) works via Electron `globalShortcut`
   - Wake word audio capture works via `getUserMedia` with microphone permission prompt
   - No visual regression on Dock (hidden via `app.dock.hide()`)

### Linux (X11)

**Same visual design as Windows; platform-specific behaviors:**

1. **Frameless Window** — `frame: false` + `transparent: true`
   - Requires X11 compositor (Compton, Picom, Kwin, etc.) for transparency
   - Without compositor, background is black (limitation, not a bug)
   - No CSS workaround; document in README

2. **Orb Appearance** — Identical to Windows and macOS
   - 128×128px glass sphere with all gradients and animations
   - Drop shadow may render differently without modern GPU acceleration (acceptable)

3. **Tray Icon** — PNG colorful
   - System tray placement (taskbar bottom, typically)
   - Uses `libappindicator` or `libayatana-appindicator` (Electron handles auto-selection in 28+)
   - Menu items: Settings, Quit (exact copy/content TBD in Phase 34)

4. **Interaction Aspects** (not new CSS, but platform behavior)
   - Global hotkey (`Ctrl+Space` for PTT) works via Electron `globalShortcut`
   - Wake word audio capture works via `getUserMedia` (no permission prompt on Linux, usually)
   - X11-only in v1.7; Wayland deferred to v2 (PLAT-08)

---

## Copywriting

### No New Copy Required

Phase 33 does not introduce new UI elements that need text labels. Tray menu items (Settings, Quit) are standard platform conventions and do not require design decisions.

**Defer to Phase 34:** Settings UI will define copy for:
- Settings window title
- Form labels (hotkey, TTS provider, Whisper model)
- Buttons (Save, Cancel, Reset)
- Validation messages

---

## Component Inventory

### Orb Component (Reused — No Changes)

**File:** `apps/desktop/src/renderer/components/Orb/Orb.tsx`

**States Rendered:**
- `idle` — cyan glass, breathing animation
- `listening` — amber glass, eager pulse
- `processing` — violet glass, spinning rotation
- `responding` — blue glass, static (optional ripple)
- `awaiting-followup` — sky glass, gentle pulse

**Dimensions:** 128×128px CSS grid size

**CSS Classes Used:**
- `animate-pulse-idle`, `animate-pulse-listen`, `animate-spin-process`, `animate-pulse-followup`
- `shadow-orb-idle`, `shadow-orb-listen`, `shadow-orb-process`, `shadow-orb-respond`, `shadow-orb-followup`
- `filter: drop-shadow(...)` for outer glow
- `@media (prefers-reduced-motion: reduce)` for accessibility

**No Component Changes Required** — Orb.tsx works cross-platform with no code modifications.

### Tray Icon Asset (Reused — No Changes)

**File:** `apps/desktop/src/main/assets/tray.png` (or similar)

**Dimensions:** 16×16px or 32×32px (Electron auto-scales)

**Format:** PNG with transparency (colorful, not template)

**No Asset Changes Required** — Existing tray icon works on all platforms; no redesign for v1.7.

---

## Interaction Contracts

### No New Interactions in Phase 33

All interaction patterns (PTT hotkey, wake word voice input, tray menu click) are already defined and tested in v1.6. Phase 33 ensures they work cross-platform without new interaction design.

**Deferred to Phase 34:** Settings UI will add new interactions (form input, save/cancel buttons).

---

## Platform-Specific CSS Notes

### Windows (No CSS Changes)
- `webkit-app-region: drag` on parent div — already correct
- Drop shadow filter — already correct
- No platform-specific CSS media queries required

### macOS

**Added CSS (if any):**
- None required — all styling is platform-agnostic
- `webkit-app-region: drag` works identically on macOS

**Electron Config (not CSS):**
- `titleBarStyle: 'hiddenInset'` or `frame: false` handles window chrome
- Not a CSS concern

### Linux (X11)

**Added CSS (if any):**
- None required — all styling is platform-agnostic
- `webkit-app-region: drag` works identically on Linux X11

**Electron Config (not CSS):**
- `transparent: true` requires X11 compositor
- Not a CSS concern; document limitation in README

---

## Accessibility

### Existing Accessibility (No Changes)

**Reduced Motion Support**
- All Orb animations respect `@media (prefers-reduced-motion: reduce)`
- Keyframes freeze to static states when user preference is enabled
- No new accessibility work required in Phase 33

**Cross-Platform Accessibility**
- macOS: Accessibility permission prompt (Electron handles)
- Linux: No special permission needed (getUserMedia works without prompt)
- Windows: No special permission needed (already shipping)

---

## Registry & Third-Party Components

**Status:** Not applicable — no third-party component library (no shadcn, no Material UI, no component library).

---

## Known Limitations & Non-Requirements

### Phase 33 Scope (NOT included)

1. **Linux Wayland Support** — Deferred to v2 (PLAT-08)
   - Only X11 with compositor support is targeted

2. **macOS PTT Global Hotkey** — Deferred (PLAT-07)
   - Requires Accessibility permission (already needed for wake word)
   - Will be addressed in Phase 34 or later

3. **Tray Icon Template Variant** — Not requested
   - PNG colorful used on all platforms
   - macOS template (white/black) can be added in v1.8 if needed

4. **Settings UI** — Phase 34 scope
   - No new UI components in Phase 33

---

## Implementation Checklist

For executor reference:

- [ ] Verify `apps/desktop/src/renderer/components/Orb/Orb.tsx` renders identically on Windows, macOS, Linux
- [ ] Verify `apps/desktop/src/main/index.ts` window config (`frame: false`, `transparent: true`) works on macOS and Linux
- [ ] Verify `@fugood/node-whisper-{darwin-arm64,darwin-x64,linux-x64}` prebuilds are included in `electron-builder.yml` extraResources
- [ ] Verify tray icon menu renders correctly on macOS menu bar and Linux system tray
- [ ] Verify globalShortcut registration (Cmd+Space on macOS, Ctrl+Space on Linux) does not raise errors
- [ ] Verify wake word audio capture (getUserMedia) works without errors on all platforms
- [ ] Verify drop shadow and glow effects render without clipping on all platforms
- [ ] Verify app launches and stays in tray on all platforms (no Windows regression)

---

## File Locations (Reference)

**Visual Assets:**
- Tray icon: `apps/desktop/src/main/assets/` (exact path TBD by executor)

**Styling:**
- Tailwind config: `apps/desktop/tailwind.config.ts` (no changes needed)
- Orb component: `apps/desktop/src/renderer/components/Orb/Orb.tsx` (no CSS changes)
- App layout: `apps/desktop/src/renderer/src/App.tsx` (no CSS changes)

**Electron Main Process:**
- Window/tray config: `apps/desktop/src/main/index.ts`, `apps/desktop/src/main/tray.ts`, `apps/desktop/src/main/position.ts`
- Build config: `apps/desktop/electron-builder.yml`

**Documentation:**
- Phase context: `.planning/phases/33-cross-platform-support/33-CONTEXT.md`
- Requirements: `.planning/REQUIREMENTS.md` (PLAT-01..06)

---

## Summary Table

| Category | v1.6 (Windows) | Phase 33 (macOS) | Phase 33 (Linux X11) | Changes |
|----------|---|---|---|---|
| **Orb Size** | 128×128px | 128×128px | 128×128px | None |
| **Window Frame** | Frameless | Frameless | Frameless | None (config only) |
| **Colors** | Cyan/amber/violet/blue | Same | Same | None |
| **Animations** | 5 states + breathing | Same | Same | None |
| **Tray Icon** | PNG colorful | PNG colorful | PNG colorful | None |
| **Typography** | Inter 14/12/16px | Same | Same | None |
| **Drop Shadow** | Yes (filter) | Yes | Yes | None |
| **Accessibility** | prefers-reduced-motion | Same | Same | None |

---

## Notes for Review

1. **No Design Changes:** This phase is 100% about platform compatibility, not visual or interaction design.
2. **Tailwind Already Complete:** All tokens (colors, spacing, typography, animations) are defined and shipped in v1.6; no new Tailwind tokens needed.
3. **CSS-Only Styling:** No component library (shadcn) — pure Tailwind CSS with custom animations.
4. **Platform Variance Expected:** Minor rendering differences due to OS compositors (e.g., shadow quality on Linux without GPU) are acceptable.
5. **Defer to Phase 34:** New copywriting, form input styling, and Settings UI are in scope for Phase 34, not Phase 33.

---

**Status:** Ready for verification
**Date:** 2026-04-15
**Pre-populated from:** CONTEXT.md (Decisions D-01..08), REQUIREMENTS.md (PLAT-01..06), v1.6 Tailwind config
**User input required:** None — all design decisions pre-established; phase is about platform compatibility only
