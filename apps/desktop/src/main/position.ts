/**
 * Window Position Calculation and Persistence
 *
 * DESK-03: Multi-monitor aware positioning
 * DESK-05: Position persistence via electron-store
 *
 * Pattern: RESEARCH.md Pattern 2 - Multi-Monitor Aware Positioning
 */
import { screen, Display } from 'electron';
import Store from 'electron-store';

// D-03 (260410-td5): window 240x240 = orb visible 128px + transparent padding 56px per side
const WINDOW_SIZE = 240;

// Parte visível da esfera (diâmetro real do glass orb renderizado)
const VISIBLE_ORB_SIZE = 128;

// Margem da esfera visível até a borda da workArea / taskbar
const SPHERE_MARGIN = 4;

export interface WindowPosition {
  x: number;
  y: number;
}

interface StoreSchema {
  window?: {
    position?: WindowPosition;
  };
}

const store = new Store<StoreSchema>();

/**
 * Calculate initial window position on the monitor where cursor is located
 *
 * D-02: Uses cursor position to determine target monitor (not primary display)
 * D-03: Window size is 128x128px
 * D-04: Coordinates are rounded to avoid sub-pixel blur
 * D-11: Validates saved position, resets to default if off-screen
 */
export function calculateInitialPosition(): WindowPosition {
  // D-02: Get cursor position to find active monitor
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);

  // Try to restore saved position first (D-12)
  const savedPosition = store.get('window.position');
  if (savedPosition && isPositionValid(savedPosition, display)) {
    return savedPosition;
  }

  // If saved position is invalid or doesn't exist, calculate default bottom-right
  return calculateDefaultPosition(display);
}

/**
 * Calculate default bottom-right position on given display
 *
 * D-03 (260410-td5): Posiciona a esfera VISÍVEL (128px) colada ao canto inferior
 * direito, compensando os 56px de padding transparente em cada lado da janela
 * de 240x240. A parte transparente da janela "vaza" sobre a taskbar e a borda
 * direita, mas como é transparente + click-through, é invisível e não captura
 * cliques.
 *
 * D-04: Uses Math.round() to avoid sub-pixel rendering blur
 */
function calculateDefaultPosition(display: Display): WindowPosition {
  const { workArea } = display;
  const transparentPadding = (WINDOW_SIZE - VISIBLE_ORB_SIZE) / 2; // 56

  // Janela é posicionada tal que a esfera visível fique a SPHERE_MARGIN pixels
  // do canto inferior direito da workArea.
  return {
    x: Math.round(workArea.x + workArea.width - WINDOW_SIZE + transparentPadding - SPHERE_MARGIN),
    y: Math.round(workArea.y + workArea.height - WINDOW_SIZE + transparentPadding - SPHERE_MARGIN),
  };
}

/**
 * Validate if saved position is within current display bounds
 *
 * D-11: Reset if outside screen bounds (don't clamp)
 * D-03 (260410-td5): Valida apenas a região da ESFERA VISÍVEL (128px), não a
 * janela inteira de 240x240 — os 56px de padding transparente intencionalmente
 * ficam sobre a taskbar/bordas e não devem invalidar a posição.
 */
function isPositionValid(pos: WindowPosition, display: Display): boolean {
  const { workArea } = display;
  const transparentPadding = (WINDOW_SIZE - VISIBLE_ORB_SIZE) / 2; // 56
  const sphereX = pos.x + transparentPadding;
  const sphereY = pos.y + transparentPadding;

  const isValid =
    sphereX >= workArea.x &&
    sphereY >= workArea.y &&
    sphereX + VISIBLE_ORB_SIZE <= workArea.x + workArea.width &&
    sphereY + VISIBLE_ORB_SIZE <= workArea.y + workArea.height;

  if (!isValid) {
    console.log('Saved window position is off-screen. Resetting to default bottom-right.');
  }

  return isValid;
}

/**
 * Save window position to persistent storage
 *
 * D-09: Save only { x, y } — size is fixed at 128x128
 * D-10: Called on before-quit event
 * D-12: Stored under 'window.position' key
 */
export function savePosition(x: number, y: number): void {
  store.set('window.position', { x, y });
}
