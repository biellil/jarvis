# Phase 9: Electron Scaffold - Research

**Researched:** 2026-04-06
**Domain:** Electron desktop application scaffold with security-first architecture
**Confidence:** HIGH

## Summary

Phase 9 establishes the foundational Electron application structure in the monorepo with security as the primary architectural constraint. The scaffold must implement contextIsolation + nodeIntegration: false from day one, use electron-vite for build tooling with split hot reload (renderer HMR, main/preload restart), and provide a typed IPC bridge through contextBridge. React renderer uses HashRouter for client-side navigation, Tailwind CSS v4 with the Vite plugin for styling, and follows the established monorepo conventions (@jarvis/desktop, dev/build/start scripts).

The research confirms that the user's architectural decisions (D-01 through D-10 in CONTEXT.md) align with current Electron best practices. electron-vite 5.0.0 is the current stable version providing zero-config support for TypeScript, React, and the three-entry-point architecture (main/preload/renderer). The security configuration (contextIsolation: true, nodeIntegration: false) has been Electron's default since v20 and is non-negotiable for production apps.

**Primary recommendation:** Use electron-vite's official React-TypeScript template as the structural foundation, then immediately lock down security settings, establish typed IPC patterns, and integrate with the existing monorepo structure before adding any feature code.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DESK-01 | apps/desktop scaffoldado no monorepo pnpm com electron-vite + React + TypeScript, com contextIsolation: true, nodeIntegration: false e preload.ts com contextBridge tipado | Standard Stack (electron-vite 5.0.0, Electron 41.x, React 19.x), Architecture Patterns (three entry points, typed contextBridge), Security Domain (contextIsolation enforcement) |

</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**IPC Architecture**
- **D-01:** Handlers IPC centralizados em `src/main/ipc/` organizados por feature (ex: `ipc/chat.ts` com `setupChatHandlers()`)
- **D-02:** Tipos compartilhados em `src/shared/ipc-types.ts` — interfaces Request/Response por canal, importadas pelo preload e renderer
- **D-03:** Handlers retornam Result type `{ success: boolean, data?: T, error?: string }` — nunca throw exceptions pela barreira IPC
- **D-04:** `window.jarvis.sendText('teste')` implementado como handler funcional que loga no main — prova IPC end-to-end sem integração com gateway ainda

**React Setup**
- **D-05:** React puro + react-router-dom — sem frameworks adicionais (sem Vite SPA standalone, sem TanStack)
- **D-06:** State management via Context API + useState/useReducer — built-in React suficiente para widget
- **D-07:** Componentes organizados por feature desde o início — `src/renderer/components/Orb/`, `src/renderer/components/Chat/`

**Build & Dev Workflow**
- **D-08:** Scripts package.json seguem padrão do gateway — `dev`, `build`, `start` (consistência no monorepo: `pnpm --filter desktop dev`)
- **D-09:** Hot reload split — renderer com HMR, main com restart ao mudar (padrão electron-vite)
- **D-10:** Sourcemaps inline em dev, desabilitados em prod — debug TypeScript original em dev, bundle otimizado em prod

### Claude's Discretion
- Configuração exata do electron-vite.config.ts (otimizações, aliases)
- Estrutura interna de pastas em cada feature de componente
- Naming convention para handlers IPC (sufixo Handler, prefix setup)
- Se adicionar .env reader ou usar process.env direto no main

### Deferred Ideas (OUT OF SCOPE)
- **Packaging (electron-builder):** Script `package` para gerar executável — fora do escopo da Phase 9 (scaffold apenas)
- **Testes E2E (Playwright):** Testing strategy discutido mas não selecionado — adicionar quando precisar validar flows completos
- **Zod validation no IPC:** Gateway usa Zod para validação HTTP; IPC é local e tipado — overhead desnecessário por enquanto

</user_constraints>

## Project Constraints (from CLAUDE.md)

**Monorepo conventions:**
- Package naming: `@jarvis/*` namespace (desktop será `@jarvis/desktop`)
- Scripts padrão: `dev`, `build`, `start` — já estabelecido pelo gateway
- Node 22 LTS obrigatório (package.json engines: `"node": ">=22"`)
- pnpm workspace: `apps/*` pattern já configurado em `pnpm-workspace.yaml`

**Git commit format:**
- Conventional Commits com emojis obrigatório
- NUNCA incluir `🤖 Generated with [Claude Code]` ou `Co-Authored-By: Claude`

