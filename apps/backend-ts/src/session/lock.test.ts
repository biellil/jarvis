import { describe, it, expect } from 'vitest';
import { SessionLock } from './lock.js';

describe('SessionLock', () => {
  it('starts not busy', () => {
    const lock = new SessionLock();
    expect(lock.isBusy()).toBe(false);
  });

  it('tryAcquire returns release fn and marks busy', () => {
    const lock = new SessionLock();
    const release = lock.tryAcquire();
    expect(release).not.toBeNull();
    expect(lock.isBusy()).toBe(true);
    release!();
    expect(lock.isBusy()).toBe(false);
  });

  it('second tryAcquire while busy returns null', () => {
    const lock = new SessionLock();
    const r1 = lock.tryAcquire();
    const r2 = lock.tryAcquire();
    expect(r1).not.toBeNull();
    expect(r2).toBeNull();
    r1!();
    const r3 = lock.tryAcquire();
    expect(r3).not.toBeNull();
    r3!();
  });

  it('release is idempotent', () => {
    const lock = new SessionLock();
    const release = lock.tryAcquire()!;
    release();
    release();
    expect(lock.isBusy()).toBe(false);
    expect(lock.tryAcquire()).not.toBeNull();
  });
});
