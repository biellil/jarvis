/**
 * Position Calculation Tests
 *
 * Tests for multi-monitor aware positioning and persistence
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from 'electron';

// Mock electron-store
vi.mock('electron-store', () => {
  let mockStore: Record<string, unknown> = {};

  return {
    default: class Store {
      get(key: string) {
        return mockStore[key];
      }
      set(key: string, value: unknown) {
        mockStore[key] = value;
      }
      // Expose for test control
      static __resetStore() {
        mockStore = {};
      }
    },
  };
});

// Mock electron screen module
vi.mock('electron', () => ({
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 100 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
  },
}));

describe('Position Module', () => {
  beforeEach(async () => {
    // Reset module cache to get fresh imports
    vi.resetModules();
    // Reset mock store
    const Store = (await import('electron-store')).default;
    (Store as any).__resetStore();

    // Reset screen mock to default values
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 100, y: 100 });
    vi.mocked(screen.getDisplayNearestPoint).mockReturnValue({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    } as any);
  });

  describe('calculateInitialPosition', () => {
    it('should return valid WindowPosition object', async () => {
      const { calculateInitialPosition } = await import('../position');
      const position = calculateInitialPosition();

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');
      expect(typeof position.x).toBe('number');
      expect(typeof position.y).toBe('number');
    });

    it('should calculate default bottom-right position with 16px offset', async () => {
      const { calculateInitialPosition } = await import('../position');
      const position = calculateInitialPosition();

      // Expected: workArea.width (1920) - WINDOW_SIZE (128) - OFFSET (16) = 1776
      // Expected: workArea.height (1080) - WINDOW_SIZE (128) - OFFSET (16) = 936
      expect(position.x).toBe(1776);
      expect(position.y).toBe(936);
    });

    it('should use Math.round on coordinates', async () => {
      // Mock display with fractional workArea
      vi.mocked(screen.getDisplayNearestPoint).mockReturnValue({
        workArea: { x: 0.3, y: 0.7, width: 1920.5, height: 1080.2 },
      } as any);

      const { calculateInitialPosition } = await import('../position');
      const position = calculateInitialPosition();

      // Verify coordinates are rounded integers
      expect(position.x).toBe(Math.round(position.x));
      expect(position.y).toBe(Math.round(position.y));
    });

    it('should restore saved position if valid', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();
      storeInstance.set('window.position', { x: 500, y: 400 });

      const { calculateInitialPosition } = await import('../position');
      const position = calculateInitialPosition();

      expect(position.x).toBe(500);
      expect(position.y).toBe(400);
    });

    it('should reject off-screen saved position and return default', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();
      // Position outside workArea bounds (x: 3000 > 1920)
      storeInstance.set('window.position', { x: 3000, y: 400 });

      const { calculateInitialPosition } = await import('../position');
      const position = calculateInitialPosition();

      // Should fall back to default bottom-right
      expect(position.x).toBe(1776);
      expect(position.y).toBe(936);
    });
  });

  describe('savePosition', () => {
    it('should store position with x and y coordinates', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();

      const { savePosition } = await import('../position');
      savePosition(100, 200);

      const saved = storeInstance.get('window.position') as { x: number; y: number };
      expect(saved).toEqual({ x: 100, y: 200 });
    });

    it('should only save x and y (not size)', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();

      const { savePosition } = await import('../position');
      savePosition(150, 250);

      const saved = storeInstance.get('window.position') as Record<string, unknown>;
      expect(Object.keys(saved)).toEqual(['x', 'y']);
    });
  });

  describe('isPositionValid (indirectly tested)', () => {
    it('should reject position with x less than workArea.x', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();
      storeInstance.set('window.position', { x: -10, y: 100 });

      const { calculateInitialPosition } = await import('../position');
      const position = calculateInitialPosition();

      // Should return default, not saved
      expect(position.x).toBe(1776);
    });

    it('should reject position with y less than workArea.y', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();
      storeInstance.set('window.position', { x: 100, y: -10 });

      const { calculateInitialPosition } = await import('../position');
      const position = calculateInitialPosition();

      // Should return default, not saved
      expect(position.y).toBe(936);
    });

    it('should reject position that extends beyond workArea width', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();
      // x: 1850 + WINDOW_SIZE (128) = 1978 > workArea.width (1920)
      storeInstance.set('window.position', { x: 1850, y: 100 });

      const { calculateInitialPosition } = await import('../position');
      const position = calculateInitialPosition();

      // Should return default, not saved
      expect(position.x).toBe(1776);
    });

    it('should reject position that extends beyond workArea height', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();
      // y: 1000 + WINDOW_SIZE (128) = 1128 > workArea.height (1080)
      storeInstance.set('window.position', { x: 100, y: 1000 });

      const { calculateInitialPosition } = await import('../position');
      const position = calculateInitialPosition();

      // Should return default, not saved
      expect(position.y).toBe(936);
    });
  });
});
