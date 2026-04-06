# Phase 12: Hotkey + Text Chat - Validation Strategy

**Phase:** 12-hotkey-text-chat
**Created:** 2026-04-06
**Framework:** vitest 4.1.2 + @testing-library/react 16.3.2

## Test Strategy

### Framework Configuration
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 + @testing-library/react 16.3.2 |
| Config file | apps/desktop/vitest.config.ts (existing) |
| Quick run command | `pnpm --filter desktop test` |
| Full suite command | `pnpm --filter desktop test` |

### Requirements → Test Coverage Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| ACTV-01 | globalShortcut.register() returns boolean; fallback when registration fails | unit | `pnpm --filter desktop test src/main/__tests__/hotkey.test.ts` | src/main/__tests__/hotkey.test.ts |
| ACTV-01 | Tray menu has "Configure Hotkey" submenu with radio group | unit | `pnpm --filter desktop test src/main/__tests__/tray.test.ts` | src/main/__tests__/tray.test.ts (extend) |
| ACTV-02 | IPC handler calls fetch(`http://localhost:3000/api/chat`) with message | unit | `pnpm --filter desktop test src/main/__tests__/ipc-chat.test.ts` | src/main/__tests__/ipc-chat.test.ts |
| ACTV-02 | ChatInput form submit calls window.jarvis.sendText() | unit | `pnpm --filter desktop test src/renderer/components/ChatInput/ChatInput.test.tsx` | src/renderer/components/ChatInput/ChatInput.test.tsx |
| ACTV-02 | Orb transitions: idle → processing → responding → idle | integration | `pnpm --filter desktop test src/renderer/components/ChatInput/ChatInput.test.tsx` | src/renderer/components/ChatInput/ChatInput.test.tsx |
| ACTV-02 | SpeechBubble renders reply text above orb | unit | `pnpm --filter desktop test src/renderer/components/SpeechBubble/SpeechBubble.test.tsx` | src/renderer/components/SpeechBubble/SpeechBubble.test.tsx |

## Sampling Strategy

### Per-Task Validation
After each task commit, run the specific test file for that task:
```bash
pnpm --filter desktop test {test file for that task}
```

### Per-Wave Validation
After merging all tasks in a wave, run full test suite:
```bash
pnpm --filter desktop test
```

### Phase Gate Validation
Before `/gsd:verify-work`, ensure:
1. **Full suite green:** All automated tests passing
2. **Manual smoke test:**
   - Press Ctrl+Shift+J → widget shows/hides
   - Click input button → input appears below orb
   - Type message + Enter → orb goes to processing → responding → idle
   - Reply appears in speech bubble above orb
   - Change hotkey in tray menu → new hotkey works immediately

## Wave 0 Test Gaps (Created During Execution)

Plans should create these test files during implementation:

- [ ] `src/main/__tests__/hotkey.test.ts` — ACTV-01 (registration, fallback, persistence)
- [ ] `src/main/__tests__/ipc-chat.test.ts` — ACTV-02 (fetch call, timeout, error handling)
- [ ] `src/renderer/components/ChatInput/ChatInput.test.tsx` — ACTV-02 (form submit, IPC call, state transitions)
- [ ] `src/renderer/components/SpeechBubble/SpeechBubble.test.tsx` — ACTV-02 (bubble rendering, positioning)
- [ ] Extend `src/main/__tests__/tray.test.ts` — Add submenu assertions for ACTV-01

## Nyquist Validation Protocol

**Validation Trigger:** After all Wave 2 plans complete

**Automated Verification Command:**
```bash
pnpm --filter desktop test
```

**Manual Verification Items:**
1. Global hotkey works from any context (browser focused, terminal focused, desktop)
2. Hotkey conflict triggers fallback (tray icon still activates widget)
3. Speech bubble grows vertically for long responses (no scroll, no truncation)
4. Orb state transitions are visually smooth (no flicker between states)

**Coverage Target:** 100% of ACTV-01 and ACTV-02 requirements

**Success Criteria:**
- All automated tests pass
- All manual verification items checked
- No gaps between plan deliverables and phase success criteria

---

*Generated from RESEARCH.md Validation Architecture section*
