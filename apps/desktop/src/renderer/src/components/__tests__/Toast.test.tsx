/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Toast } from '../Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renderiza a mensagem e role=alert', () => {
    render(<Toast message="oi mundo" onClose={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('oi mundo');
  });

  it('auto-fecha após autoCloseMs', () => {
    const onClose = vi.fn();
    render(<Toast message="bye" onClose={onClose} autoCloseMs={5000} />);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fecha ao clicar', () => {
    const onClose = vi.fn();
    render(<Toast message="click me" onClose={onClose} autoCloseMs={99999} />);
    fireEvent.click(screen.getByRole('alert'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('não chama onClose se autoCloseMs <= 0', () => {
    const onClose = vi.fn();
    render(<Toast message="sticky" onClose={onClose} autoCloseMs={0} />);
    vi.advanceTimersByTime(60000);
    expect(onClose).not.toHaveBeenCalled();
  });
});
