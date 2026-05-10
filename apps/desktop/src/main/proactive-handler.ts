/**
 * ProactiveSSEConsumer — Phase 67 Plan 08 (PROACT-02, PROACT-03)
 *
 * Consome o SSE stream /api/proactive/stream usando fetch + ReadableStream
 * (Bearer auth no header — EventSource não suporta headers customizados).
 *
 * Quando recebe um evento 'proactive:fire':
 * 1. Exibe Electron Notification nativa com título em pt-BR por kind
 * 2. Registra handler de click para focar a mainWindow
 * 3. Envia IPC 'proactive:event' ao renderer para TTS + chat bubble
 *
 * D-09: Disparo paralelo em 3 canais — Notification API + TTS + chat bubble.
 */
import path from 'node:path';
import { Notification, BrowserWindow } from 'electron';
import type { ProactiveEvent } from '../shared/ipc-types.js';

export class ProactiveSSEConsumer {
  private abortController: AbortController | null = null;

  /**
   * Inicia a escuta do SSE stream proativo.
   * Retorna uma Promise que resolve quando a conexão encerra (stream esgotado ou abort).
   * Erros de conexão propagam — o chamador deve usar .catch() para log não-fatal.
   */
  async startListening(
    backendUrl: string,
    bearer: string,
    mainWindow: BrowserWindow,
  ): Promise<void> {
    this.abortController = new AbortController();

    const response = await fetch(`${backendUrl}/api/proactive/stream`, {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(
        `[ProactiveSSE] Backend returned ${response.status} for SSE stream`,
      );
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE blocks delimitados por \n\n
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        this.parseAndDispatch(block, mainWindow);
      }
    }
  }

  /** Aborta o loop SSE de forma limpa (sem throw). */
  stop(): void {
    this.abortController?.abort();
  }

  /**
   * Exposto apenas para testes unitários — permite chamar handleProactiveEvent
   * diretamente sem precisar simular o loop de fetch/ReadableStream.
   */
  dispatchEventForTest(evt: ProactiveEvent, mainWindow: BrowserWindow): void {
    this.handleProactiveEvent(evt, mainWindow);
  }

  // ---- private ----

  private parseAndDispatch(block: string, mainWindow: BrowserWindow): void {
    const lines = block.split('\n');
    let eventType = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      if (line.startsWith('data:')) data = line.slice(5).trim();
    }
    if (eventType !== 'proactive:fire' || !data) return;
    try {
      const evt = JSON.parse(data) as ProactiveEvent;
      this.handleProactiveEvent(evt, mainWindow);
    } catch {
      // JSON malformado — ignora silenciosamente (T-67-02)
    }
  }

  private handleProactiveEvent(evt: ProactiveEvent, mainWindow: BrowserWindow): void {
    const { title, body } = this.getNotificationCopy(evt);
    const notification = new Notification({ title, body, silent: false });
    notification.on('click', () => {
      mainWindow?.focus();
    });
    notification.show();

    // Encaminha ao renderer para TTS + chat bubble (D-09)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('proactive:event', evt);
    }
  }

  /**
   * Retorna título e corpo da notificação em pt-BR por kind de evento.
   * UI-SPEC §OS notification titles per kind.
   */
  private getNotificationCopy(evt: ProactiveEvent): { title: string; body: string } {
    switch (evt.kind) {
      case 'reminder':
        return { title: 'Lembrete', body: evt.message };

      case 'folder_event': {
        const folderName = path.basename(evt.folderPath);
        const fileCount = evt.files.length;
        if (fileCount === 1) {
          return {
            title: `Novo arquivo em ${folderName}`,
            body: evt.files[0]!.name,
          };
        }
        return {
          title: `Novos arquivos em ${folderName}`,
          body: `${fileCount} arquivos novos`,
        };
      }

      case 'daily_summary':
        return {
          title: 'Resumo diário pronto',
          body: evt.text.slice(0, 100),
        };
    }
  }
}
