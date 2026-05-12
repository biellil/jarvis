/**
 * Tray Module tests — Phase 23 Plan 02 (D-03)
 *
 * Reescritos para cobrir o item "Pause listening"/"Resume listening" no
 * TOPO do menu (D-03). Remove a expectativa obsoleta de "3 menu items"
 * (deferred desde v1.2; o menu real tem ~10 itens desde Phase 13).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const traySource = fs.readFileSync(
  path.join(__dirname, '../tray.ts'),
  'utf-8'
);

describe('Tray Module (source-level assertions)', () => {
  describe('WAKE-03 / D-03: Pause/Resume listening item', () => {
    it.skip('D-03: getWakeWordPaused removido do tray em Phase 41', () => {
      expect(traySource).toMatch(/getWakeWordPaused/);
      expect(traySource).toMatch(/setWakeWordPaused/);
    });

    it('no longer imports getWakeWordEnabled/setWakeWordEnabled', () => {
      expect(traySource).not.toContain('getWakeWordEnabled');
      expect(traySource).not.toContain('setWakeWordEnabled');
    });

    it.skip('D-03: broadcastModeSwitch substitui em Phase 41', () => {
      expect(traySource).toMatch(/broadcastPauseToggle/);
    });

    it.skip('D-03: item removido em Phase 41 — substituído por Voice Mode submenu', () => {
      expect(traySource).toContain('Pause listening');
    });

    it.skip('D-03: item removido em Phase 41 — substituído por Voice Mode submenu', () => {
      expect(traySource).toContain('Resume listening');
    });

    it.skip('D-03: item removido em Phase 41 — Voice Mode submenu é agora o primeiro item', () => {
      const pauseIdx = traySource.indexOf('Pause listening');
      const showIdx = traySource.indexOf("label: 'Show'");
      expect(pauseIdx).toBeGreaterThan(-1);
      expect(showIdx).toBeGreaterThan(-1);
      expect(pauseIdx).toBeLessThan(showIdx);
    });

    it.skip('D-03: item removido em Phase 41', () => {
      expect(traySource).toMatch(/setWakeWordPaused\(\s*!\s*paused\s*\)|setWakeWordPaused\(\s*next\s*\)/);
    });

    it.skip('D-03: item removido em Phase 41', () => {
      expect(traySource).toMatch(/broadcastPauseToggle\(/);
    });

    it.skip('D-03: tooltip atualizado para modo ativo em Phase 41', () => {
      expect(traySource).toContain('JARVIS — paused');
      expect(traySource).toContain('JARVIS — listening');
    });

    it.skip('D-03: item removido em Phase 41', () => {
      // Pegar o bloco do click handler de Pause/Resume — usa lastIndexOf
      // porque "Pause listening" também aparece no header comment.
      const clickIdx = traySource.lastIndexOf('Pause listening');
      const pauseBlock = traySource.slice(clickIdx, clickIdx + 600);
      expect(pauseBlock).toContain('setContextMenu');
    });

    it('no residual references to wake-word-settings-changed / wakeWordEnabled', () => {
      expect(traySource).not.toContain('wake-word-settings-changed');
      expect(traySource).not.toContain('wakeWordEnabled');
    });
  });

  describe('Preserved behaviors (regression)', () => {
    it('has Show menu item', () => {
      expect(traySource).toContain("label: 'Mostrar'");
    });

    it('has Hide menu item', () => {
      expect(traySource).toContain("label: 'Ocultar'");
    });

    it('has Quit menu item', () => {
      expect(traySource).toContain("label: 'Sair'");
    });

    it('Show calls mainWindow.show()', () => {
      expect(traySource).toContain('mainWindow.show()');
    });

    it('Hide calls mainWindow.hide()', () => {
      expect(traySource).toContain('mainWindow.hide()');
    });

    it('Quit calls app.quit()', () => {
      expect(traySource).toContain('app.quit()');
    });
  });

  describe('D-05: Icon path', () => {
    it('uses 16x16 icon path', () => {
      expect(traySource).toContain('icon-16x16.png');
    });
  });

  describe('Exports', () => {
    it('exports createTray', () => {
      expect(traySource).toContain('export function createTray');
    });

    it('exports destroyTray', () => {
      expect(traySource).toContain('export function destroyTray');
    });
  });

  describe('Voice Mode submenu (VUI-01 — Phase 41)', () => {
    it('D-07: submenu contém exatamente 3 itens: "Palavra de Ativação", "Sempre Ouvindo", "Push-to-Talk"', () => {
      expect(traySource).toContain("label: 'Palavra de Ativação'");
      expect(traySource).toContain("label: 'Sempre Ouvindo'");
      expect(traySource).toContain("label: 'Push-to-Talk'");
    });

    it('D-06: submenu "Modo de Voz" aparece como primeiro item configurável (antes de Mostrar)', () => {
      const voiceModeIdx = traySource.indexOf("label: 'Modo de Voz'");
      const showIdx = traySource.indexOf("label: 'Mostrar'");
      expect(voiceModeIdx).toBeGreaterThan(-1);
      expect(showIdx).toBeGreaterThan(-1);
      expect(voiceModeIdx).toBeLessThan(showIdx);
    });

    it('D-04: buildContextMenu lê voiceModeManager.getMode() para checked state', () => {
      expect(traySource).toMatch(/voiceModeManager\.getMode\(\)/);
      expect(traySource).toMatch(/checked.*currentMode|currentMode.*checked/);
    });

    it('D-01/D-05: click handler chama voiceModeManager.setMode() com o modo correto', () => {
      expect(traySource).toMatch(/voiceModeManager\.setMode\(/);
      expect(traySource).toMatch(/option\.mode/);
    });

    it('D-02/D-05: broadcastModeSwitch é chamado tanto em success:true quanto em success:false', () => {
      expect(traySource).toMatch(/broadcastModeSwitch\(/);
      // Deve aparecer antes do if (success) — broadcast incondicional
      const broadcastIdx = traySource.lastIndexOf('broadcastModeSwitch(');
      const ifSuccessIdx = traySource.indexOf('if (success)');
      expect(broadcastIdx).toBeGreaterThan(-1);
      expect(ifSuccessIdx).toBeGreaterThan(-1);
      // broadcastModeSwitch chamado antes do rebuild condicional
      expect(broadcastIdx).toBeLessThan(ifSuccessIdx + 300); // dentro do mesmo bloco
    });

    it('D-03: "Pause listening" e "Resume listening" NÃO aparecem em tray.ts', () => {
      // D-03: item removido — Voice Mode submenu é o único controle de voz
      expect(traySource).not.toContain('Pause listening');
      expect(traySource).not.toContain('Resume listening');
    });
  });
});

describe('Phase 44 (VHARD-01): macOS permission gate em tray.ts', () => {
  it('D-05: guarda com process.platform === darwin antes do check de permissão', () => {
    expect(traySource).toContain("process.platform === 'darwin'");
  });

  it('D-06: usa getMediaAccessStatus (não askForMediaAccess)', () => {
    expect(traySource).toContain("getMediaAccessStatus('microphone')");
    expect(traySource).not.toContain('askForMediaAccess');
  });

  it('D-03: broadcastModeSwitch com blockedReason mic-permission-denied quando negado', () => {
    expect(traySource).toContain("blockedReason: 'mic-permission-denied'");
  });

  it('D-03: settingsUrl é string literal hardcoded (não derivada de IPC)', () => {
    // URL hardcoded em tray.ts — nunca passa pelo IPC como parâmetro externo
    expect(traySource).toContain('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
  });

  it('D-01: permission check ocorre ANTES de voiceModeManager.setMode()', () => {
    const permCheckIdx = traySource.indexOf("getMediaAccessStatus('microphone')");
    const setModeIdx = traySource.indexOf('voiceModeManager.setMode(');
    expect(permCheckIdx).toBeGreaterThan(-1);
    expect(setModeIdx).toBeGreaterThan(-1);
    expect(permCheckIdx).toBeLessThan(setModeIdx);
  });

  it('D-02: check aplica-se a always-listening E ptt-only (ambos verificados)', () => {
    // O guard deve verificar ambos os modos — always-listening e ptt-only
    const permBlock = traySource.slice(
      traySource.indexOf("process.platform === 'darwin'"),
      traySource.indexOf('voiceModeManager.setMode(')
    );
    expect(permBlock).toContain("'always-listening'");
    expect(permBlock).toContain("'ptt-only'");
  });
});

describe('Main process tray integration', () => {
  const mainSource = fs.readFileSync(
    path.join(__dirname, '../index.ts'),
    'utf-8'
  );

  it('imports createTray from tray module', () => {
    expect(mainSource).toMatch(/import.*createTray.*from.*['"]\.\/tray['"]/);
  });

  it('calls createTray after window creation', () => {
    expect(mainSource).toContain('createTray(');
  });

  it('VUI-01: createTray aceita VoiceModeManager como segundo parâmetro', () => {
    expect(traySource).toMatch(/export function createTray\s*\([^)]*VoiceModeManager/);
  });

  it('VUI-01: main/index.ts instancia VoiceModeManager e passa para createTray()', () => {
    expect(mainSource).toContain('VoiceModeManager');
    expect(mainSource).toMatch(/createTray\(.*voiceModeManager/);
  });
});

describe('Phase 71 D-10: Abrir .env menu item', () => {
  it('imports shell from electron', () => {
    expect(traySource).toMatch(/import\s*\{[^}]*shell[^}]*\}\s*from\s*['"]electron['"]/);
  });

  it('imports resolveEnvPath from envPath.js', () => {
    expect(traySource).toMatch(/from\s*['"]\.\/envPath\.js['"]/);
  });

  it('has "Abrir .env" menu item label', () => {
    expect(traySource).toContain("label: 'Abrir .env'");
  });

  it('Abrir .env click handler calls shell.showItemInFolder(resolveEnvPath())', () => {
    expect(traySource).toMatch(/shell\.showItemInFolder\(\s*resolveEnvPath\(\)\s*\)/);
  });

  it('Abrir .env item is positioned after Configurações and before Configurar Atalho', () => {
    const configIdx = traySource.indexOf("label: 'Configurações'");
    const abrirEnvIdx = traySource.indexOf("label: 'Abrir .env'");
    const configHotkeyIdx = traySource.indexOf("label: 'Configurar Atalho'");
    expect(configIdx).toBeGreaterThan(-1);
    expect(abrirEnvIdx).toBeGreaterThan(configIdx);
    expect(configHotkeyIdx).toBeGreaterThan(abrirEnvIdx);
  });
});
