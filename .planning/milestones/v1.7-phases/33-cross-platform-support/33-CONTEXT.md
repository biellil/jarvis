# Phase 33: Cross-Platform Support - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Fazer o JARVIS (orb + tray + wake word) funcionar no macOS e Linux sem regressões no Windows. Não inclui Settings UI (Phase 34) nem otimizações de performance.

Success criteria:
- macOS: orb frameless transparente aparece corretamente, tray na menu bar com Settings/Quit, wake word dispara pipeline completo
- Linux (X11): idem macOS para orb e tray, wake word funcional
- Windows: sem regressões no comportamento atual

</domain>

<decisions>
## Implementation Decisions

### macOS Dock + Window Behavior
- **D-01:** `app.dock.hide()` no startup — JARVIS vive exclusivamente na menu bar, sem aparecer no Dock. Comportamento consistente com Windows (`skipTaskbar: true`).
- **D-02:** App continua rodando quando todas as janelas fecham no macOS — comportamento já implementado via `window-all-closed` ignorando `darwin`. Preservar sem mudança.
- **D-03:** `app.on('activate')` já implementado para recriar a janela ao clicar no Dock — mantém comportamento padrão macOS mesmo com Dock oculto (funciona via menu bar).

### Whisper Native Bindings — Mac + Linux
- **D-04:** Adicionar prebuilts de todas as plataformas ao `electron-builder.yml`:
  - `@fugood/node-whisper-darwin-arm64` (Apple Silicon — Metal GPU)
  - `@fugood/node-whisper-darwin-x64` (Intel Mac)
  - `@fugood/node-whisper-linux-x64` (Linux — CUDA/Vulkan/CPU)
- **D-05:** `USE_WHISPER_CPP` permanece opt-in por `.env` — o feature flag não muda. Apenas os binários ficam disponíveis no pacote para quem ativar.
- **D-06:** Verificar no `@fugood/whisper.node` quais são os package names exatos das plataformas (`@fugood/node-whisper-darwin-arm64`, `@fugood/node-whisper-linux-x64` etc.) antes de wiring no electron-builder.yml.

### Tray Icon
- **D-07:** Tray icon permanece PNG colorido para esta fase — não foi solicitado redesign. macOS aceita PNG colorido na menu bar (fica colorido, não template). Pode ser revisado no v1.8 se parecer fora do padrão macOS.

### Linux Transparency
- **D-08:** Transparência requer compositor no Linux (X11 com Compton/Picom, Kwin, etc.). Sem compositor, a janela mostra fundo preto. Aceitar como limitação — documentar no README que Linux requer compositor habilitado. Sem fallback de código.

### Claude's Discretion
- Ordem exata de chamadas de inicialização no `app.whenReady()` para mac vs linux
- Tratamento de permissão de microfone no Linux (geralmente não precisa de handler explícito, mas confirmar)
- Se `vibrancy` ou `visualEffectState` do macOS devem ser usados na janela frameless (provavelmente não — interfere com o design do orb)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Electron Main Process — arquivos que serão modificados
- `apps/desktop/src/main/index.ts` — ponto principal de inicialização, BrowserWindow config, app lifecycle
- `apps/desktop/src/main/tray.ts` — tray icon + menu (DESK-04)
- `apps/desktop/src/main/position.ts` — posicionamento da janela (DESK-03, DESK-05)
- `apps/desktop/src/main/hotkey.ts` — globalShortcut (ACTV-01)

### Packaging + Build
- `apps/desktop/electron-builder.yml` — targets mac/linux já presentes, extraResources precisa de novos prebuilts
- `apps/desktop/package.json` — scripts `build:dist:mac`, `build:dist:linux` já existem

### Phase Context
- `.planning/REQUIREMENTS.md` — PLAT-01..06
- `.planning/phases/33-cross-platform-support/33-CONTEXT.md` — este arquivo

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `position.ts:calculateInitialPosition()` — usa `screen.getDisplayNearestPoint()` + `workArea` — já cross-platform, sem mudança necessária
- `hotkey.ts` — usa `CmdOrCtrl` accelerator — já cross-platform
- `tray.ts:createTray()` — PNG colorido, funciona no Windows/Linux/macOS com pequenas diferenças visuais
- `electron-builder.yml` — já tem `mac: dmg`, `linux: AppImage`, `NSMicrophoneUsageDescription` configurado

### Established Patterns
- Todos os IPC handlers e BrowserWindow config são independentes de plataforma
- `backgroundThrottling: false` já configurado — necessário para wake word em todas as plataformas
- Permission handler para `media/audioCapture` já implementado em `index.ts` — macOS precisa desse handler para não silenciar getUserMedia

### Integration Points
- `app.dock.hide()` vai em `app.whenReady()` em `index.ts`, gated em `process.platform === 'darwin'`
- Novos `extraResources` em `electron-builder.yml` espelham o padrão existente dos `win32` binaries

### Known Issues to Fix
- `skipTaskbar: true` em `BrowserWindow` — no-op no macOS (não causa erro, mas redundante). `app.dock.hide()` é o equivalente correto.
- `electron-builder.yml` extraResources só tem `win32-x64`, `win32-x64-cuda`, `win32-x64-vulkan` — adicionar variantes mac/linux.

</code_context>

<specifics>
## Specific Ideas

- `app.dock.hide()` deve ser chamado condicionalmente: `if (process.platform === 'darwin') { app.dock.hide(); }`
- Verificar se `@fugood/whisper.node` realmente publica `darwin-arm64`, `darwin-x64`, `linux-x64` como packages separados — pode ser que o package principal detecte a plataforma automaticamente (prebuilds approach). Checar o npm registry/GitHub antes de assumir nomes de packages.

</specifics>

<deferred>
## Deferred Ideas

- Tray icon como template image (branco/preto para menu bar do macOS) — não foi solicitado nesta fase
- Linux Wayland support — apenas X11 neste milestone (PLAT-08 em v2 requirements)
- macOS PTT hotkey global (depende de Accessibility permission no macOS Big Sur+) — não está nos requirements desta fase

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 33-cross-platform-support*
*Context gathered: 2026-04-15*
