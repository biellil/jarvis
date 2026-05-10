/**
 * Proactive Router — Phase 67 Plan 07
 *
 * Endpoints:
 *   GET  /stream          — SSE stream de eventos proativos (lembretes, resumo diário)
 *   POST /:id/ack         — Confirma recebimento de um lembrete
 *   POST /quiet-hours     — Atualiza configuração de quiet hours em runtime
 *   POST /folder-watch    — Inicia/para o FolderWatcher
 *   POST /daily-summary   — Atualiza horário do resumo diário (registra cron job)
 *
 * Montagem em app.ts:
 *   app.use('/api/proactive', createProactiveRouter());
 *   app.use('/api/settings', createProactiveRouter());
 *
 * Segurança (threat model 67-07):
 *   T-67-02: Bearer token middleware existente no Express gera todas as rotas /api/*
 *             Binding localhost-only (127.0.0.1) — sem acesso externo
 *   T-67-03: path validation — fs.existsSync + deny system dirs
 *   T-67-04: parseInt validation + Drizzle parameterized queries
 */
import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import { db } from '../memory/db.js';
import { reminders } from '../memory/schema.js';
import { eq } from 'drizzle-orm';
import { proactiveEmitter, ProactiveScheduler } from '../proactive/scheduler.js';
import { FolderWatcher } from '../proactive/folder-watcher.js';
import type { ProactiveEvent } from '../proactive/types.js';

// ─── Interface mínima usada internamente (para testabilidade via DI) ────────

interface IFolderWatcher {
  startWatching(path: string, cb: (files: Array<{ name: string; path: string }>) => void): Promise<void>;
  stopWatching(): Promise<void>;
}

// ─── Singleton process-level FolderWatcher ────────────────────────────────

/**
 * Singleton do FolderWatcher para o processo inteiro.
 * Iniciado/parado via POST /api/settings/folder-watch.
 * Exposto como variável de módulo para que index.ts possa acessar se necessário.
 */
export const folderWatcher: IFolderWatcher = new FolderWatcher(() => ({
  enabled: false,
  start: '22:00',
  end: '08:00',
}));

// ─── Diretórios de sistema bloqueados (T-67-03) ───────────────────────────

/**
 * Lista de prefixos de paths de sistema que não podem ser monitorados.
 * Reject se path é igual ou começa com qualquer um desses valores.
 */
const BLOCKED_SYSTEM_PATHS = [
  '/',
  '/etc',
  '/sys',
  '/proc',
  '/boot',
  '/dev',
  '/run',
  '/usr',
  '/bin',
  '/sbin',
  '/lib',
  '/lib64',
  'C:\\Windows',
  'C:\\System32',
  'C:\\Program Files',
];

function isBlockedSystemPath(p: string): boolean {
  const norm = p.trim();
  if (norm === '/') return true;
  return BLOCKED_SYSTEM_PATHS.some(
    (blocked) =>
      norm === blocked ||
      norm.startsWith(blocked + '/') ||
      norm.startsWith(blocked + '\\'),
  );
}

// ─── Router Factory ────────────────────────────────────────────────────────

/**
 * Cria o Express Router para todos os endpoints proativos.
 *
 * @param watcher - FolderWatcher a usar (default: singleton de módulo).
 *   Aceitar como parâmetro permite injeção em testes sem precisar mockar o construtor.
 */
