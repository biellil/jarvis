# Phase 12 — UI Review

**Audited:** 2026-04-07
**Baseline:** Abstract 6-pillar standards (no UI-SPEC exists)
**Screenshots:** Not captured (no dev server running on port 3000)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Good labels and placeholders, generic error messages |
| 2. Visuals | 4/4 | Clear visual hierarchy, excellent state feedback via orb |
| 3. Color | 3/4 | Hardcoded hex values throughout, no design token system |
| 4. Typography | 4/4 | Minimal font size usage (3 sizes), excellent consistency |
| 5. Spacing | 3/4 | Simple spacing, some magic numbers need documentation |
| 6. Experience Design | 4/4 | Comprehensive state handling, excellent error boundaries |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **Centralize color values into design tokens** — Reduces maintenance burden and ensures consistency — Create `apps/desktop/src/renderer/styles/tokens.ts` with named exports for cyan, violet, blue colors and replace all 30+ hardcoded hex/rgba values
2. **Improve error message specificity** — Generic "Error: Unknown error" doesn't help users troubleshoot — Update ChatInput.tsx line 69 to distinguish network errors, timeout errors, and API errors with actionable messages
3. **Document spacing magic numbers** — `bottom: 140px` and `margin-top: 8px` lack context — Add CSS comments explaining the math (e.g., "140px = 96px orb + 32px button + 12px gap")

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Strengths:**
- Placeholder text "Type a message..." is clear and actionable (ChatInput.tsx:118)
- Aria-labels are specific and contextual: "Toggle chat input", "Message input", "JARVIS orb in ${state} state"
- Tray menu labels are concise and unambiguous: "Show", "Hide", "Configure Hotkey", "Quit"
- Hotkey options display OS-agnostic labels: "Ctrl+Shift+J" (user-facing) vs "CmdOrCtrl+Shift+J" (internal)

**Issues:**
- **Generic error fallback:** Line 69 in ChatInput.tsx shows `"Error: " + (result.error || 'Unknown error')` - "Unknown error" is not actionable
- **No empty state messaging:** When speech bubble is hidden, there's no visual cue that the text input is available (first-time user discovery issue)

**Recommendations:**
- Replace "Unknown error" with specific messages:
  - Network error: "Can't reach JARVIS. Check your connection."
  - Timeout: "Request timed out. Try again."
  - API error: Show the actual error message from backend
- Consider adding a subtle tooltip or first-run hint for the keyboard button

**Evidence:**
```typescript
// ChatInput.tsx:69
setReply('Error: ' + (result.error || 'Unknown error'));
```

---

### Pillar 2: Visuals (4/4)

**Strengths:**
- **Clear focal point:** The orb is the undisputed center of attention (96px diameter, glowing, animated)
- **Visual hierarchy:** Speech bubble (280px max-width) → Orb (96px) → Input button (32px) - clear size progression
- **State feedback:** Orb color changes communicate system state immediately (cyan=idle, violet=processing, blue=responding, amber=listening)
- **Accessibility:** All interactive elements have aria-labels and title attributes
- **Animation purpose:** Ripple rings on responding state clearly indicate activity without distraction

**Visual structure observed:**
- Orb uses radial gradient with light source at 30% 30% - creates 3D depth
- Speech bubble uses clip-path polygon for clean tail pointing to orb - single element solution
- Button has subtle hover scale (1.05) and active scale (0.95) for tactile feedback

**No issues found.** Visual design is cohesive and functional.

---

### Pillar 3: Color (3/4)

