/**
 * store-clientId.test.ts — Phase 54 (LACT-09)
 *
 * Tests for getOrCreateClientId() accessor.
 * D-03: clientId generated once via crypto.randomUUID(), persisted in electron-store.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron-store with in-memory object
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
      static __resetStore() {
        mockStore = {};
      }
      static __getBackingStore() {
        return mockStore;
      }
    },
  };
});

// Mock crypto.randomUUID
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234-5678-90ab-cdef01234567'),
}));

import Store from 'electron-store';
import { randomUUID } from 'crypto';
import { getOrCreateClientId } from '../store';

describe('getOrCreateClientId', () => {
  beforeEach(() => {
    // Reset store state between tests
    (Store as unknown as { __resetStore: () => void }).__resetStore();
    vi.clearAllMocks();
    vi.mocked(randomUUID).mockReturnValue('test-uuid-1234-5678-90ab-cdef01234567' as `${string}-${string}-${string}-${string}-${string}`);
  });

  it('generates a UUID on first call (empty store) and returns it', () => {
    const id = getOrCreateClientId();

    expect(randomUUID).toHaveBeenCalledOnce();
    expect(id).toBe('test-uuid-1234-5678-90ab-cdef01234567');
  });

  it('persists the UUID to the store on first call', () => {
    getOrCreateClientId();

    const stored = (Store as unknown as { __getBackingStore: () => Record<string, unknown> }).__getBackingStore();
    expect(stored['electronClientId']).toBe('test-uuid-1234-5678-90ab-cdef01234567');
  });

  it('returns the same UUID on second call without generating a new one', () => {
    const id1 = getOrCreateClientId();
    vi.mocked(randomUUID).mockReturnValue('different-uuid-should-not-appear' as `${string}-${string}-${string}-${string}-${string}`);
    const id2 = getOrCreateClientId();

    expect(id1).toBe(id2);
    expect(randomUUID).toHaveBeenCalledOnce(); // Only called on the first call
  });

  it('generates a new UUID when store has corrupted value (number)', () => {
    // Manually set a corrupted value (non-string)
    const storeInstance = (Store as unknown as { __getBackingStore: () => Record<string, unknown> }).__getBackingStore();
    storeInstance['electronClientId'] = 42;

    const id = getOrCreateClientId();

    expect(randomUUID).toHaveBeenCalledOnce();
    expect(id).toBe('test-uuid-1234-5678-90ab-cdef01234567');
  });

  it('generates a new UUID when store has empty string (corrupted)', () => {
    // Empty string is also invalid
    const storeInstance = (Store as unknown as { __getBackingStore: () => Record<string, unknown> }).__getBackingStore();
    storeInstance['electronClientId'] = '';

    const id = getOrCreateClientId();

    expect(randomUUID).toHaveBeenCalledOnce();
    expect(id).toBe('test-uuid-1234-5678-90ab-cdef01234567');
  });
});
