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

// D-03: Window size — orb 96px + padding 16px each side
const WINDOW_SIZE = 128;

// D-01: Offset from screen edge — 2 × spacing-md for breathing room
const OFFSET = 16;

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
 * D-04: Uses Math.round() to avoid sub-pixel rendering blur
 */
function calculateDefaultPosition(display: Display): WindowPosition {
  const { workArea } = display;

  // D-04: Round coordinates to avoid sub-pixel blur
  return {
    x: Math.round(workArea.x + workArea.width - WINDOW_SIZE - OFFSET),
    y: Math.round(workArea.y + workArea.height - WINDOW_SIZE - OFFSET),
  };
}

/**
 * Validate if saved position is within current display bounds
 *
 * D-11: Reset if outside screen bounds (don't clamp)
 */
function isPositionValid(pos: WindowPosition, display: Display): boolean {
  const { workArea } = display;

  const isValid =
    pos.x >= workArea.x &&
    pos.y >= workArea.y &&
    pos.x + WINDOW_SIZE <= workArea.x + workArea.width &&
    pos.y + WINDOW_SIZE <= workArea.y + workArea.height;

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
