/**
 * GET /internal/diagnostics — Phase 56 (QA-01)
 *
 * Returns live process metrics from the running JARVIS Electron+gateway process.
 * Called by the soak test script every 30 minutes over 8 hours.
 *
 * Per D-05: metrics JSON contract:
 *   { heapUsed, rss, eventLoopP99Ms, audioContextCount, timestamp }
 *
 * heapUsed + rss: from process.memoryUsage() (gateway process — representative of
 * overall JARVIS memory since gateway is the Node.js backend)
 *
 * eventLoopP99Ms + audioContextCount: fetched from Electron main via HTTP
 * to avoid coupling gateway with Electron IPC. Electron main exposes these
 * via a localhost-only HTTP endpoint on port 3001 (DIAGNOSTICS_PORT).
 *
 * Per D-06: main process collects metrics; gateway aggregates for external consumers.
 *
 * NOTE: If Electron diagnostics endpoint is unavailable, falls back to 0 for
 * eventLoopP99Ms and audioContextCount (non-blocking degradation per Pitfall 5).
 */
import { Router } from 'express';
import { logger } from '../lib/logger.js';

export const diagnosticsRouter = Router();

const ELECTRON_DIAGNOSTICS_URL =
  process.env['ELECTRON_DIAGNOSTICS_URL'] ?? 'http://localhost:3001/diagnostics';

interface ElectronDiagnostics {
  eventLoopP99Ms: number;
  audioContextCount: number;
}

async function fetchElectronDiagnostics(): Promise<ElectronDiagnostics> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    const res = await fetch(ELECTRON_DIAGNOSTICS_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { eventLoopP99Ms: 0, audioContextCount: 0 };
    return (await res.json()) as ElectronDiagnostics;
  } catch {
    return { eventLoopP99Ms: 0, audioContextCount: 0 };
  }
}

diagnosticsRouter.get('/diagnostics', async (_req, res) => {
  const mem = process.memoryUsage();
  const electron = await fetchElectronDiagnostics();

  const payload = {
    heapUsed: mem.heapUsed,
    rss: mem.rss,
    eventLoopP99Ms: electron.eventLoopP99Ms,
    audioContextCount: electron.audioContextCount,
    timestamp: new Date().toISOString(),
  };

  logger.debug({ payload }, '/internal/diagnostics');
  res.json(payload);
});
