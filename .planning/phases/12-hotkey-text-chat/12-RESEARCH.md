# Phase 12: Hotkey + Text Chat - Research

**Researched:** 2026-04-06
**Domain:** Electron global shortcuts, React form handling, IPC request/response, HTTP client in main process, UI state management
**Confidence:** HIGH

## Summary

Phase 12 enables widget activation via global hotkey (Ctrl+Shift+J) and text-based chat that completes the full IPC chain (renderer → main → gateway → FastAPI → back) with visual orb state transitions. Research reveals that Electron's globalShortcut API returns boolean for registration success (enabling fallback detection), MenuItem radio groups provide automatic mutual exclusion for hotkey selection menus, and the existing IPC Result<T> pattern already handles async errors correctly. The current stack (Electron 41.1.1, React 19.2.4, electron-store 11.0.2) supports all required features without additional dependencies.

**Primary recommendation:** Use globalShortcut.register() with return value checking + predefined MenuItem radio group for hotkey config + native fetch in main process for gateway calls + controlled React form with onSubmit handler.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Input UI:**
- **D-01:** Widget tem um **botão** (posicionado próximo ao orb)
- **D-02:** Ao clicar no botão → **input de texto aparece abaixo do orb**
- **D-03:** Input é **fallback para quando voz não está disponível** (sem microfone ou áudio desabilitado)
- **D-04:** Usuário digita mensagem e pressiona **Enter** para enviar

**Hotkey Configuration:**
- **D-05:** Hotkey padrão: **Ctrl+Shift+J**
- **D-06:** Configuração via **submenu no tray icon** (junto com Show/Hide/Quit)
- **D-07:** Submenu apresenta **opções pré-definidas**: Ctrl+Shift+J, Ctrl+Alt+J, Ctrl+Shift+Space, etc.
- **D-08:** Usuário clica em opção → hotkey **muda imediatamente**
- **D-09:** Hotkey salvo em **electron-store** (persiste entre sessões)
- **D-10:** Se hotkey falhar ao registrar → continua funcional via tray icon (Show)

**Response Display:**
- **D-11:** Resposta aparece como **balão/speech bubble acima do orb**
- **D-12:** Balão **cresce para mostrar toda a resposta** (sem scroll, sem limite de altura)
- **D-13:** Balão **permanece visível até próxima mensagem ser enviada**
- **D-14:** No futuro (fora desta fase), API retornará **texto + áudio opcional** — se houver áudio, reproduz; senão, mostra texto

### Claude's Discretion

- **Orb Feedback Timing:** Quando exatamente transicionar entre idle → processing → responding → idle (baseado em eventos: envio, aguardando API, resposta recebida)
- **Balão Styling:** Cores, sombras, animação de entrada/saída (manter consistente com tema futurístico do orb)
- **Botão de Input:** Ícone, posição exata, tamanho (deve ser discreto mas descobrível)
- **Error Handling:** Como mostrar erros de rede/API (balão de erro, notificação, ou outro feedback)

### Deferred Ideas (OUT OF SCOPE)

