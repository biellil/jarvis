# Phase 10: Frameless Widget Window - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Widget aparece como janela frameless transparente always-on-top posicionada no canto inferior direito — sem flash branco no load, com tray icon operacional e posição persistente entre sessões.

</domain>

<decisions>
## Implementation Decisions

### Posicionamento Inicial
- **D-01:** Offset de 16px da borda da tela (2 × spacing-md) — breathing room confortável, alinha com grid de 8pt
- **D-02:** Monitor onde o cursor está via `screen.getCursorScreenPoint()` — mais dinâmico que primary display fixo
- **D-03:** Tamanho inicial 128x128px — orb 96px + padding 16px cada lado, compacto até Phase 12 adicionar chat input
- **D-04:** Coordenadas arredondadas com `Math.round()` — evita sub-pixel rendering blur

### Tray Icon
- **D-05:** Criar novo ícone 16x16 + 32x32 PNG — círculo azul com glow sutil (versão simplificada do Aether Orb)
- **D-06:** Single-click mostra menu contextual — padrão Windows/Linux
- **D-07:** Tooltip "JARVIS" — nome do app apenas, simples e identificativo
- **D-08:** Menu com apenas 3 items: Show, Hide, Quit — DESK-04 compliance, sem separators ou extras

### Position Persistence
- **D-09:** Salvar apenas `{ x, y }` via electron-store — tamanho é fixo (128x128) em Phase 10
- **D-10:** Salvar ao fechar app (`will-quit` event) — simples, sem overhead durante drag
- **D-11:** Validar bounds ao restaurar — se posição salva fora da tela, resetar para default (bottom-right) em vez de tentar clamp
- **D-12:** Chave electron-store: `window.position` — descritiva, retorna `{ x: number, y: number }`

### Window Dragging
- **D-13:** Orb inteiro é draggable — `-webkit-app-region: drag` no componente Orb, intuitivo (arrastar a "coisa" move a janela)
- **D-14:** Cursor `grab` / `grabbing` — feedback visual de que orb é dragável
- **D-15:** Click no orb não faz nada em Phase 10 — orb é apenas visual/draggable, interatividade vem nas Phases 11-12
- **D-16:** Threshold drag/click automático do Electron — `-webkit-app-region: drag` usa threshold interno do OS, sem JS manual

### Claude's Discretion
- Flash branco prevention: implementar `show: false` + `ready-to-show` event + `backgroundColor: '#0F172A'` (slate-900 do UI-SPEC)
- Electron-store initialization e error handling
- PNG icon generation (círculo azul #06B6D4 com glow, export 16x16 e 32x32)
- Always-on-top e skipTaskbar flag details (DESK-02 define ambos)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Window Configuration
- `.planning/REQUIREMENTS.md` §Desktop App — DESK-02 (frameless + transparent + always-on-top + skipTaskbar), DESK-03 (posicionamento), DESK-04 (tray), DESK-05 (persistence)
- `.planning/phases/09-electron-scaffold/09-UI-SPEC.md` — Design tokens (orb 96px, slate-900 background, glassmorphism), Tailwind config, spacing scale 8pt

### Electron Patterns
- `apps/desktop/src/main/index.ts` — BrowserWindow existente (Phase 9 criou com security settings), será estendido com frameless/transparent
- Phase 9 CONTEXT.md decisões D-01 a D-10 permanecem (IPC handlers, React Context API, scripts padrão)

### Multi-Monitor & DPI
- Electron `screen` module docs — `getCursorScreenPoint()`, `getPrimaryDisplay()`, `workArea` (taskbar-aware coordinates)
- DESK-03 exige DPI-aware positioning — Electron lida automaticamente com scaling, apenas usar workArea coordinates

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Main process:** `apps/desktop/src/main/index.ts` já existe com `createWindow()` — estender com frameless/transparent/tray logic
- **Orb component:** Phase 11 criará, mas Phase 10 já pode preparar container com `-webkit-app-region: drag`
- **Tailwind design tokens:** `orb` spacing (96px), `glass-bg`, `slate-900` já configurados no Phase 9

### Established Patterns
- **BrowserWindow options:** Phase 9 definiu `contextIsolation`, `nodeIntegration`, `preload` — adicionar `frame: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`
- **Ready-to-show pattern:** Evitar flash branco via `show: false` + `win.once('ready-to-show', () => win.show())`

### Integration Points
- **Tray:** `new Tray(iconPath)` + `tray.setContextMenu(Menu.buildFromTemplate([...]))` — integra com main process lifecycle
- **electron-store:** Adicionar como dep, import em main, `const store = new Store()`, `store.get('window.position')`
- **CSS dragging:** No renderer, aplicar `-webkit-app-region: drag` ao orb component (Phase 11), `-webkit-app-region: no-drag` em clickables futuros

</code_context>

<specifics>
## Specific Ideas

- "Orb inteiro é draggable" — usuário arrasta a "energia ball" para mover o widget, intuitivo
- "Monitor onde cursor está" — usuário está trabalhando em qual tela, widget aparece lá em vez de sempre no monitor principal
- "16px offset" — breathing room, não grudado na borda, alinha com spacing-md do Tailwind config
- "128x128 tamanho inicial" — compacto, apenas orb visível, chat input aparece depois (Phase 12)

</specifics>

<deferred>
## Deferred Ideas

- **Auto-hide ao perder foco:** Widget ocultar automaticamente quando usuário clica fora — comportamento para Phase 12 junto com hotkey
- **Animação de entrada:** Fade in ou slide in ao aparecer — visual polish, adicionar se Phase 11 Orb animation cobrir
- **Tray icon dinâmico:** Mudar ícone baseado em estado (idle/active) — Phase 11 implementa estados do orb, tray pode refletir depois
- **Salvar display ID:** Persistir qual monitor além de x,y — útil para multi-monitor setup, mas Phase 10 usa cursor position (D-02) que já adapta
- **Resize manual:** Permitir redimensionar janela — tamanho é fixo 128x128 em v1.2, expansão futura
- **Context menu no orb:** Right-click no orb abre menu — Phase 10 tem tray menu, orb menu seria redundante

</deferred>

---

*Phase: 10-frameless-widget-window*
*Context gathered: 2026-04-06*
