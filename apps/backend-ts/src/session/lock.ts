/**
 * SessionLock — mutex booleano simples para garantir que apenas uma request por vez
 * entra em ChatSession.send/sendStream. Paridade com asyncio.Lock usado em
 * src/jarvis/api/routes/chat.py. Node é single-threaded, então basta uma flag.
 */
export class SessionLock {
  private _busy = false;

  isBusy(): boolean {
    return this._busy;
  }

  /**
   * Tenta adquirir o lock. Retorna uma função de release quando consegue,
   * ou `null` se já estava ocupado. A release é idempotente.
   */
  tryAcquire(): (() => void) | null {
    if (this._busy) {
      console.warn('[SessionLock] tryAcquire: BUSY — returning 429');
      return null;
    }
    this._busy = true;
    console.log('[SessionLock] acquired');
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this._busy = false;
      console.log('[SessionLock] released');
    };
  }
}
