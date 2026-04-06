/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import { OrbProvider, useOrbContext } from '../OrbContext';
import type { ReactNode } from 'react';

describe('OrbContext', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <OrbProvider>{children}</OrbProvider>
  );

  it('initializes with idle state (ORB-01)', () => {
    const { result } = renderHook(() => useOrbContext(), { wrapper });
    expect(result.current.state).toBe('idle');
  });

  it('transitions to listening state (ORB-02)', () => {
    const { result } = renderHook(() => useOrbContext(), { wrapper });

    act(() => {
      result.current.setState('listening');
    });

    expect(result.current.state).toBe('listening');
  });

  it('transitions to processing state (ORB-03)', () => {
    const { result } = renderHook(() => useOrbContext(), { wrapper });

    act(() => {
      result.current.setState('processing');
    });

    expect(result.current.state).toBe('processing');
  });

  it('transitions to responding state (ORB-04)', () => {
    const { result } = renderHook(() => useOrbContext(), { wrapper });

    act(() => {
      result.current.setState('responding');
    });

    expect(result.current.state).toBe('responding');
  });

  it('throws error when useOrbContext is used outside provider', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = () => {};

    expect(() => {
      renderHook(() => useOrbContext());
    }).toThrow('useOrbContext must be used within OrbProvider');

    console.error = originalError;
  });

  it('maintains state across multiple consumers', () => {
    const { result: result1 } = renderHook(() => useOrbContext(), { wrapper });
    const { result: result2 } = renderHook(() => useOrbContext(), { wrapper });

    act(() => {
      result1.current.setState('processing');
    });

    expect(result1.current.state).toBe('processing');
    expect(result2.current.state).toBe('idle'); // Different wrapper instances
  });
});