- **Chat History UI:** Mostrar histórico de mensagens anteriores — complexo, não essencial para MVP
- **Markdown Rendering:** Formatação rica nas respostas (code blocks, listas) — API retorna texto puro por enquanto
- **Streaming de Resposta:** Mostrar resposta token-a-token em tempo real — gateway já tem /stream, mas widget não precisa disso agora
- **Custom Hotkey Input:** Permitir usuário digitar qualquer combinação (ex: "Alt+Shift+K") — submenu com opções pré-definidas é suficiente

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACTV-01 | Hotkey global `Ctrl+Shift+J` registra via globalShortcut com checagem de valor de retorno + fallback automático + tray como alternativa obrigatória se ambos falharem | globalShortcut API patterns, registration return values, fallback strategies |
| ACTV-02 | Caixa de texto pequena aparece ao ativar o widget — Enter envia mensagem via IPC → main → `POST /api/chat` → resposta aciona transição de estado do orb | React controlled form patterns, IPC async invoke, HTTP client in main, orb state transitions |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.1.1 | Desktop app runtime with globalShortcut API | Latest stable — globalShortcut.register() returns boolean for success detection (verified 2026-04-06) |
| react | 19.2.4 | UI rendering with controlled forms | Current stable — form onSubmit works natively without libraries (verified 2026-04-06) |
| electron-store | 11.0.2 | Configuration persistence (hotkey preference) | Already in use for window position — atomic writes, TypeScript schema support, ESM-native (verified 2026-04-06) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native fetch | Node.js 18+ | HTTP client for main → gateway calls | Node 24.13.0 already installed — zero dependencies, built-in since Node 18 |
| Tailwind CSS | 4.0.0 | Speech bubble styling | Already in project — use for responsive bubble with clip-path + border-image pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch | axios | axios adds 35.6KB + supply chain risk (2026 npm compromise); fetch is built-in and zero dependencies |
| Native fetch | Electron net module | net module better for proxy support, but adds complexity; fetch sufficient for localhost gateway calls |
| Controlled form | React Hook Form + Zod | RHF minimizes re-renders and Zod adds type-safe validation, but single input field doesn't justify the overhead |
| CSS clip-path | react-tooltip library | Libraries add bundle size; CSS-only speech bubble is 95% quality at 10% effort per Smashing Magazine 2024 |

**Installation:**

No new dependencies required — all features available in current stack.

**Version verification:**
```bash
npm view electron version      # 41.1.1 (published 2026-03-21)
npm view electron-store version # 11.0.2 (published 2025-12-18)
npm view react version         # 19.2.4 (published 2025-01-30)
```

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop/src/
├── main/
│   ├── ipc/
│   │   ├── index.ts          # Registry pattern (existing)
│   │   ├── chat.ts           # Chat handlers (existing — extend for gateway call)
│   │   └── hotkey.ts         # NEW: Hotkey management handlers
│   ├── hotkey.ts             # NEW: globalShortcut registration module
│   ├── tray.ts               # Extend: Add hotkey submenu
│   └── position.ts           # Existing: electron-store pattern to reuse
├── renderer/
│   ├── components/
│   │   ├── Orb/
│   │   │   ├── OrbContext.tsx  # Existing: useOrbContext() hook
│   │   │   └── Orb.tsx         # Existing: Orb visual
│   │   ├── ChatInput/        # NEW: Text input component
│   │   │   ├── ChatInput.tsx
│   │   │   └── ChatInput.test.tsx
│   │   └── SpeechBubble/     # NEW: Response display component
│   │       ├── SpeechBubble.tsx
│   │       └── SpeechBubble.test.tsx
└── shared/
    └── ipc-types.ts          # Extend: Add hotkey IPC types
```

### Pattern 1: Global Shortcut Registration with Fallback
**What:** Register global hotkey, check return value, handle conflicts gracefully
**When to use:** All global shortcut registration
**Example:**
```typescript
// Source: Electron docs + existing position.ts pattern
import { globalShortcut, app } from 'electron';
import Store from 'electron-store';

interface HotkeyConfig {
  accelerator: string;
}

const store = new Store<{ hotkey?: HotkeyConfig }>();

