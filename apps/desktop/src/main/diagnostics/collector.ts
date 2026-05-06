/**
 * Diagnostics Collector — Phase 56 (QA-01)
 *
 * Collects Electron main process metrics for the soak test:
 * - heap/RSS via process.memoryUsage() (sampled on request)
 * - event loop p99 via perf_hooks.monitorEventLoopDelay() (cumulative since startup)
 * - audioContextCount via executeJavaScript bridge from renderer (pulled on request)
 *
 * Per D-02: event loop measured in main process only — measuring via IPC would
 * contaminate the measurement.
 * Per D-06: main process aggregates all metrics and exposes them via HTTP server.
 */

import { monitorEventLoopDelay } from 'perf_hooks';
import http from 'node:http';

let histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;

const DIAGNOSTICS_PORT = parseInt(process.env['ELECTRON_DIAGNOSTICS_PORT'] ?? '3001', 10);
let diagnosticsServer: http.Server | null = null;

/**
 * Call once at app startup (before window creation).
 * Resolution=10 means histogram samples every 10ms — low overhead, accurate p99.
 * Idempotent — safe to call twice.
 */
export function initEventLoopMonitoring(): void {
  if (histogram) return;
  histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
}

/**
 * Returns the cumulative p99 event loop delay in milliseconds since monitoring started.
 * Returns 0 if monitoring was not initialized or histogram has no samples yet.
 */
export function getEventLoopP99(): number {
  if (!histogram) return 0;
  try {
    // histogram.percentile(99) returns nanoseconds — convert to ms
    return histogram.percentile(99) / 1_000_000;
  } catch {
    return 0;
  }
}

/**
 * Disables the histogram at shutdown. Call during app 'will-quit'.
 */
export function disableEventLoopMonitoring(): void {
  if (histogram) {
    histogram.disable();
    histogram = null;
  }
}

/**
 * Starts a localhost-only HTTP server on port 3001 (DIAGNOSTICS_PORT) that the
 * gateway /internal/diagnostics route polls for Electron-side metrics.
 *
 * Per D-06: main process exposes metrics to gateway via HTTP (simpler than IPC bridge).
 * Per Pitfall 5: non-blocking degradation — server errors are caught and return 0.
 *
 * getAudioContextCount is async because it uses webContents.executeJavaScript()
 * to read window.__audioContextCount from the renderer process.
 */
export function startDiagnosticsServer(getAudioContextCount: () => Promise<number>): void {
  if (diagnosticsServer) return;

  diagnosticsServer = http.createServer(async (req, res) => {
    if (req.url === '/diagnostics' && req.method === 'GET') {
      try {
        const audioCtxCount = await getAudioContextCount();
        const payload = JSON.stringify({
          eventLoopP99Ms: getEventLoopP99(),
          audioContextCount: typeof audioCtxCount === 'number' ? audioCtxCount : 0,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(payload);
      } catch {
        // Degraded fallback — never crash the server
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ eventLoopP99Ms: getEventLoopP99(), audioContextCount: 0 }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  diagnosticsServer.listen(DIAGNOSTICS_PORT, '127.0.0.1', () => {
    console.log(`[diagnostics] server listening on 127.0.0.1:${DIAGNOSTICS_PORT}`);
  });

  diagnosticsServer.on('error', (err) => {
    console.error('[diagnostics] server error:', err);
  });
}

/**
 * Stops the diagnostics HTTP server. Call during app 'will-quit'.
 */
export function stopDiagnosticsServer(): void {
  if (diagnosticsServer) {
    diagnosticsServer.close();
    diagnosticsServer = null;
  }
}