**GSD workflow:**
- `commit_docs: true` — research deve ser commitado ao final

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.1.1 | Desktop runtime | Current stable — contextIsolation default since v20, sandbox enabled by default v20+. [VERIFIED: npm registry 2026-04-06] |
| electron-vite | 5.0.0 | Build tooling | Zero-config support for TS/React, three entry points (main/preload/renderer), split HMR. Official Electron community project. [VERIFIED: npm registry 2026-04-06] |
| react | 19.2.4 | UI framework | Current stable — useState/useReducer + Context API sufficient for widget state. [VERIFIED: npm registry 2026-04-06] |
| react-dom | 19.2.4 | React renderer | Matches react version — required peer dependency. [VERIFIED: npm registry 2026-04-06] |
| typescript | 6.0.2 | Type safety | Already used by gateway — shared version across monorepo. [VERIFIED: npm registry 2026-04-06] |
| react-router-dom | 7.14.0 | Client-side routing | HashRouter recommended for Electron (no server, file:// protocol). [VERIFIED: npm registry 2026-04-06] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tailwindcss/vite | 4.x | CSS framework | Vite plugin for Tailwind v4 — no PostCSS config needed. Use in renderer only (not main/preload). [CITED: https://tailwindcss.com/blog/tailwindcss-v4] |
| tailwindcss | 4.x | Design system | Required peer dep for @tailwindcss/vite. Provides utility classes for glassmorphism effects. [CITED: https://tailwindcss.com/docs] |
| electron-store | 11.0.2 | Persistent storage | Window position, user preferences. JSON-based, stored in app.getPath('userData'). ESM-only. [VERIFIED: npm registry 2026-04-06] |
| vite | 6.x | Dev server / bundler | electron-vite peer dependency — handles renderer HMR. Shared across monorepo. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-vite | electron-forge | Forge uses Webpack or Vite plugins — more boilerplate, less Electron-specific optimization. electron-vite is purpose-built. |
| electron-vite | vite-plugin-electron | Lower-level — requires manual config of all three entry points. electron-vite provides conventions. |
| HashRouter | MemoryRouter | MemoryRouter has no URL persistence — user can't bookmark/share routes (not needed for widget, but HashRouter is standard). |
| HashRouter | BrowserRouter | BrowserRouter fails with file:// protocol — requires server for history API. Not viable in Electron. [CITED: https://github.com/remix-run/react-router/discussions/10724] |
| Tailwind v4 | Tailwind v3 | v3 requires PostCSS config, @tailwind directives. v4 Vite plugin is simpler, faster. No breaking changes for utility classes. [CITED: https://tailwindcss.com/blog/tailwindcss-v4] |
| electron-store | electron-window-state | electron-window-state unmaintained (last update 2018). electron-store is actively maintained, ESM-native. |
| Vitest | Jest | Gateway already uses Vitest — consistency. Jest requires more config for ESM + Electron mocks. |

**Installation:**
```bash
# From monorepo root
cd apps
mkdir desktop
cd desktop

# Initialize package.json manually (not via npm init — needs custom structure)
# Then install deps
pnpm add electron electron-vite react react-dom react-router-dom electron-store
pnpm add -D typescript @types/react @types/react-dom @types/node vite tailwindcss @tailwindcss/vite
```

**Version notes:**
- Node 24.12.0 available on system — meets Node 22+ requirement [VERIFIED: bash 2026-04-06]
- pnpm 10.27.0 available [VERIFIED: bash 2026-04-06]
- Gateway uses TypeScript 6.0.2 — desktop should match [VERIFIED: apps/gateway/package.json]
- Electron 41.x is stable channel as of April 2026 — no beta flags needed

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop/
├── src/
│   ├── main/
│   │   ├── index.ts              # BrowserWindow creation, app lifecycle
│   │   ├── ipc/
│   │   │   ├── index.ts          # Aggregates all IPC handlers
│   │   │   └── chat.ts           # setupChatHandlers() — D-01
│   │   └── tray.ts               # System tray (Phase 10)
│   ├── preload/
│   │   └── index.ts              # contextBridge.exposeInMainWorld('jarvis', ...)
│   ├── renderer/
│   │   ├── src/
│   │   │   ├── main.tsx          # React.createRoot + HashRouter
│   │   │   ├── App.tsx           # Root component
│   │   │   ├── components/
│   │   │   │   ├── Orb/          # D-07 — feature organization
│   │   │   │   │   ├── Orb.tsx
│   │   │   │   │   └── OrbContext.tsx
│   │   │   │   └── Chat/
│   │   │   │       └── ChatInput.tsx
│   │   │   └── styles/
│   │   │       └── globals.css   # @import "tailwindcss"
│   │   └── index.html            # Entry point for renderer
│   └── shared/
│       └── ipc-types.ts          # D-02 — Request/Response interfaces
├── electron.vite.config.ts       # Build config
├── package.json
├── tsconfig.json
├── tsconfig.node.json            # For electron.vite.config.ts
└── tailwind.config.ts            # Design tokens from UI-SPEC.md
```

**Why this structure:**
- `src/main/`, `src/preload/`, `src/renderer/` — electron-vite convention, auto-detected entry points [CITED: https://electron-vite.org/guide/dev]
- `src/shared/` — types imported by all three processes (main, preload, renderer)
- `src/main/ipc/` — D-01 decision, centralizes IPC handlers by feature
- `src/renderer/src/components/` — D-07 decision, feature-based organization from start

### Pattern 1: Typed ContextBridge API

**What:** Expose IPC methods to renderer via `contextBridge.exposeInMainWorld`, with global Window interface augmentation for TypeScript autocomplete.

**When to use:** Every IPC method exposed to renderer must go through this pattern — never expose `ipcRenderer` directly (security violation).

**Example:**
```typescript
// src/shared/ipc-types.ts — D-02
export interface SendTextRequest {
  message: string;
}

export interface SendTextResponse {
  success: boolean;
  data?: { received: string };
  error?: string;
}

export interface JarvisAPI {
  sendText: (message: string) => Promise<SendTextResponse>;
}

// Augment global Window interface
declare global {
  interface Window {
    jarvis: JarvisAPI;
  }
}
```

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { JarvisAPI, SendTextResponse } from '../shared/ipc-types';

const api: JarvisAPI = {
  sendText: (message: string) => ipcRenderer.invoke('chat:send-text', message),
};

contextBridge.exposeInMainWorld('jarvis', api);
```

```typescript
// src/main/ipc/chat.ts — D-01 + D-03
import { ipcMain } from 'electron';
import type { SendTextRequest, SendTextResponse } from '../../shared/ipc-types';

export function setupChatHandlers() {
  ipcMain.handle('chat:send-text', async (_event, message: string): Promise<SendTextResponse> => {
    try {
      // D-04 — functional handler that logs
      console.log('[IPC] Received text:', message);
      return {
        success: true,
        data: { received: message },
      };
    } catch (err) {
      // D-03 — never throw, return Result type
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  });
}
```

```typescript
// src/main/ipc/index.ts
import { setupChatHandlers } from './chat';

export function setupIpcHandlers() {
  setupChatHandlers();
  // Future: setupOrbHandlers(), setupAudioHandlers(), etc.
}
```

```typescript
// src/renderer/src/App.tsx
function App() {
  const handleSend = async () => {
    // TypeScript knows window.jarvis.sendText exists and its signature
    const result = await window.jarvis.sendText('teste');
    if (result.success) {
      console.log('Received:', result.data?.received);
    } else {
      console.error('Error:', result.error);
    }
  };

  return <button onClick={handleSend}>Send Test</button>;
}
```

**Source:** [Electron Context Isolation Tutorial](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — TypeScript augmentation pattern, [electron-vite Development Guide](https://electron-vite.org/guide/dev) — preload auto-reload on change

### Pattern 2: Security-First BrowserWindow Configuration

**What:** Create BrowserWindow with hardened security settings — contextIsolation: true, nodeIntegration: false, sandbox: true (default in v20+), webSecurity: true.

**When to use:** Every BrowserWindow creation. These settings must be explicit in code even though some are defaults — self-documenting security posture.

**Example:**
```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { setupIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Prevent white flash — show after 'ready-to-show'
    backgroundColor: '#0F172A', // Match UI-SPEC slate-900 — prevents flash
    webPreferences: {
      // Security hardening — CRITICAL, non-negotiable
      contextIsolation: true,      // Isolate preload from renderer context
      nodeIntegration: false,      // Renderer cannot access Node.js APIs
      sandbox: true,               // Renderer in OS-level sandbox (default v20+)
      webSecurity: true,           // Enforce same-origin policy
      allowRunningInsecureContent: false, // Block mixed content

      // Preload script — the ONLY bridge between main and renderer
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  // Load renderer
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    // Development — HMR via Vite dev server
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    mainWindow.webContents.openDevTools(); // Auto-open DevTools in dev
  } else {
    // Production — load bundled index.html
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready — prevents white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  setupIpcHandlers(); // Register before window creation
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

**Source:** [Electron Security Documentation](https://www.electronjs.org/docs/latest/tutorial/security) — contextIsolation + nodeIntegration: false mandatory, [Context Isolation GitHub Issue #23506](https://github.com/electron/electron/issues/23506) — contextIsolation became default in v12, later v20

### Pattern 3: electron-vite Configuration with Split Entry Points

**What:** Configure electron-vite to build three separate bundles (main, preload, renderer) with appropriate target environments and optimizations.

**When to use:** Root of apps/desktop — required for electron-vite to work correctly.

**Example:**
```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()], // Don't bundle node_modules in main
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/main/index.ts'),
        },
      },
      sourcemap: process.env.NODE_ENV === 'development', // D-10
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/preload/index.ts'),
        },
      },
      sourcemap: process.env.NODE_ENV === 'development', // D-10
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [
      react(), // JSX transform, Fast Refresh
      tailwindcss(), // Tailwind v4 Vite plugin — D-05 UI framework
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer/src'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      outDir: 'dist/renderer',
      sourcemap: process.env.NODE_ENV === 'development', // D-10
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
```

**Why this config:**
- `externalizeDepsPlugin()` — Don't bundle node_modules in main/preload (native modules can't be bundled) [CITED: https://electron-vite.org/guide/dev]
- `renderer.root: 'src/renderer'` — electron-vite serves this directory in dev, builds from index.html
- Sourcemaps conditional on NODE_ENV — D-10 decision
- Aliases `@` and `@shared` — TypeScript path mapping for cleaner imports

**Source:** [electron-vite Getting Started](https://electron-vite.org/guide/) — default config structure, [electron-vite HMR Guide](https://electron-vite.org/guide/hmr-and-hot-reloading) — renderer HMR automatic, main/preload restart with --watch

### Pattern 4: HashRouter for Electron Client-Side Routing

**What:** Use `HashRouter` from react-router-dom instead of `BrowserRouter` — works with `file://` protocol, no server required.

**When to use:** React app root in Electron renderer. BrowserRouter requires HTTP server for history API — not available in Electron's file:// context.

**Example:**
```typescript
// src/renderer/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom'; // NOT BrowserRouter
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
```

```typescript
// src/renderer/src/App.tsx
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<MainView />} />
        {/* Future routes if needed */}
      </Routes>
    </div>
  );
}

function MainView() {
  return <div>Hello JARVIS</div>;
}

export default App;
```

**Why HashRouter:**
- BrowserRouter uses HTML5 History API — requires server-side routing support [CITED: https://github.com/remix-run/react-router/discussions/10724]
- Electron loads `file:///path/to/index.html` — no server, History API pushState fails
- HashRouter uses URL hash (`#/`) — fully client-side, no server interaction [CITED: https://medium.com/@biplavmazumdar5/routing-in-react-hashrouter-with-electron-js-48469a698f24]
- Alternative is MemoryRouter — no URL persistence, less conventional

**Source:** [React Router Electron Discussion](https://github.com/remix-run/react-router/discussions/10724) — BrowserRouter incompatible with file://, [Routing in React with Electron](https://medium.com/@biplavmazumdar5/routing-in-react-hashrouter-with-electron-js-48469a698f24) — HashRouter recommended

### Pattern 5: Tailwind CSS v4 with Vite Plugin (No PostCSS)

**What:** Use `@tailwindcss/vite` plugin for Tailwind v4 — simpler than v3's PostCSS setup, CSS-first configuration.

**When to use:** Renderer styling only (Tailwind has no effect in main/preload processes).

**Example:**
```typescript
// electron.vite.config.ts (renderer section)
renderer: {
  plugins: [
    react(),
    tailwindcss(), // No config needed — uses tailwind.config.ts automatically
  ],
  // ...
}
```

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // From UI-SPEC.md — state colors
        'orb-idle': '#06B6D4',      // cyan-500
        'orb-listen': '#F59E0B',    // amber-500
        'orb-process': '#8B5CF6',   // violet-500
        'orb-respond': '#3B82F6',   // blue-500
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      spacing: {
        'orb': '96px', // 12 × 8px grid
      },
      backdropBlur: {
        'glass': '12px',
      },
      borderRadius: {
        'glass': '16px',
      },
      boxShadow: {
        'glass': '0 4px 24px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'orb-idle': '0 0 24px rgba(6, 182, 212, 0.6), 0 0 48px rgba(6, 182, 212, 0.4)',
      },
      // Animation keyframes from UI-SPEC.md (Phases 11-13, not Phase 9)
    },
  },
} satisfies Config;
```

```css
/* src/renderer/src/styles/globals.css */
@import "tailwindcss";

/* Global styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

**Why Tailwind v4 Vite plugin:**
- v3 requires `postcss.config.js` + `@tailwind` directives — extra config [CITED: https://v3.tailwindcss.com/docs/installation/using-postcss]
- v4 uses CSS `@import "tailwindcss"` — simpler, faster [CITED: https://tailwindcss.com/blog/tailwindcss-v4]
- Vite plugin integrates natively — no PostCSS layer needed [CITED: https://iifx.dev/en/articles/457403541/fast-track-your-desktop-apps-a-guide-to-electron-vite-and-tailwind-v4]
- No breaking changes to utility class names — drop-in replacement

**Caveat:** Tailwind only works in renderer — main and preload are Node.js processes with no DOM [CITED: https://blog.saeloun.com/2023/02/24/integrate-tailwind-css-with-electron/]

**Source:** [Tailwind CSS v4 Announcement](https://tailwindcss.com/blog/tailwindcss-v4) — Vite plugin first-party support, [Fast-Track Electron-vite and Tailwind v4](https://iifx.dev/en/articles/457403541/fast-track-your-desktop-apps-a-guide-to-electron-vite-and-tailwind-v4) — specific to Electron + Vite

### Anti-Patterns to Avoid

- **Exposing ipcRenderer directly:** `contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer)` is a security footgun — any code can send any message. Wrap specific methods instead. [CITED: https://www.electronjs.org/docs/latest/api/context-bridge]
- **Disabling contextIsolation:** Even with nodeIntegration: false, contextIsolation must be true. nodeIntegration alone is bypassable. [CITED: https://github.com/electron/electron/issues/23506]
- **Loading remote content with Node.js access:** If renderer loads external URLs, Node.js access (even via preload) becomes RCE vulnerability. [CITED: https://www.electronjs.org/docs/latest/tutorial/security]
- **Using BrowserRouter in Electron:** Fails with file:// protocol. Use HashRouter or MemoryRouter. [CITED: https://github.com/remix-run/react-router/discussions/10724]
- **Bundling native modules:** electron-vite's `externalizeDepsPlugin()` prevents this — native modules must be external. [CITED: https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules]
- **Not setting `show: false` + `ready-to-show`:** Causes white flash on startup even with backgroundColor set. [CITED: https://github.com/electron/electron/issues/861]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vite + Electron integration | Custom Vite config with separate builds for main/preload/renderer | electron-vite | Three entry points need different targets (Node for main/preload, browser for renderer), HMR for renderer only, rebuild+restart logic for main/preload. electron-vite handles this out-of-the-box with zero config. |
| TypeScript + preload bridge | Manual type declaration files, duplicate interfaces | shared/ipc-types.ts + global Window augmentation | Type definitions must be shared between preload (exports) and renderer (imports). Duplication causes drift. Single source of truth in shared/ keeps them in sync. |
| Window position persistence | Manual localStorage or file writes | electron-store | Cross-platform JSON storage with atomic writes, app.getPath('userData') auto-detection, schema validation. Rolling this custom risks data loss on crashes. |
| React HMR in Electron | Manual WebSocket server + reload logic | electron-vite with @vitejs/plugin-react | Vite's HMR protocol requires dev server URL injection, React Fast Refresh needs Babel plugin. electron-vite integrates both automatically. |
| IPC error handling | Try/catch in every handler, throw across IPC boundary | Result type pattern (success/error tuple) | Exceptions don't serialize across IPC cleanly — can lose stack traces or crash main process. Result type makes errors explicit and serializable. |

**Key insight:** Electron development is fundamentally a monorepo of three different targets (Node.js main, Node.js preload, browser renderer). Tools that unify the build pipeline (electron-vite), enforce security boundaries (contextBridge), and bridge the process gap (IPC with typed contracts) are not boilerplate — they're load-bearing architecture that prevents entire classes of bugs.

## Runtime State Inventory

> Phase 9 is greenfield scaffold — no runtime state to inventory. This section is included for completeness and to document the explicit verification that no state exists prior to Phase 9.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by `find apps/desktop 2>/dev/null` returning no directory | N/A — no desktop app exists yet |
| Live service config | None — Electron app not deployed, no external service dependencies | N/A |
| OS-registered state | None — no system tray, no global hotkeys, no autostart registry entries before scaffold | N/A |
| Secrets/env vars | None — Phase 9 scaffold does not read secrets (gateway URL will be added in Phase 12) | N/A |
| Build artifacts | None — `node_modules/`, `dist/` will be generated on first build, gitignored immediately | N/A |

**Verification:** `ls -la apps/ | grep desktop` returned no match — apps/desktop does not exist prior to this phase. [VERIFIED: bash 2026-04-06]

## Common Pitfalls

### Pitfall 1: White Flash on Window Load

**What goes wrong:** Window shows white background briefly before renderer loads, even if renderer has dark background.

**Why it happens:** BrowserWindow default background is white. Even with `backgroundColor` set, window shows immediately before renderer paints if `show: true` in constructor.

**How to avoid:**
```typescript
const win = new BrowserWindow({
  show: false,               // Don't show until ready
  backgroundColor: '#0F172A', // Match app background (slate-900 from UI-SPEC)
  // ...
});

win.once('ready-to-show', () => {
  win.show(); // Now show — renderer has painted
});
```

**Warning signs:** Visible white flash when launching app, especially on dark-themed UIs.

**Source:** [Electron GitHub Issue #861](https://github.com/electron/electron/issues/861) — default background color discussion, [Making Electron apps feel native on Mac](https://dev.to/vadimdemedes/making-electron-apps-feel-native-on-mac-52e8) — ready-to-show pattern

### Pitfall 2: DevTools Breaks Transparent Windows

**What goes wrong:** Window with `transparent: true` loses transparency when DevTools is opened.

**Why it happens:** DevTools UI requires opaque rendering — Electron forces transparency off when DevTools is active.

**How to avoid:** Don't rely on transparent windows in development if DevTools is open. Phase 10 will need transparent: true for frameless widget — test with DevTools closed, or use console.log() instead of visual inspection during dev.

**Warning signs:** Window becomes opaque when DevTools opens, even though transparent: true is set.

**Source:** [Electron Custom Window Styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles) — DevTools transparency caveat

### Pitfall 3: BrowserRouter Fails with file:// Protocol

**What goes wrong:** React Router's `<BrowserRouter>` causes blank page or navigation errors in Electron.

**Why it happens:** BrowserRouter uses HTML5 History API (pushState). Electron loads renderer from `file:///path/to/index.html` — no server, pushState can't manipulate file:// URLs.

**How to avoid:** Use `<HashRouter>` instead — uses URL hash (`#/route`) which works client-side without server. MemoryRouter is alternative if you don't want hash in URL.

**Warning signs:** Routes render initially but break on navigation, or entire app is blank with BrowserRouter.

**Source:** [React Router Electron Discussion #10724](https://github.com/remix-run/react-router/discussions/10724) — BrowserRouter incompatibility confirmed

### Pitfall 4: Exposing ipcRenderer Directly to Renderer

**What goes wrong:** Security vulnerability — renderer can send arbitrary IPC messages, bypass intended API.

**Why it happens:** Developer exposes `ipcRenderer` via `contextBridge.exposeInMainWorld('ipc', ipcRenderer)` for convenience.

**How to avoid:** Only expose whitelisted methods through contextBridge:
```typescript
// BAD — security footgun
contextBridge.exposeInMainWorld('ipc', ipcRenderer);

// GOOD — explicit API surface
contextBridge.exposeInMainWorld('jarvis', {
  sendText: (msg: string) => ipcRenderer.invoke('chat:send-text', msg),
});
```

**Warning signs:** Renderer code calling `window.ipc.send()` with arbitrary channel names. Security audit tools (e.g., DeepSource) flag this as JS-S1020 violation.

**Source:** [Electron Context Bridge Docs](https://www.electronjs.org/docs/latest/api/context-bridge) — security best practices, [Electron IPC Best Practices](https://myray.app/blog/ipc-in-electron) — whitelist pattern

### Pitfall 5: Native Node Modules Not Rebuilt for Electron

**What goes wrong:** Native modules (e.g., SQLite, native keyboard hooks) crash with "module not found" or ABI mismatch errors.

**Why it happens:** Native modules compile against Node.js ABI. Electron uses different ABI (Chromium + Node.js hybrid). Modules from `npm install` are built for system Node, not Electron.

**How to avoid:** Use `@electron/rebuild` to recompile native modules after install:
```bash
pnpm add @electron/rebuild -D
# After installing native deps:
pnpm exec electron-rebuild
```

**Warning signs:** Error like "The module was compiled against a different Node.js version" or "Cannot find module" for native dependencies.

**Source:** [Electron Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) — official rebuild guide, [Electron React Boilerplate Native Modules](https://electron-react-boilerplate.js.org/docs/native-modules) — don't bundle natives with webpack

### Pitfall 6: Tailwind Classes Not Applied in Renderer

**What goes wrong:** Tailwind utility classes have no effect, elements render unstyled.

**Why it happens:** Tailwind's `content` glob doesn't match renderer file paths, or `@import "tailwindcss"` is missing from CSS.

**How to avoid:**
```typescript
// tailwind.config.ts
content: [
  './src/renderer/index.html',
  './src/renderer/src/**/*.{js,ts,jsx,tsx}', // Must match actual file structure
],
```

```css
/* src/renderer/src/styles/globals.css */
@import "tailwindcss"; /* Required for v4 — not @tailwind directives */
```

**Warning signs:** Utility classes like `bg-slate-900` or `flex` don't apply styles. Elements have no computed styles in DevTools.

**Source:** [Tailwind CSS Vite Guide](https://tailwindcss.com/docs) — content paths, [Integrating Tailwind CSS with Electron](https://blog.saeloun.com/2023/02/24/integrate-tailwind-css-with-electron/) — content glob must include renderer

## Code Examples

Verified patterns from official sources:

### IPC Handler with Result Type Pattern (D-03)
```typescript
// src/main/ipc/chat.ts
import { ipcMain } from 'electron';
import type { SendTextResponse } from '../../shared/ipc-types';

