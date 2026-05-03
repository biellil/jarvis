# Phase 47: Settings UI Polish - Research

**Researched:** 2026-05-02
**Domain:** Electron UI / Tailwind CSS layout & spacing
**Confidence:** HIGH

## Summary

The Settings window is a functional Electron BrowserWindow (480x520px) with four settings sections (PTT hotkey, Always-Listening VAD threshold, TTS provider/key/voice, and Whisper model). The UI is built with React + Tailwind CSS (v3.4+) and uses a dark theme with cyan accents matching the design system.

Current layout issues: window width is constrained at 480px (narrow), sections lack clear visual separation beyond `<hr>` dividers, spacing between controls is minimal (3-space gaps), and typography hierarchy could be stronger. The Settings form currently scrolls (`min-h-screen`) when viewport is smaller, and padding is uniform (p-6 outer).

Phase 47 requires a wider window with improved spacing, clearer section separation, and stronger visual hierarchy—while preserving all four sections, their controls, and existing functionality exactly as-is (layout-only change).

**Primary recommendation:** Increase window width to 600–640px, expand section padding to 4–6 units, improve control spacing within sections (4-space min between input groups), use Tailwind's extended color system and border treatments for section cards, and ensure hover/focus states remain functional.

## User Constraints

No CONTEXT.md exists for Phase 47, so there are no locked decisions or deferred ideas to constrain research.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POLISH-01 | Settings window with wider layout, better spacing, and clear visual hierarchy | All findings in "Architecture Patterns" and "Code Examples" sections enable task structure |

## Standard Stack

### Core UI Technologies
| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| React | 18.x (implicit via renderer context) | Component framework | Renderer uses React hooks (useState, useEffect); existing Settings UI is React TSX |
| TypeScript | 5.x | Type safety | Settings form uses `WhisperModelOption`, `TtsProviderOption` types; full TS throughout |
| Tailwind CSS | 3.4.1 (inferred from config) | Utility-first CSS | All existing UI (Orb, ChatInput, SettingsForm) uses Tailwind; tailwind.config.ts extends theme |
| Electron | 31.x (inferred from package context) | Desktop window framework | settingsWindow.ts uses BrowserWindow API; app is Electron-based multiplatform |