**Strengths:**
- **Consistent accent palette:** Cyan (#06B6D4) for idle, Violet (#8B5CF6) for processing, Blue (#3B82F6) for responding, Amber (#F59E0B) for listening
- **Appropriate opacity usage:** Semi-transparent backgrounds (rgba(0,0,0,0.6)) allow window transparency to work correctly
- **Semantic color mapping:** Each orb state has a distinct color that communicates meaning

**Issues:**
- **Hardcoded color values:** 30+ instances of hex and rgba values across files with no central design token system
  - `App.css`: rgba(0, 255, 255, 0.3) used 11 times for cyan borders/text
  - `Orb.tsx`: Hex colors defined as const but not reusable across components
  - `SpeechBubble.css`: Gradient uses #3b82f6 and #8b5cf6 without reference to shared tokens
- **No design token system:** Colors are duplicated and could drift out of sync during updates

**Evidence:**
```typescript
// Orb.tsx:5-8 - Not reusable by other components
const stateColors = {
  idle: '#06B6D4',      // cyan-500
  listening: '#F59E0B',  // amber-500
  processing: '#8B5CF6', // violet-500
  responding: '#3B82F6', // blue-500
} as const;

// App.css:35-37 - Hardcoded rgba cyan
border: 1px solid rgba(0, 255, 255, 0.3);
background: rgba(0, 0, 0, 0.6);
color: rgba(0, 255, 255, 0.8);

// SpeechBubble.css:22 - Gradient with hardcoded hex
background: linear-gradient(135deg, #3b82f6, #8b5cf6);
```

**Recommendation:**
Create `apps/desktop/src/renderer/styles/tokens.ts`:
```typescript
export const colors = {
  cyan: { base: '#06B6D4', alpha30: 'rgba(0, 255, 255, 0.3)', ... },
  violet: { base: '#8B5CF6', ... },
  blue: { base: '#3B82F6', ... },
  // etc.
};
```

---

### Pillar 4: Typography (4/4)

**Strengths:**
- **Minimal font size usage:** Only 3 font sizes in the entire phase (16px, 14px, 13px)
- **Consistent sizing:**
  - 16px: Button icons (App.css:38)
  - 14px: Speech bubble text (SpeechBubble.css:26)
  - 13px: Input field text (App.css:69)
- **No font weight variation:** Uses system default weights only - avoids visual noise
- **System font stack:** `system-ui, -apple-system, sans-serif` ensures native appearance on all platforms

**Evidence:**
```css
/* App.css:38 */
font-size: 16px; /* Button */

/* App.css:69 */
font-size: 13px; /* Input field */

/* SpeechBubble.css:26 */
font-size: 14px; /* Bubble text */
```

**No issues found.** Typography is minimal, consistent, and appropriate for a desktop widget.

---

### Pillar 5: Spacing (3/4)

**Strengths:**
- **Simple spacing system:** Uses 8px base unit (8px, 12px, 16px, 24px, 48px)
- **Consistent padding:** 12px 16px for speech bubble, 8px 12px for input - follows 8px grid
- **Aligned margins:** 8px margin-top used consistently for vertical spacing

**Issues:**
- **Magic numbers lack documentation:**
  - `bottom: 140px` in SpeechBubble.css:33 - no comment explaining "96px orb + 32px button + 12px gap"
  - `min-height: 300px` in App.css:16 - no explanation of window height calculation
  - `gap: 0` in App.css:13 - unclear why gap is explicitly zero
- **Hardcoded positional values:** 140px bottom position couples tightly to orb size - refactor would break positioning

**Evidence:**
```css
/* SpeechBubble.css:33 - Magic number */
bottom: 140px; /* Above orb (96px) + spacing */

/* App.css:16 - Undocumented calculation */
min-height: 300px;

/* App.css:26 - Spacing value */
margin-top: 8px;
```

**Recommendations:**
- Add CSS comments for all calculated positions
- Consider CSS custom properties for related values:
  ```css
  :root {
    --orb-size: 96px;
    --button-size: 32px;
    --spacing-unit: 8px;
    --bubble-bottom: calc(var(--orb-size) + var(--button-size) + var(--spacing-unit) * 1.5);
  }
  ```

---

### Pillar 6: Experience Design (4/4)

**Strengths:**
- **Comprehensive state handling:**
  - Loading: Orb transitions to 'processing' state with violet color and animation (ChatInput.tsx:46)
  - Success: Orb transitions to 'responding' with blue ripple rings, shows speech bubble (ChatInput.tsx:57-60)
  - Error: Returns to idle state, displays error in speech bubble (ChatInput.tsx:67-70)
  - Empty state: Blocks submission of empty messages (ChatInput.tsx:38-40)
- **Error boundaries:** Try-catch wrapper in handleSubmit catches exceptions and shows user-facing error (ChatInput.tsx:76-80)
- **State timing:** 2-second delay before returning to idle gives user time to acknowledge response (ChatInput.tsx:63-65)
- **Input focus management:** Auto-focus when input appears, maintains focus after send (ChatInput.tsx:24-28, 73-75)
- **Disabled state handling:** Input is conditionally rendered - no "disabled" state needed
- **Graceful degradation:** Hotkey failure doesn't crash app - tray menu Show/Hide still works (tray.ts:60-68)

**State flow verified:**
```
User enters text → Enter pressed
→ Orb: idle → processing (violet, spinning)
→ IPC call to gateway
→ Success: Orb → responding (blue ripples) + bubble appears
→ 2s delay → Orb → idle
→ Error: Orb → idle + error bubble
```

**No issues found.** Experience design is production-ready with excellent error handling.

---

## Files Audited

**Renderer components (5 files):**
- `apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx` (129 lines)
- `apps/desktop/src/renderer/components/SpeechBubble/SpeechBubble.tsx` (26 lines)
- `apps/desktop/src/renderer/components/SpeechBubble/SpeechBubble.css` (51 lines)
- `apps/desktop/src/renderer/src/App.tsx` (48 lines)
- `apps/desktop/src/renderer/src/App.css` (99 lines)

**Main process (1 file):**
- `apps/desktop/src/main/tray.ts` (102 lines) - Hotkey submenu with radio options

**Supporting components (referenced but not changed in Phase 12):**
- `apps/desktop/src/renderer/components/Orb/Orb.tsx` (103 lines) - Color and state logic
- `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` - State management

**Total:** 558 lines of UI code across 8 files