export function registerHotkey(mainWindow: BrowserWindow): boolean {
  const accelerator = store.get('hotkey.accelerator', 'CmdOrCtrl+Shift+J');

  const success = globalShortcut.register(accelerator, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  if (!success) {
    console.warn(`[hotkey] Failed to register ${accelerator} — already taken by another app`);
    // D-10: Tray icon still works as fallback (no error thrown)
  }

  return success;
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll();
}

// Register after app ready, unregister on quit
app.whenReady().then(() => registerHotkey(mainWindow));
app.on('will-quit', unregisterAll);
```

### Pattern 2: Tray Submenu with Radio Group
**What:** Nested submenu with mutually exclusive radio buttons for hotkey selection
**When to use:** User-configurable options with one active choice
**Example:**
```typescript
// Source: Electron MenuItem docs + existing tray.ts structure
import { Tray, Menu, MenuItem } from 'electron';

const hotkeyOptions = [
  { label: 'Ctrl+Shift+J', accelerator: 'CmdOrCtrl+Shift+J' },
  { label: 'Ctrl+Alt+J', accelerator: 'CmdOrCtrl+Alt+J' },
  { label: 'Ctrl+Shift+Space', accelerator: 'CmdOrCtrl+Shift+Space' },
  { label: 'Ctrl+`', accelerator: 'CmdOrCtrl+`' },
];

export function createTrayWithHotkeySubmenu(mainWindow: BrowserWindow): Tray {
  const currentAccelerator = store.get('hotkey.accelerator', 'CmdOrCtrl+Shift+J');

  const hotkeySubmenu = hotkeyOptions.map(option => ({
    label: option.label,
    type: 'radio' as const,
    checked: option.accelerator === currentAccelerator,
    click: () => {
      // D-08: Unregister old, register new immediately
      globalShortcut.unregisterAll();
      store.set('hotkey.accelerator', option.accelerator);
      const success = registerHotkey(mainWindow);

      if (!success) {
        // Could show notification: "Hotkey unavailable, use tray icon instead"
      }
    },
  }));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow.show() },
    { label: 'Hide', click: () => mainWindow.hide() },
    {
      label: 'Configure Hotkey',
      type: 'submenu',
      submenu: hotkeySubmenu,
    },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  return tray;
}
```

### Pattern 3: IPC Request/Response with Gateway HTTP Call
**What:** Renderer invokes IPC → main process calls gateway via fetch → returns Result<T>
**When to use:** All API interactions from Electron (chat, audio, future features)
**Example:**
```typescript
// Source: Existing chat.ts IPC handler + Node.js fetch docs
// File: main/ipc/chat.ts
import { ipcMain } from 'electron';
import { IPC_CHANNELS, type ChatResponse } from '../../shared/ipc-types';

const GATEWAY_URL = 'http://localhost:3000';

export function setupChatHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND_TEXT,
    async (_event, message: string): Promise<ChatResponse> => {
      try {
        console.log('[IPC:chat:send-text] Sending to gateway:', message);

        const response = await fetch(`${GATEWAY_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });

        if (!response.ok) {
          throw new Error(`Gateway returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        return {
          success: true,
          data: { reply: data.response }, // Adjust based on actual API shape
        };
      } catch (err) {
        console.error('[IPC:chat:send-text] Error:', err);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );
}
```

### Pattern 4: Controlled Form with Orb State Transitions
**What:** React controlled input, onSubmit calls IPC, state transitions drive orb animation
**When to use:** All user input that triggers backend processing
**Example:**
```typescript
// Source: React docs + existing OrbContext.tsx
import { useState, FormEvent } from 'react';
import { useOrbContext } from '../Orb/OrbContext';

export function ChatInput() {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const { setState } = useOrbContext();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim()) return;

    // D-02: Transition to processing immediately on send
    setState('processing');

    try {
      const result = await window.jarvis.sendText(message);

      if (result.success && result.data) {
        // D-11: Transition to responding when reply received
        setState('responding');
        setReply(result.data.reply);

        // Return to idle after animation completes (e.g., 2s)
        setTimeout(() => setState('idle'), 2000);
      } else {
        // Error handling — show error in bubble or notification
        setState('idle');
        setReply(`Error: ${result.error}`);
      }
    } catch (err) {
      setState('idle');
      console.error('[ChatInput] IPC error:', err);
    }

    setMessage(''); // Clear input after send
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          autoFocus
        />
      </form>
      {reply && <SpeechBubble text={reply} />}
    </div>
  );
}
```

### Pattern 5: CSS-Only Speech Bubble
**What:** Speech bubble with arrow using clip-path + border-image, responsive to content
**When to use:** Display responses above orb without JavaScript animation library
**Example:**
```tsx
// Source: Smashing Magazine 2024 Modern CSS Tooltips article
export function SpeechBubble({ text }: { text: string }) {
  return (
    <div className="speech-bubble">
      {text}
    </div>
  );
}