export function createProactiveRouter(watcher: IFolderWatcher = folderWatcher): Router {
  const router = Router();

  // ── GET /stream ───────────────────────────────────────────────────────────

  /**
   * SSE endpoint — desktop conecta aqui para receber eventos proativos.
   *
   * Protocolo (RESEARCH Pattern 4 / Phase 66 tasks.ts SSE pattern):
   *   event: proactive:fire
   *   data: <ProactiveEvent JSON>
   *
   * Heartbeat a cada 30s para manter conexão viva através de proxies.
   * Cleanup de listener em req.on('close') — evita memory leak por disconnect.
   */
  router.get('/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const handler = (evt: ProactiveEvent) => {
      res.write(`event: proactive:fire\ndata: ${JSON.stringify(evt)}\n\n`);
    };

    proactiveEmitter.on('event', handler);

    // Heartbeat para manter conexão viva através de proxies/load balancers
    const pingInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 30_000);

    // Cleanup ao desconectar
    req.on('close', () => {
      clearInterval(pingInterval);
      proactiveEmitter.off('event', handler);
      res.end();
    });
  });

  // ── POST /:id/ack ─────────────────────────────────────────────────────────

  /**
   * Confirma recebimento de evento proativo pelo desktop.
   *
   * T-67-04: parseInt garante apenas IDs numéricos chegam ao DB.
   * Drizzle usa queries parametrizadas — sem risco de SQL injection.
   */
  router.post('/:id/ack', (req: Request, res: Response) => {
    const id = parseInt(String(req.params['id'] ?? ''), 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'id inválido — deve ser um número inteiro' });
    }

    // Idempotente: no-op se já atualizado
    db.update(reminders)
      .set({ status: 'fired', fired_at: Date.now() })
      .where(eq(reminders.id, id))
      .run();

    return res.status(200).json({ ok: true });
  });

  // ── POST /quiet-hours ─────────────────────────────────────────────────────

  /**
   * Atualiza quiet hours no ProactiveScheduler em runtime.
   * Electron envia esta request ao conectar com a config atual do electron-store.
   *
   * Body: { enabled: boolean, start: string, end: string }
   */
  router.post('/quiet-hours', (req: Request, res: Response) => {
    const { enabled, start, end } = req.body as {
      enabled: boolean;
      start: string;
      end: string;
    };

    ProactiveScheduler.updateQuietHours(enabled, start, end);
    return res.status(200).json({ ok: true });
  });

  // ── POST /folder-watch ────────────────────────────────────────────────────

  /**
   * Inicia ou para o monitoramento de pasta.
   * Electron envia esta request ao conectar com a config atual do electron-store.
   *
   * Body: { enabled: boolean, path: string }
   *
   * Segurança (T-67-03):
   *   - path deve existir (fs.existsSync)
   *   - path não pode ser diretório de sistema bloqueado
   */
  router.post('/folder-watch', async (req: Request, res: Response) => {
    const { enabled, path: folderPath } = req.body as {
      enabled: boolean;
      path: string;
    };

    if (enabled) {
      // T-67-03: validar existência
      if (!fs.existsSync(folderPath)) {
        return res.status(400).json({ error: 'path não existe ou não é acessível' });
      }

      // T-67-03: bloquear diretórios de sistema
      if (isBlockedSystemPath(folderPath)) {
        return res.status(400).json({ error: 'path é um diretório de sistema bloqueado' });
      }

      await watcher.startWatching(folderPath, (files) => {
        const evt: ProactiveEvent = {
          kind: 'folder_event',
          files,
          folderPath,
        };
        proactiveEmitter.emit('event', evt);
      });
    } else {
      await watcher.stopWatching();
    }

    return res.status(200).json({ ok: true });
  });

  // ── POST /daily-summary ───────────────────────────────────────────────────

  /**
   * Atualiza o horário do resumo diário e re-registra o cron job.
   * Electron envia esta request ao conectar com a config atual do electron-store
   * e quando o usuário altera o horário via Settings UI.
   *
   * Body: { enabled: boolean, time: string }  // time formato HH:MM
   */
  router.post('/daily-summary', (req: Request, res: Response) => {
    const { enabled, time } = req.body as {
      enabled: boolean;
      time: string;
    };

    if (enabled && time) {
      ProactiveScheduler.registerDailySummaryJob(time);
    }

    return res.status(200).json({ ok: true });
  });

  return router;
}
