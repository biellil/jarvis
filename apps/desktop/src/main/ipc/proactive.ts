/**
 * Proactive IPC Handlers — Phase 67 Plan 08 (PROACT-02, PROACT-03)
 *
 * setupProactiveIpc: registra 3 handlers ipcMain para mudanças de config proativa:
 *   - proactive:apply-quiet-hours  → valida HH:MM → persiste store → POST backend
 *   - proactive:apply-folder-watch → valida path absoluto + não-sistema → persiste → POST backend
 *   - proactive:apply-daily-summary → persiste → POST backend
 *
 * pushProactiveConfigToBackend: lê config atual do store e faz POST para as 3 rotas de settings.
 * Chamado uma vez no startup (Plan 67-08 Task 2) para sincronizar o estado inicial do
 * Electron com o backend antes de abrir o SSE stream.
 *
 * T-67-03: Validação de path absoluto + DENIED_PATHS para folder-watch.
 */
import path from 'node:path';
import { ipcMain, BrowserWindow } from 'electron';
import {
  getQuietHours,
  getFolderWatch,
  getDailySummary,
  setQuietHours,
  setFolderWatch,
  setDailySummary,
} from '../store.js';
import type { QuietHoursConfig, FolderWatchConfig, DailySummaryConfig } from '../../shared/ipc-types.js';

/** Regex para validar formato HH:MM 24h (00:00 a 23:59). */
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Paths de sistema que o folder-watch não deve monitorar (T-67-03).
 * Lista de prefixos Unix e Windows — defesa em profundidade simples e auditável.
 */
const DENIED_PATHS = ['/', '/etc', '/sys', '/proc', '/usr', '/bin', '/sbin', 'C:\\Windows', 'C:\\System32'];

async function postToBackend(
  backendUrl: string,
  bearer: string,
  endpoint: string,
  body: unknown,
): Promise<void> {
  await fetch(`${backendUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Registra os 3 handlers IPC para configuração proativa.
 * Deve ser chamado após a criação da mainWindow (startup).
 */
export function setupProactiveIpc(backendUrl: string, bearer: string): void {
  // ---- proactive:apply-quiet-hours ----
  ipcMain.handle(
    'proactive:apply-quiet-hours',
    async (
      _event,
      config: QuietHoursConfig,
    ): Promise<{ success: boolean; error?: string }> => {
      // Validação HH:MM (T-67-03 via threat model do plano)
      if (!HHMM_REGEX.test(config.start) || !HHMM_REGEX.test(config.end)) {
        return { success: false, error: 'Formato de hora inválido (esperado HH:MM)' };
      }

      setQuietHours(config);

      try {
        await postToBackend(backendUrl, bearer, '/api/settings/quiet-hours', config);
      } catch (err) {
        // Non-fatal — backend pode estar offline; store já foi persistido
        console.warn('[proactive-ipc] quiet-hours backend sync falhou (non-fatal):', err);
      }

      // Broadcast para todos os renderers (multi-window pattern de Phases 52-57)
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('proactive:quiet-hours-changed', config);
        }
      });

      return { success: true };
    },
  );

  // ---- proactive:apply-folder-watch ----
  ipcMain.handle(
    'proactive:apply-folder-watch',
    async (
      _event,
      config: FolderWatchConfig,
    ): Promise<{ success: boolean; error?: string }> => {
      if (config.enabled && config.path) {
        // Path deve ser absoluto (T-67-03)
        if (!path.isAbsolute(config.path)) {
          return { success: false, error: 'Caminho deve ser absoluto' };
        }
        // Path não pode ser diretório de sistema
        if (DENIED_PATHS.includes(config.path)) {
          return { success: false, error: 'Caminho do sistema não permitido' };
        }
      }

      setFolderWatch(config);

      try {
        await postToBackend(backendUrl, bearer, '/api/settings/folder-watch', config);
      } catch (err) {
        console.warn('[proactive-ipc] folder-watch backend sync falhou (non-fatal):', err);
      }

      return { success: true };
    },
  );

  // ---- proactive:apply-daily-summary ----
  ipcMain.handle(
    'proactive:apply-daily-summary',
    async (
      _event,
      config: DailySummaryConfig,
    ): Promise<{ success: boolean; error?: string }> => {
      setDailySummary(config);

      try {
        await postToBackend(backendUrl, bearer, '/api/settings/daily-summary', config);
      } catch (err) {
        console.warn('[proactive-ipc] daily-summary backend sync falhou (non-fatal):', err);
      }

      return { success: true };
    },
  );
}

/**
 * Lê as configurações proativas do electron-store e faz POST para o backend.
 * Deve ser chamado uma vez no startup, antes de abrir o SSE stream,
 * para garantir que o backend parte com o mesmo estado do Electron.
 *
 * ProactiveScheduler.registerDailySummaryJob usa '09:00' como default no backend,
 * mas o Electron pode ter um valor diferente persistido pelo usuário — este push
 * garante sincronização.
 */
export async function pushProactiveConfigToBackend(
  backendUrl: string,
  bearer: string,
): Promise<void> {
  const quietHours = getQuietHours();
  const folderWatch = getFolderWatch();
  const dailySummary = getDailySummary();

  const pushAll = [
    postToBackend(backendUrl, bearer, '/api/settings/quiet-hours', quietHours),
    postToBackend(backendUrl, bearer, '/api/settings/folder-watch', folderWatch),
    postToBackend(backendUrl, bearer, '/api/settings/daily-summary', dailySummary),
  ];

  // Fire-and-forget com log — falhas não devem bloquear o startup do SSE consumer
  await Promise.allSettled(pushAll).then((results) => {
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const route = ['/api/settings/quiet-hours', '/api/settings/folder-watch', '/api/settings/daily-summary'][i];
        console.warn(`[proactive-ipc] startup config push falhou para ${route} (non-fatal):`, r.reason);
      }
    });
  });
}
