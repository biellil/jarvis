/**
 * VoiceInputManager — State machine tests (Phase 22 Plan 01, Wave 0)
 *
 * Covers WAKE-07: "Um único módulo decide quem detém o microfone a qualquer
 * momento (PTT ou WakeWord), nunca os dois". Política PTT-preempts-wakeword.
 *
 * Tabela de 10 cenários de arbitragem. Estes testes são criados FALHANDO
 * (import do módulo ainda não existe) — Task 2 implementa o singleton.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  voiceInputManager,
  __resetVoiceInputManagerForTests,
} from '../voiceInputManager';

describe('voiceInputManager', () => {
  beforeEach(() => {
    __resetVoiceInputManagerForTests();
  });

  it('1. initial state: getCurrentSource() retorna null', () => {
    expect(voiceInputManager.getCurrentSource()).toBeNull();
  });

  it("2. acquire('ptt') com null concede grant, releasedPreviousSource=null", () => {
    const grant = voiceInputManager.acquire('ptt');
    expect('error' in grant).toBe(false);
    if ('error' in grant) return;
    expect(grant.source).toBe('ptt');
    expect(grant.releasedPreviousSource).toBeNull();
    expect(typeof grant.startedAt).toBe('number');
    expect(voiceInputManager.getCurrentSource()).toBe('ptt');
  });

  it("3. acquire('wakeword') com null concede grant, releasedPreviousSource=null", () => {
    const grant = voiceInputManager.acquire('wakeword');
    expect('error' in grant).toBe(false);
    if ('error' in grant) return;
    expect(grant.source).toBe('wakeword');
    expect(grant.releasedPreviousSource).toBeNull();
    expect(voiceInputManager.getCurrentSource()).toBe('wakeword');
  });

  it("4. acquire('ptt') idempotente: 2x seguidas retorna grant consistente, listener chamado só 1x", () => {
    const listener = vi.fn();
    voiceInputManager.subscribe(listener);

    const g1 = voiceInputManager.acquire('ptt');
    const g2 = voiceInputManager.acquire('ptt');

    expect('error' in g1).toBe(false);
    expect('error' in g2).toBe(false);
    expect(voiceInputManager.getCurrentSource()).toBe('ptt');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('ptt');
  });

  it("5. acquire('wakeword') idempotente: 2x seguidas retorna grant consistente, listener chamado só 1x", () => {
    const listener = vi.fn();
    voiceInputManager.subscribe(listener);

    const g1 = voiceInputManager.acquire('wakeword');
    const g2 = voiceInputManager.acquire('wakeword');

    expect('error' in g1).toBe(false);
    expect('error' in g2).toBe(false);
    expect(voiceInputManager.getCurrentSource()).toBe('wakeword');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('wakeword');
  });

  it("6. PTT preempta wakeword: pre='wakeword', acquire('ptt') concede e notifica 'ptt'", () => {
    voiceInputManager.acquire('wakeword');

    const listener = vi.fn();
    voiceInputManager.subscribe(listener);

    const grant = voiceInputManager.acquire('ptt');
    expect('error' in grant).toBe(false);
    if ('error' in grant) return;
    expect(grant.source).toBe('ptt');
    expect(grant.releasedPreviousSource).toBe('wakeword');
    expect(voiceInputManager.getCurrentSource()).toBe('ptt');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('ptt');
  });

  it("7. WakeWord rejeitado quando PTT ativo: pre='ptt', acquire('wakeword') retorna BUSY", () => {
    voiceInputManager.acquire('ptt');

    const listener = vi.fn();
    voiceInputManager.subscribe(listener);

    const result = voiceInputManager.acquire('wakeword');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('BUSY');
    }
    expect(voiceInputManager.getCurrentSource()).toBe('ptt');
    expect(listener).not.toHaveBeenCalled();
  });

  it("8. release('ptt') quando current='ptt' libera e notifica null", () => {
    voiceInputManager.acquire('ptt');

    const listener = vi.fn();
    voiceInputManager.subscribe(listener);

    voiceInputManager.release('ptt');
    expect(voiceInputManager.getCurrentSource()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("9. release('ptt') quando current='wakeword' é NO-OP (não mata wakeword por acidente)", () => {
    voiceInputManager.acquire('wakeword');

    const listener = vi.fn();
    voiceInputManager.subscribe(listener);

    voiceInputManager.release('ptt');
    expect(voiceInputManager.getCurrentSource()).toBe('wakeword');
    expect(listener).not.toHaveBeenCalled();
  });

  it('10. subscribe retorna unsubscribe — chamar unsubscribe silencia notificações', () => {
    const listener = vi.fn();
    const unsub = voiceInputManager.subscribe(listener);
    unsub();

    voiceInputManager.acquire('ptt');
    expect(listener).not.toHaveBeenCalled();
  });
});