export function setupChatHandlers() {
  ipcMain.handle('chat:send-text', async (_event, message: string): Promise<SendTextResponse> => {
    try {
      console.log('[IPC] Received text:', message);
      return {
        success: true,
        data: { received: message },
      };
    } catch (err) {
      // Never throw — return error in Result type
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  });
}
```
**Source:** Pattern derived from [Type-safe IPC in Electron](https://heckmann.app/en/blog/electron-ipc-architecture/) — Result type prevents IPC exceptions, [Clean IPC in Electron](https://foxypanda.me/clean-interprocess-communication-in-electorn/) — domain organization

### Typed Preload Bridge (D-02)
```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { JarvisAPI } from '../shared/ipc-types';

const api: JarvisAPI = {
  sendText: (message: string) => ipcRenderer.invoke('chat:send-text', message),
};

contextBridge.exposeInMainWorld('jarvis', api);
```

```typescript
// src/shared/ipc-types.ts
export interface JarvisAPI {
  sendText: (message: string) => Promise<SendTextResponse>;
}

declare global {
  interface Window {
    jarvis: JarvisAPI;
  }
}
```
**Source:** [Electron Context Isolation Tutorial](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — TypeScript augmentation pattern, [electron-typescript-ipc npm package](https://www.npmjs.com/package/electron-typescript-ipc) — type-safe IPC library (inspiration, not used)

### electron-vite Dev Script with HMR + Watch (D-09)
```json
{
  "scripts": {
    "dev": "electron-vite dev --watch",
    "build": "electron-vite build",
    "start": "electron-vite preview"
  }
}
```

**What happens:**
- `dev --watch` — Vite dev server for renderer (HMR), file watcher for main/preload (rebuild + restart Electron)
- Renderer: Changes to .tsx files trigger Fast Refresh (state preserved)
- Main/Preload: Changes trigger rebuild + app restart (state lost)

**Source:** [electron-vite HMR and Hot Reloading](https://electron-vite.org/guide/hmr-and-hot-reloading) — --watch flag enables main/preload hot reload

### Monorepo Package.json Structure (D-08)
```json
{
  "name": "@jarvis/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev --watch",
    "build": "electron-vite build",
    "start": "electron-vite preview"
  },
  "dependencies": {
    "electron-store": "^11.0.2",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router-dom": "^7.14.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^41.1.1",
    "electron-vite": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^6.0.2",
    "vite": "^6.0.0"
  }
}
```

**Source:** apps/gateway/package.json structure (established pattern), [electron-vite Getting Started](https://electron-vite.org/guide/) — recommended scripts

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Webpack + electron-builder | Vite + electron-vite | 2022-2023 | Vite's dev server is 10-100x faster than Webpack for HMR. electron-vite adds zero-config Electron support. |
| Spectron (E2E testing) | Playwright | 2022 | Spectron unmaintained since 2021. Playwright has first-class Electron support via CDP. [CITED: https://www.electronjs.org/docs/latest/tutorial/automated-testing] |
| contextIsolation: false (legacy) | contextIsolation: true (default) | Electron v12 (2021), enforced v20 (2022) | nodeIntegration: false alone is insufficient — contextIsolation closes bypass vectors. [CITED: https://github.com/electron/electron/issues/23506] |
| Tailwind v3 with PostCSS | Tailwind v4 with Vite plugin | December 2024 | v4 eliminates PostCSS config, uses CSS imports, 10x faster JIT. [CITED: https://tailwindcss.com/blog/tailwindcss-v4] |
| electron-window-state | electron-store | 2020-2023 | electron-window-state unmaintained (last update 2018), no ESM support. electron-store is actively maintained, ESM-first. |

**Deprecated/outdated:**
- **electron-forge with Webpack template:** Webpack is viable but slower. electron-vite + Vite is current best practice for new projects.
- **AgentExecutor / initialize_agent():** Irrelevant to Electron (LangChain Python), but noted from PROJECT.md — avoid in Python core.
- **Tailwind @tailwind directives in v4:** v4 uses `@import "tailwindcss"` — old directives still work but deprecated.

## Validation Architecture

> Validation section included per config.json `workflow.nyquist_validation: true`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (same as gateway) |
| Config file | `vitest.config.ts` — Wave 0 task |
| Quick run command | `pnpm test --run` |
| Full suite command | `pnpm test --run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DESK-01 (contextIsolation) | BrowserWindow.webPreferences.contextIsolation === true | unit | `pnpm test src/main/__tests__/window.test.ts -t "security settings" --run` | ❌ Wave 0 |
| DESK-01 (nodeIntegration) | BrowserWindow.webPreferences.nodeIntegration === false | unit | `pnpm test src/main/__tests__/window.test.ts -t "security settings" --run` | ❌ Wave 0 |
| DESK-01 (preload bridge) | window.jarvis.sendText() exists and is callable from renderer | integration | `pnpm test src/preload/__tests__/bridge.test.ts --run` | ❌ Wave 0 |
| DESK-01 (IPC handler) | IPC handler 'chat:send-text' receives message and returns Result type | unit | `pnpm test src/main/ipc/__tests__/chat.test.ts --run` | ❌ Wave 0 |
| DESK-01 (three entry points) | dist/main/, dist/preload/, dist/renderer/ exist after build | smoke | `pnpm test __tests__/build.test.ts --run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test --run` (all unit tests, < 5 seconds)
- **Per wave merge:** `pnpm test --run` (same — no E2E in Phase 9, Playwright deferred)
- **Phase gate:** Full suite green + manual smoke test (launch Electron, verify DevTools shows no console errors)