### Current Design System
| Token | Value | Usage |
|-------|-------|-------|
| Window width (current) | 480px | settingsWindow.ts line 10 |
| Window height (current) | 520px | settingsWindow.ts line 11 |
| Base padding | p-6 (24px) | SettingsForm.tsx line 140 |
| Section spacing | space-y-6 (24px) | SettingsForm.tsx line 141 |
| Button/Input padding | px-3 py-2 (12px × 8px) | Input elements, line 78 |
| Colors | `bg-black/95`, `text-white`, `border-white/20` | SettingsForm.tsx throughout |
| Accent color | `cyan-500` (#06B6D4) | Tailwind custom in tailwind.config.ts |
| Font family | Inter (from Google Fonts) | Loaded in settings.html line 12 |
| Font sizes | text-xs (12px), text-sm (14px), text-base (16px) | Tailwind config defines `label`, `body`, `heading` |

### Window Configuration
Current settingsWindow.ts settings:
```typescript
const win = new BrowserWindow({
  width: 480,        // CONSTRAINT: narrow
  height: 520,       // Fixed height — no resize
  show: false,       // Hidden on startup
  frame: true,       // Native frame (not frameless)
  resizable: false,  // Fixed size — no user resize
  skipTaskbar: true, // Tray app only
});
```

## Architecture Patterns

### Current Layout Structure
```
SettingsForm (min-h-screen bg-black/95 text-white p-6)
├── Flex container (flex-1 space-y-6)
│   ├── <section> (PTT)
│   │   ├── h2.text-base (heading)
│   │   └── HotkeyRecorder component
│   ├── <hr className="border-white/20" />
│   ├── <section> (Always-Listening)
│   │   ├── h2.text-base
│   │   ├── VAD threshold label + display
│   │   ├── Range slider (slider-vad-threshold class)
│   │   ├── Helper text (text-xs text-white/50)
│   │   └── Reset button
│   ├── <hr className="border-white/20" />
│   ├── <section> (TTS)
│   │   ├── h2.text-base
│   │   └── TtsProviderSelect component
│   ├── <hr className="border-white/20" />
│   ├── <section> (Whisper)
│   │   ├── h2.text-base
│   │   ├── Select dropdown (model option)
│   │   └── Helper text
│   └── (flex-1 end)
├── Button bar (flex justify-end gap-3 mt-6)
│   ├── Cancel button
│   └── Save button
└── Toast notification (fixed bottom-4 right-4)
```

### Recommended Changes for Phase 47

**Window sizing:**
- Increase `width` from 480 → **600** (or 640 for premium spacing)
- Keep `height: 520` (or increase to 560 if content needs more breathing room)
- `resizable: false` stays (locked window sizing, no user drag)
- `frame: true` stays (native frame, cross-platform consistency)

**Content structure (no DOM changes):**
- Sections remain 4 (PTT, Always-Listening, TTS, Whisper)
- Section dividers (`<hr>`) stay; consider upgrading styling (e.g., thicker, brighter border)
- Button bar structure unchanged
- Toast position unchanged (fixed bottom-right)

**Spacing improvements:**

Within each `<section>` container:
- Replace `space-y-6` with **`space-y-8`** (32px between sections) at the flex container level
- Increase internal section spacing: **`space-y-4`** within HotkeyRecorder, VAD section (16px between controls vs. current 3px in TtsProviderSelect)
- TtsProviderSelect uses `space-y-3` (12px); upgrade to **`space-y-4`** (16px)

Section headers:
- Keep `h2.text-base font-semibold` (readable, not oversized)
- Add **`mb-4`** (16px) below each h2 to separate header from first control (currently `mb-3` = 12px)

Control widths:
- All inputs/selects already `w-full` — they'll naturally expand with window width
- No changes needed; they scale proportionally

**Visual hierarchy improvements:**

Section cards (optional upgrade):
- Consider wrapping each `<section>` in a subtle background card: `bg-gray-800/50 border border-white/10 rounded-lg p-4`
  - This adds visual separation without changing the content structure
  - Not required for POLISH-01, but recommended for polish
  - Preserve existing border-white/20 horizontal rules if cards are not used

Button bar:
- Currently `flex justify-end gap-3 mt-6` — good spacing
- Consider upgrading to `gap-4` (16px) if window width allows
- Button styling (Cancel/Save) unchanged

### Pattern: Responsive Text Styling

All text follows Tailwind semantic sizes:
- `text-xs` (12px): labels (`text-white/70`), helper text (`text-white/50`), form hints
- `text-sm` (14px): input/select text, button labels
- `text-base` (16px): section headers (h2)

Keep these unchanged; they scale proportionally with window width.

### Pattern: Color & Opacity System

Dark theme with opacity shades:
- `text-white` — primary (headings, input text)
- `text-white/70` — secondary (labels, less emphasis)
- `text-white/50` — tertiary (helper text, low emphasis)
- `border-white/20` — subtle borders
- `bg-gray-800` — input/select background (Tailwind gray-800 = #1F2937)
- `bg-black/95` — page background (95% opaque black)
- `text-cyan-500` — accent (focus states, active indicators)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Custom window resizing logic | Drag-to-resize handlers | Keep `resizable: false` in BrowserWindow config | Electron handles platform-specific resizing; custom logic breaks on macOS/Linux |
| Section separators | Custom divider components | Tailwind `<hr>` or `border-t border-white/X` | Simple, consistent, no extra component overhead |
| Responsive layout media queries | CSS @media breakpoints | Tailwind responsive modifiers (`md:`, `lg:`) | Tailwind generates mobile-first classes; Settings is fixed-size (no breakpoints needed) |
| Custom range slider styling | Hand-coded thumb/track | CSS pseudoelements (`::-webkit-slider-thumb`, `::-moz-range-thumb`) | Already implemented in globals.css (Phase 40); platform-specific cross-browser support built in |
| Color/spacing tweaks | Magic numbers in inline styles | Tailwind utility classes and tailwind.config.ts extensions | Consistency with design system, avoid CSS debt, centralized tokens |

## Common Pitfalls

### Pitfall 1: Window Content Overflow
**What goes wrong:** Adding content without increasing window height causes layout to scroll or cut off.
**Why it happens:** Fixed `height: 520` assumes min content size; adding sections or padding can exceed viewport.
**How to avoid:** Measure total content height (h2 + controls + spacing + button bar = ~480–500px at max); increase window height to 560–600 if needed.
**Warning signs:** Scrollbar appears, button bar is cut off at bottom, or layout is cramped vertically.

### Pitfall 2: Responsive Classes in Fixed Layout
**What goes wrong:** Using Tailwind responsive breakpoints (`md:`, `lg:`) in a fixed 600px window confuses breakpoint activation.
**Why it happens:** Tailwind breakpoints are for fluid responsive design (sm: 640px, md: 768px, etc.); fixed-size window at 600px sits between sm and md, causing unpredictable class activation.
**How to avoid:** Phase 47 is fixed layout — use only base Tailwind classes, no breakpoint prefixes. If breakpoints are needed later, set explicit window size constraints in Tailwind config or use CSS `@media (min-width: 600px)` for custom logic.
**Warning signs:** Buttons/inputs have different widths at 600px than expected; styles flicker on resize.

### Pitfall 3: Padding Consistency Across Sections
**What goes wrong:** Some sections have p-4, others p-6; section borders/backgrounds don't align visually.
**Why it happens:** Piecemeal style additions without unified spacing token.
**How to avoid:** Define one padding token for all sections (e.g., `p-4` or `p-5`), apply consistently, then adjust specific controls with margin/gap.
**Warning signs:** Section dividers misalign, horizontal scroll appears, content feels lopsided.

### Pitfall 4: Color Opacity Loss on Dark Backgrounds
**What goes wrong:** `border-white/20` on `bg-black/95` is barely visible; text `text-white/50` is too faint to read.
**Why it happens:** Layering low-opacity colors on dark backgrounds requires higher opacity values to remain readable.
**How to avoid:** Test all color combinations at actual window size; if needed, upgrade `border-white/20` → `border-white/30` or `text-white/50` → `text-white/60` for helper text.
**Warning signs:** Labels are hard to read, section borders are invisible, focus states are unclear.

### Pitfall 5: Form Input Width Bleeding
**What goes wrong:** `w-full` inputs with padding overflow parent container at certain widths.
**Why it happens:** `w-full` = 100% of parent; with `px-3` padding on the input, total width = 100% + 6px (right-padding is outside the box unless `box-sizing: border-box` is set).
**How to avoid:** Tailwind sets `box-sizing: border-box` globally (globals.css line 12); ensure padding is inside, not added on top. This is already correct in the codebase.
**Warning signs:** Horizontal scrollbar appears, buttons are cut off, inputs overflow their container.

## Code Examples

Verified patterns from current codebase (settingsWindow.ts, SettingsForm.tsx):

### Example 1: Window Configuration (settingsWindow.ts)
```typescript
// Source: apps/desktop/src/main/settingsWindow.ts
function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,        // CHANGE THIS TO 600 or 640
    height: 520,       // Optionally increase to 560
    show: false,
    frame: true,       // Keep native frame
    resizable: false,  // Keep fixed sizing
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, '../preload/settings.js'),
    },
  });
  // ... rest of function
}
```

**Phase 47 change:** Update `width: 480` → `width: 600` (baseline) or `width: 640` (premium).

### Example 2: Section Spacing (SettingsForm.tsx)
```typescript
// Source: apps/desktop/src/renderer/src/settings/SettingsForm.tsx line 139–246
return (
  <div className="min-h-screen bg-black/95 text-white p-6 flex flex-col font-[Inter,...]">
    <div className="flex-1 space-y-6">
      {/* Current: space-y-6 = 24px between sections */}
      
      <section>
        <h2 className="text-base font-semibold text-white mb-3">Push-to-Talk</h2>
        <HotkeyRecorder
          label="Hotkey"
          value={pttHotkey}
          onRecorded={setPttHotkey}
        />
      </section>
      <hr className="border-white/20" />
      
      {/* Repeat for Always-Listening, TTS, Whisper sections */}
    </div>
    
    {/* Button bar — unchanged */}
    <div className="flex justify-end gap-3 mt-6">
      {/* buttons */}
    </div>
  </div>
);
```

**Phase 47 changes:**
1. Replace `space-y-6` with `space-y-8` (32px between sections)
2. Replace `mb-3` with `mb-4` on all h2 headers (more breathing room under heading)
3. In TtsProviderSelect, upgrade internal `space-y-3` to `space-y-4` (12px → 16px)
4. Optional: wrap sections in subtle cards (bg-gray-800/50 border border-white/10 rounded p-4)

### Example 3: Input Field Styling (consistent across all inputs)
```typescript
// Source: TtsProviderSelect.tsx line 30–50, HotkeyRecorder.tsx line 78–83
<input
  type="text"
  value={apiKey}
  onChange={(e) => onApiKeyChange(e.target.value)}
  className="w-full px-3 py-2 rounded text-sm font-medium bg-gray-800 text-white border border-white/20 focus:border-cyan-500/80 focus:shadow-[0_0_8px_rgba(6,182,212,0.3)] outline-none placeholder:text-white/30"
/>
```

**No changes needed** for Phase 47; inputs already use `w-full` and will scale with window width. Padding and focus states are correct.

### Example 4: Section Dividers (upgrade for visual clarity)
```html
<!-- Current: simple horizontal rule -->
<hr className="border-white/20" />

<!-- Optional upgrade: darker/thicker line -->
<hr className="border border-white/20 my-1" />

<!-- Or: subtle colored divider (not required) -->
<hr className="border-white/10 my-2" />
```

Current implementation is fine; no changes required unless stronger visual separation is desired.

## Validation Architecture

Test framework: Vitest + React Testing Library (happy-dom environment)
Config file: apps/desktop/vitest.config.ts (inferred from @vitest-environment annotation in SettingsForm.test.tsx)

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLISH-01 | Settings window renders without layout overflow at 600px width | Visual/integration | `vitest run apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx` | ✅ SettingsForm.test.tsx exists |
| POLISH-01 | Section headers (PTT, Always-Listening, TTS, Whisper) are visually distinct | Visual | Manual (component render check) | ✅ SettingsForm.test.tsx covers render |
| POLISH-01 | All controls (hotkey, slider, selects, inputs) remain functional after layout changes | Integration | `vitest run` (existing form tests) | ✅ Full suite covers input changes |
| POLISH-01 | No scroll bar appears at 520–560px height | Visual | Manual Electron window test | N/A — visual regression only |

### Test Sampling Rate
- **Per task commit:** Run SettingsForm.test.tsx to verify component logic (no regressions)
- **Per wave merge:** Run full Vitest suite (`npm run test` in apps/desktop/) to check cross-component impacts
- **Phase gate:** Manual visual inspection in Electron (open Settings window, verify layout at 600px width, check section spacing, confirm all controls are accessible)

### Wave 0 Gaps
None identified. Existing SettingsForm.test.tsx covers all settings logic (get, save, VAD threshold apply). Phase 47 is layout-only; no new test coverage required unless window resize behavior or new CSS is added.

## Environment Availability

This phase involves no external dependencies beyond what the desktop app already uses:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/dev | ✓ | 20.x+ (inferred) | — |
| TypeScript | Compilation | ✓ | 5.x | — |
| Tailwind CSS | Styling | ✓ | 3.4.1 (config) | — |
| Electron | Window management | ✓ | 31.x (inferred) | — |
| React | Renderer | ✓ | 18.x (inferred) | — |

No external tools, APIs, or databases required. Phase 47 is pure local development (no cloud services, no additional system packages).

## State of the Art

Settings UI patterns in Electron + React (2026):

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed 480px window, cramped layout | Wider window (600–640px) + improved spacing | Phase 47 (2026) | Better readability, reduced cognitive load, aligns with modern desktop UI standards |
| `<hr>` dividers only | Cards with subtle background/border (optional) | Phase 47 (opt-in) | Stronger visual grouping, more polished appearance |
| Uniform p-6 padding everywhere | Layered spacing (p-6 outer, p-4 inner sections, space-y-8 between) | Phase 47 | Better visual hierarchy, easier to scan |

**No deprecated patterns identified.** Settings UI uses current Tailwind v3.4 utilities; no v4 breaking changes planned for this phase.

## Open Questions

1. **Card-style section backgrounds (optional polish):**
   - Should sections be wrapped in subtle background cards (bg-gray-800/50 border border-white/10 rounded-lg p-4)?
   - Or keep flat layout with improved spacing only?
   - Decision: Recommend cards for maximum polish, but allow planner to decide based on taste/timeline.

2. **Window height increase:**
   - Should height increase from 520 → 560 to accommodate more padding?
   - Current 520 fits all content at max zoom; 560 is safer margin.
   - Decision: Recommend 560, but 520 is viable if content fits.

3. **Section divider styling:**
   - Upgrade `border-white/20` to `border-white/30` for better contrast?
   - Or remove `<hr>` entirely and use card backgrounds for separation?
   - Decision: Keep `<hr>` at current styling; upgrade only if cards are not used.

## Sources

### Primary (HIGH confidence)
- **apps/desktop/src/main/settingsWindow.ts** — Current window configuration verified (width: 480, height: 520, resizable: false)
- **apps/desktop/src/renderer/src/settings/SettingsForm.tsx** — Component structure, spacing, section layout verified (lines 139–282)
- **apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx** — Input styling and spacing patterns verified
- **apps/desktop/src/renderer/src/settings/HotkeyRecorder.tsx** — Control patterns verified
- **apps/desktop/tailwind.config.ts** — Tailwind theme extensions verified (colors, spacing, fonts)
- **apps/desktop/src/renderer/src/styles/globals.css** — Global styles and VAD slider CSS verified (lines 1–111)
- **apps/desktop/src/renderer/settings.html** — HTML structure, font loading, CSP verified
- **apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx** — Test infrastructure verified

### Secondary (MEDIUM confidence)
- Tailwind CSS v3 documentation — Utility classes and responsive patterns (standard web knowledge)
- Electron BrowserWindow API — Window configuration options (standard Electron patterns)
- React hooks patterns — useState, useEffect usage (verified in existing codebase)

### Tertiary (LOW confidence)
- None — all findings verified with primary source code.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — All technologies verified in source code (React, Tailwind, Electron, TypeScript)
- Architecture: **HIGH** — SettingsForm.tsx and settingsWindow.ts fully reviewed; no speculation
- Pitfalls: **HIGH** — Patterns drawn from phase 40 (VAD slider CSS) and existing UI components (Orb, ChatInput)
- Test coverage: **HIGH** — Existing Vitest setup reviewed; SettingsForm.test.tsx found and analyzed

**Research date:** 2026-05-02
**Valid until:** 2026-05-09 (7 days — Electron/Tailwind/React versions are stable; no major changes expected)
