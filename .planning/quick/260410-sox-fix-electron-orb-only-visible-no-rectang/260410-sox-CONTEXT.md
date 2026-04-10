# Quick Task 260410-sox: fix electron orb only visible no rectangle transparent window - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Task Boundary

Fazer o widget Electron mostrar SOMENTE a bola de vidro flutuando no desktop — sem retângulo escuro, sem caixa de fundo. Nas zonas transparentes (fora da bola), o clique deve passar para o desktop. A janela deve encolher para caber só no orb.

</domain>

<decisions>
## Implementation Decisions

### Transparência visual
- `backgroundColor: '#00000000'` explícito no BrowserWindow (não apenas remover — no Windows 11 o default sem `backgroundColor` pode ser branco)
- `hasShadow: false` para eliminar sombra OS-level que pinta retângulo
- `html { background: transparent; }` no globals.css (o elemento `html` não tinha transparent — só `body`)

### Tamanho da janela
- Reduzir de 128×300 para 160×160 (orb 128px + 32px clearance para o glow)
- Remover o layout `justify-content: flex-end` do app-container (era para bubble de chat na janela alta)
- O chat vai precisar de abordagem diferente no futuro — fora do escopo aqui

### Click-through em áreas transparentes
- Usar `setIgnoreMouseEvents(true, { forward: true })` globalmente (inicia passando cliques pro desktop)
- IPC pattern para toggle: quando mouse entra no orb → `setIgnoreMouseEvents(false)` (captura drag), quando sai → `setIgnoreMouseEvents(true, { forward: true })`
- Arquivos: preload (expõe `setIgnoreMouseEvents`), main IPC handler, App.tsx (mouse enter/leave no container do orb)

### Claude's Discretion
- Tamanho exato do padding ao redor do orb (128px orb + margem para glow)
- Posicionamento do orb dentro da janela menor (center)
- Manter ou remover ChatInput do novo layout menor

</decisions>

<specifics>
## Specific Ideas

- BrowserWindow: `width: 160, height: 160, backgroundColor: '#00000000', hasShadow: false`
- globals.css: adicionar `html { background: transparent; overflow: hidden; }`
- App.tsx: remover `bg-slate-900` (já feito), manter `background: transparent`, orb centralizado
- preload/index.ts: expor `setIgnoreMouseEvents(ignore: boolean)` via contextBridge
- main/index.ts: `ipcMain.on('set-ignore-mouse-events', ...)` + chamar `mainWindow.setIgnoreMouseEvents(true, { forward: true })` após `ready-to-show`
- App.tsx: `onMouseEnter` → `window.jarvis.setIgnoreMouseEvents(false)`, `onMouseLeave` → `window.jarvis.setIgnoreMouseEvents(true)`

</specifics>

<canonical_refs>
## Canonical References

- Electron docs: BrowserWindow transparent — backgroundColor must be '#00000000' on Windows, not just absent
- Electron docs: setIgnoreMouseEvents(ignore, { forward: true }) — forward:true keeps mousemove flowing to renderer for hover detection
- Phase 9 DESK-01: contextIsolation:true, nodeIntegration:false são inegociáveis — qualquer IPC deve passar pelo preload

</canonical_refs>