### Wave 0 Gaps
- [ ] `vitest.config.ts` — mirrors gateway config, targets Node 22
- [ ] `src/main/__tests__/window.test.ts` — security settings assertions (mock BrowserWindow)
- [ ] `src/preload/__tests__/bridge.test.ts` — contextBridge API surface test (mock contextBridge)
- [ ] `src/main/ipc/__tests__/chat.test.ts` — IPC handler unit test (mock ipcMain.handle)
- [ ] `__tests__/build.test.ts` — smoke test that electron-vite build produces expected dist/ structure
- [ ] `__tests__/helpers.ts` — shared mocks for Electron APIs (BrowserWindow, ipcMain, contextBridge)

**Testing strategy notes:**
- Unit tests mock Electron APIs — no full Electron process launch (fast, deterministic)
- E2E with Playwright deferred to Phase 12 (text chat) or Phase 13 (full flow with audio)
- Manual smoke test gates Phase 9 verification: launch app, check DevTools for errors, call `window.jarvis.sendText('test')` in console
- Gateway uses Vitest with `test/` directory convention — desktop follows same pattern

## Security Domain

> Security section included per config.json `security_enforcement` default (absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | Desktop app has no user accounts in Phase 9 (local-only, single-user) |
| V3 Session Management | No | No sessions — stateless widget, no login/logout |
| V4 Access Control | No | No multi-user access — app runs with OS user's privileges |
| V5 Input Validation | Yes | IPC message validation via TypeScript interfaces + runtime checks in handlers |
| V6 Cryptography | No | No sensitive data storage in Phase 9 (window position only, non-sensitive) |
| V7 Error Handling | Yes | Result type pattern (D-03) — errors never thrown across IPC boundary |
| V8 Data Protection | Yes | electron-store uses app.getPath('userData') — OS-protected directory, user-specific |
| V9 Communication Security | No | No network communication in Phase 9 (gateway integration in Phase 12) |
| V10 Malicious Code | Yes | contextIsolation + nodeIntegration: false — renderer cannot execute arbitrary Node.js code |
| V14 Configuration | Yes | Explicit security settings in BrowserWindow — not relying on defaults |

### Known Threat Patterns for Electron

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Remote Code Execution via renderer compromise | Tampering / Elevation of Privilege | contextIsolation: true + nodeIntegration: false — renderer cannot access Node.js APIs even if XSSed |
| IPC message injection | Tampering | TypeScript interfaces + whitelist pattern — only known channels handled, typed payloads |
| Preload script bypass | Elevation of Privilege | contextBridge with explicit API surface — ipcRenderer not exposed directly |
| Native module ABI mismatch | Denial of Service | @electron/rebuild — recompile natives for Electron's Node version |
| Dependency supply chain attack | Tampering | npm audit on install, lock versions in package.json, use well-maintained packages (electron, react) |
| Insecure defaults | Information Disclosure | Explicit security settings in code — self-documenting, not relying on framework defaults |

**Threat model notes:**
- Phase 9 has no external inputs (no network, no file opens, no WebRTC) — attack surface is minimal
- Primary risk is architectural: incorrect security settings that become load-bearing in later phases
- Secondary risk is dependency compromise (electron, react) — mitigated by using official npm packages with high download counts
- Renderer XSS is not a concern yet (no user-generated HTML in Phase 9) — becomes relevant in Phase 12 (text chat)

**Security gates for Wave 0:**
- [ ] `contextIsolation: true` asserted in window.test.ts
- [ ] `nodeIntegration: false` asserted in window.test.ts
- [ ] `sandbox: true` (default, but asserted)
- [ ] `window.jarvis` API surface documented in ipc-types.ts — no `window.ipc` or `window.require` exposed
- [ ] IPC handler only accepts known channels (whitelist in ipc/index.ts)

## Environment Availability

> Phase 9 depends on Node.js runtime, pnpm package manager, and npm registry access. No external services required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | electron-vite build, runtime | ✓ | 24.12.0 (exceeds requirement: Node 22+) | — |
| pnpm | Monorepo package manager | ✓ | 10.27.0 | npm (slower, no workspace support) |
| npm registry | Package downloads | ✓ | npm 11.6.2 CLI (registry accessible) | — |
| Electron | Desktop runtime | ✗ (not yet installed) | 41.1.1 available | — |

**Missing dependencies with no fallback:**
- None — all required tools available on system. Electron will be installed via `pnpm add electron` in Wave 1.

**Missing dependencies with fallback:**
- None applicable.

**System verification:** [VERIFIED: bash 2026-04-06]
```bash
node --version    # v24.12.0
pnpm --version    # 10.27.0
npm --version     # 11.6.2
```

**Network verification:** npm registry reachable (verified by `npm view electron version` returning 41.1.1).

## Sources

### Primary (HIGH confidence)
- [npm registry] — electron 41.1.1, electron-vite 5.0.0, react 19.2.4, react-dom 19.2.4, typescript 6.0.2, electron-store 11.0.2, react-router-dom 7.14.0 (verified 2026-04-06)
- [Electron Security Documentation](https://www.electronjs.org/docs/latest/tutorial/security) — contextIsolation + nodeIntegration: false mandatory
- [Electron Context Isolation Tutorial](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — TypeScript augmentation pattern for contextBridge
- [electron-vite Official Docs](https://electron-vite.org/guide/) — zero-config React/TS support, three entry points
- [electron-vite HMR Guide](https://electron-vite.org/guide/hmr-and-hot-reloading) — renderer HMR automatic, main/preload restart with --watch
- [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window) — security settings, show: false pattern
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs) — Vite plugin, @import syntax

### Secondary (MEDIUM confidence)
- [Electron GitHub Issue #23506](https://github.com/electron/electron/issues/23506) — contextIsolation history and rationale
- [React Router Electron Discussion #10724](https://github.com/remix-run/react-router/discussions/10724) — BrowserRouter incompatibility with file://
- [Routing in React with Electron (Medium)](https://medium.com/@biplavmazumdar5/routing-in-react-hashrouter-with-electron-js-48469a698f24) — HashRouter recommended
- [Fast-Track Electron-vite and Tailwind v4](https://iifx.dev/en/articles/457403541/fast-track-your-desktop-apps-a-guide-to-electron-vite-and-tailwind-v4) — specific integration guide
- [Integrating Tailwind CSS with Electron (Saeloun Blog)](https://blog.saeloun.com/2023/02/24/integrate-tailwind-css-with-electron/) — renderer-only caveat
- [Type-safe IPC in Electron (Michael Heckmann)](https://heckmann.app/en/blog/electron-ipc-architecture/) — Result type pattern inspiration
- [Clean IPC in Electron (Foxy Panda)](https://foxypanda.me/clean-interprocess-communication-in-electorn/) — domain organization
- [Testing Electron Apps with Playwright (Kubeshop)](https://medium.com/kubeshop-i/testing-electron-apps-with-playwright-kubeshop-839ff27cf376) — Playwright as Spectron replacement
- [Electron Automated Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing) — official Playwright guidance
- [electron-win-state npm package](https://www.npmjs.com/package/electron-win-state) — TypeScript-friendly window state persistence

### Tertiary (LOW confidence)
- None — all claims verified with official docs or npm registry

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry 2026-04-06, official docs confirm compatibility
- Architecture: HIGH — electron-vite is official Electron community project, patterns from official Electron docs
- Pitfalls: HIGH — sourced from official GitHub issues, Electron docs, and developer blogs with reproducible examples
- Security: HIGH — contextIsolation + nodeIntegration: false are documented Electron security requirements since v20
- Testing: MEDIUM — Vitest unit tests feasible (gateway precedent), Playwright E2E deferred (no official Electron+Playwright scaffold yet)

**Research date:** 2026-04-06
**Valid until:** 60 days (Electron stable channel releases every ~8 weeks, but v41.x series stable through mid-2026. Stack is mature, low churn risk.)