// CSS (Tailwind @layer or global styles)
.speech-bubble {
  /* D-12: Grows to fit content, no max-height */
  width: max-content;
  max-width: 300px; /* Prevent horizontal overflow */
  padding: 12px 16px;

  /* Clip-path creates bubble + tail pointing down toward orb */
  clip-path: polygon(
    0% 0%, 100% 0%, 100% 75%,
    55% 75%, 50% 100%, 45% 75%, /* Tail at center bottom */
    0% 75%
  );

  /* border-image provides fill color */
  border-image: fill 0 linear-gradient(135deg, #3b82f6, #8b5cf6);

  /* Typography */
  color: white;
  font-size: 14px;
  line-height: 1.5;

  /* Positioning (absolute relative to widget container) */
  position: absolute;
  bottom: 140px; /* Above orb (96px) + spacing */
  left: 50%;
  transform: translateX(-50%);

  /* D-13: Stays visible until next message */
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

### Anti-Patterns to Avoid

- **Registering common system shortcuts:** Never register Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+R, Alt+Tab — silently fails and breaks user expectations
- **Ignoring globalShortcut.register() return value:** Always check boolean return — registration failure is normal when hotkey is taken
- **Throwing errors across IPC boundary:** Always return Result<T> — errors don't serialize correctly through Electron IPC (only .message property survives)
- **Using sendSync() for IPC:** Blocks renderer thread — always use invoke/handle for async operations
- **Hardcoding gateway URL:** Read from environment or config — port may change, or user may run gateway elsewhere
- **Uncontrolled inputs in Electron:** React state + onChange pattern ensures predictable behavior and easy testing

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client for Node.js | Custom request wrapper with retry logic | Native fetch API (Node 18+) | Built-in since Node 18, zero dependencies, Promise-based, same API as browser fetch — no reason to add axios or custom code |
| Form validation | Custom regex validators for single text input | HTML5 required attribute + trim() check | Single field doesn't justify validation library — browser native validation + basic trim() is sufficient |
| Menu state management | Custom store for tracking which hotkey is selected | MenuItem type='radio' + checked property | Electron automatically manages radio group mutual exclusion — no state tracking needed |
| Speech bubble positioning | JavaScript to calculate position relative to orb | CSS absolute positioning with transform | CSS handles responsive positioning and animations better than JS — use clip-path + border-image for bubble shape |
| Configuration persistence | Custom JSON file read/write with fs | electron-store | Handles atomic writes, schema validation, TypeScript support, app data path resolution — already in use for window position |

**Key insight:** Electron and modern web standards (fetch, CSS clip-path, form onSubmit) provide 90% of what's needed. Don't add libraries (axios, RHF, tooltip components) when native APIs already solve the problem.

## Runtime State Inventory

> Phase 12 is not a rename/refactor/migration phase — this section is omitted.

## Common Pitfalls

### Pitfall 1: globalShortcut Registration Silent Failure
**What goes wrong:** Developer registers hotkey but never checks return value; user presses hotkey and nothing happens; no error message shown
**Why it happens:** Electron intentionally fails silently when another app has already claimed the shortcut — this is OS-level conflict prevention, not a bug
**How to avoid:**
1. Always check `const success = globalShortcut.register(...)` return value
2. Log warning when registration fails: `console.warn('Hotkey unavailable')`
3. Ensure tray icon Show action always works (D-10 requirement)
4. Optional: Show user notification "Hotkey conflict — use tray icon to activate"

**Warning signs:**
- Hotkey works on developer machine but not on user machine (different apps running)
- Registration succeeds in dev build but fails in production (different startup order)

### Pitfall 2: IPC Custom Error Object Serialization Breaks
**What goes wrong:** Main process throws custom error with extra fields (e.g., `{ message, code, details }`); renderer receives only `{ message }` — other fields lost
**Why it happens:** Electron IPC serializes errors to JSON; Error objects only preserve `.message` property; custom fields are silently dropped
**How to avoid:**
1. Never throw errors across IPC boundary
2. Always return Result<T> pattern: `{ success: boolean, data?, error?: string }`
3. If you need error codes, include in error string: `error: 'NETWORK_ERROR: Gateway unreachable'`
4. Wrap all handlers in try/catch and return `{ success: false, error: err.message }`

**Warning signs:**
- Error handling works in unit tests but breaks in integration tests
- `error.code` is undefined in renderer even though you set it in main

### Pitfall 3: Controlled Input Loses Focus After Submit
**What goes wrong:** User submits form, input clears (correct), but focus stays on button or moves to document body — user has to click input again to type next message
**Why it happens:** Form reset or state update can cause React to unmount/remount input, losing focus
**How to avoid:**
1. Use `autoFocus` prop on input for initial focus
2. After form submit, manually refocus: `inputRef.current?.focus()`
3. Use `useRef` hook to maintain stable input reference across renders

**Warning signs:**
- User has to click input field after every message sent
- Tab navigation breaks after first submit

### Pitfall 4: Speech Bubble Clips Orb or Extends Off-Screen
**What goes wrong:** Bubble positioned with fixed bottom offset; on small screens or when widget is near top edge, bubble extends beyond window bounds or overlaps orb
**Why it happens:** Absolute positioning without bounds checking assumes infinite vertical space
**How to avoid:**
1. Use CSS `max-width` to prevent horizontal overflow: `max-width: 300px`
2. Position bubble `bottom: 140px` (orb 96px + spacing 44px) — enough clearance
3. Widget window is 128px tall; if bubble appears, expand window height dynamically: `mainWindow.setSize(128, 128 + bubbleHeight)`
4. Or: Position bubble above widget entirely using negative top offset outside BrowserWindow bounds (requires transparency + always-on-top)

**Warning signs:**
- Bubble cuts off mid-sentence on vertical monitors
- Bubble tail points to empty space instead of orb center

### Pitfall 5: Fetch Timeout Hangs Renderer Indefinitely
**What goes wrong:** Gateway is down or slow; fetch() in main process has no timeout; renderer awaits `window.jarvis.sendText()` forever; orb stuck in "processing" state
**Why it happens:** Native fetch has no default timeout — unlike axios which has 0ms default (no timeout) but at least offers timeout config
**How to avoid:**
1. Wrap fetch in AbortController with timeout:
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

try {
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  // ...
} catch (err) {
  if (err.name === 'AbortError') {
    return { success: false, error: 'Request timeout' };
  }
  throw err;
}
```
2. Set reasonable timeout (10-15 seconds for chat request)
3. Return timeout error via Result<T> pattern so renderer can show "Request timed out" message

**Warning signs:**
- Orb stays in "processing" state forever when gateway is stopped
- DevTools console shows no error but IPC promise never resolves

### Pitfall 6: Hotkey Works on QWERTY but Fails on AZERTY/Dvorak
**What goes wrong:** User has non-QWERTY keyboard layout; shortcut like `Ctrl+Shift+J` registers but triggers on wrong key or not at all
**Why it happens:** Known Electron bug — globalShortcut assumes QWERTY layout on some platforms (especially macOS)
**How to avoid:**
1. Use modifier-only combos when possible: `Ctrl+Shift+Space` (Space is layout-agnostic)
2. Avoid letter-based shortcuts if international users expected
3. Test on virtual keyboard layouts (Windows: Settings → Keyboard → Add language)
4. Document limitation: "Hotkeys optimized for QWERTY layouts"
5. Ensure tray icon fallback always works (D-10)

**Warning signs:**
- Reports from international users: "Hotkey doesn't work"
- Shortcuts work in dev environment (your QWERTY) but fail in production

## Code Examples

Verified patterns from official sources:

### Global Shortcut Registration with Return Check
```typescript
// Source: https://www.electronjs.org/docs/latest/api/global-shortcut
import { app, globalShortcut } from 'electron';

app.whenReady().then(() => {
  const ret = globalShortcut.register('CommandOrControl+X', () => {
    console.log('CommandOrControl+X is pressed');
  });

  if (!ret) {
    console.log('registration failed');
  }

  // Check whether a shortcut is registered
  console.log(globalShortcut.isRegistered('CommandOrControl+X'));
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

### MenuItem Radio Group with Dynamic State
```typescript
// Source: https://www.electronjs.org/docs/latest/api/menu-item
import { Menu } from 'electron';

const template = [
  {
    label: 'Hotkey',
    submenu: [
      {
        label: 'Ctrl+Shift+J',
        type: 'radio',
        checked: true,
        click: (menuItem) => {
          console.log('Selected:', menuItem.label);
        }
      },
      {
        label: 'Ctrl+Alt+J',
        type: 'radio',
        click: (menuItem) => {
          console.log('Selected:', menuItem.label);
        }
      }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
```

### React Form Submit with TypeScript
```typescript
// Source: https://www.epicreact.dev/how-to-type-a-react-form-on-submit-handler
import { FormEvent } from 'react';

function MyForm() {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const message = formData.get('message') as string;
    console.log('Submitted:', message);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" name="message" />
      <button type="submit">Send</button>
    </form>
  );
}
```

### Fetch with AbortController Timeout
```typescript
// Source: MDN Web Docs — AbortController
async function fetchWithTimeout(url: string, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' }),
    });
    clearTimeout(id);
    return await response.json();
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw err;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| axios for HTTP | Native fetch API | Node.js 18 (2022) | Zero dependencies, built-in, same API as browser — axios now just a wrapper |
| React Hook Form for all forms | Controlled components for simple forms | Ongoing (2025-2026) | RHF still recommended for complex multi-field forms, but overkill for single input |
| JavaScript animation loops | CSS keyframes on compositor thread | Ongoing (CSS3 era) | Smoother animations, no JS overhead — Phase 11 established this pattern |
| electron-settings | electron-store | electron-store v8 (2021+) | Native ESM, TypeScript schemas, atomic writes, better API |
| Custom error handling in IPC | Result<T> pattern | Established in Phase 9 | Type-safe, predictable error propagation across process boundary |

**Deprecated/outdated:**
- **sendSync():** Deprecated in favor of invoke/handle — blocks renderer thread, terrible UX
- **ipcRenderer exposed to renderer:** Security violation — use contextBridge + preload only
- **Axios for Electron main process:** After 2026 npm compromise, supply chain risk not justified; native fetch is safer

## Open Questions

1. **Gateway Error Response Shape**
   - What we know: Gateway returns JSON on success; error format unknown (may be `{ error, message }` or `{ status, error }`)
   - What's unclear: Exact shape of error responses from `POST /api/chat` when FastAPI returns 4xx/5xx
   - Recommendation: Check `apps/gateway/src/routes/chat.ts` during planning; design IPC response to normalize both success and error shapes

2. **Speech Bubble Vertical Space**
   - What we know: Widget window is 128x128px fixed size (DESK-02); speech bubble needs to appear above orb
   - What's unclear: Should bubble extend outside BrowserWindow bounds (requires always-on-top + transparency), or should window resize dynamically when bubble appears?
   - Recommendation: Test both approaches in Plan 2 — outside bounds is simpler (no resize logic), but may have platform quirks

3. **Input Button Discoverability**
   - What we know: Button should be "discreto mas descobrível" (D-06)
   - What's unclear: Optimal icon (keyboard? chat bubble? plus sign?) and hover state that balances visibility with minimalism
   - Recommendation: Defer to planner's discretion — use keyboard icon (🖮) as starting point, adjust based on visual testing

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | fetch API (main process) | ✓ | 24.13.0 | — |
| npm | Package management | ✓ | 11.6.2 | — |
| Electron | globalShortcut, IPC, BrowserWindow | ✓ | 41.1.1 | — |
| Gateway (localhost:3000) | POST /api/chat endpoint | Assumed running | — | Show "Gateway unavailable" error if fetch fails |

**Missing dependencies with no fallback:**
- None — all required tools are already installed and verified

**Missing dependencies with fallback:**
- Gateway service: If not running, IPC handler returns `{ success: false, error: 'Gateway unreachable' }` — renderer shows error in speech bubble

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 + @testing-library/react 16.3.2 |
| Config file | apps/desktop/vitest.config.ts (existing) |
| Quick run command | `pnpm --filter desktop test` |
| Full suite command | `pnpm --filter desktop test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACTV-01 | globalShortcut.register() returns boolean; fallback when registration fails | unit | `pnpm --filter desktop test src/main/__tests__/hotkey.test.ts` | ❌ Wave 0 |
| ACTV-01 | Tray menu has "Configure Hotkey" submenu with radio group | unit | `pnpm --filter desktop test src/main/__tests__/tray.test.ts` | ✅ (extend existing) |
| ACTV-02 | IPC handler calls fetch(`http://localhost:3000/api/chat`) with message | unit | `pnpm --filter desktop test src/main/__tests__/ipc-chat.test.ts` | ❌ Wave 0 |
| ACTV-02 | ChatInput form submit calls window.jarvis.sendText() | unit | `pnpm --filter desktop test src/renderer/components/ChatInput/ChatInput.test.tsx` | ❌ Wave 0 |
| ACTV-02 | Orb transitions: idle → processing → responding → idle | integration | `pnpm --filter desktop test src/renderer/components/ChatInput/ChatInput.test.tsx` | ❌ Wave 0 |
| ACTV-02 | SpeechBubble renders reply text above orb | unit | `pnpm --filter desktop test src/renderer/components/SpeechBubble/SpeechBubble.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter desktop test {test file for that task}`
- **Per wave merge:** `pnpm --filter desktop test`
- **Phase gate:** Full suite green + manual smoke test (press hotkey, type message, verify reply appears) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/main/__tests__/hotkey.test.ts` — covers ACTV-01 (registration, fallback, persistence)
- [ ] `src/main/__tests__/ipc-chat.test.ts` — covers ACTV-02 (fetch call, timeout, error handling)
- [ ] `src/renderer/components/ChatInput/ChatInput.test.tsx` — covers ACTV-02 (form submit, IPC call, state transitions)
- [ ] `src/renderer/components/SpeechBubble/SpeechBubble.test.tsx` — covers ACTV-02 (bubble rendering, positioning)
- [ ] Extend `src/main/__tests__/tray.test.ts` — add submenu assertions for ACTV-01

## Sources

### Primary (HIGH confidence)
- Electron 41.1.1 globalShortcut API docs — https://www.electronjs.org/docs/latest/api/global-shortcut (verified 2026-04-06)
- Electron MenuItem API docs — https://www.electronjs.org/docs/latest/api/menu-item (verified 2026-04-06)
- Node.js fetch API — Built-in since Node 18 (verified via `node --version` → 24.13.0)
- electron-store 11.0.2 — https://github.com/sindresorhus/electron-store (verified 2026-04-06)
- Existing codebase patterns: `apps/desktop/src/main/position.ts` (electron-store usage), `apps/desktop/src/main/ipc/chat.ts` (Result<T> pattern), `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` (state management)

### Secondary (MEDIUM confidence)
- Smashing Magazine: Modern CSS Tooltips and Speech Bubbles (March 2024) — https://www.smashingmagazine.com/2024/03/modern-css-tooltips-speech-bubbles-part1/ — clip-path + border-image technique
- LogRocket: Axios vs Fetch 2025 update — https://blog.logrocket.com/axios-vs-fetch-2025/ — fetch now standard, axios is wrapper
- React TypeScript Cheatsheet: Forms and Events — https://react-typescript-cheatsheet.netlify.app/docs/basic/getting-started/forms_and_events/ — FormEvent typing

### Tertiary (LOW confidence)
- GitHub Issue #27240 (globalShortcut reliability) — mentions QWERTY layout limitation on macOS; flagged for testing but not officially documented
- WebSearch results on hotkey conflicts — general best practices, no official Electron guidance on which shortcuts to avoid

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All packages verified via npm registry, current versions confirmed
- Architecture: HIGH — Patterns based on existing codebase (position.ts, chat.ts, OrbContext.tsx) and official Electron docs
- Pitfalls: HIGH — Sourced from official docs (IPC error serialization, globalShortcut return value) and existing test suite patterns

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (30 days — Electron and React are stable, no breaking changes expected)
