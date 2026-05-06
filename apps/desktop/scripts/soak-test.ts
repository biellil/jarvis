#!/usr/bin/env node
/**
 * JARVIS Soak Test — Phase 56 (QA-01)
 *
 * Validates Always-Listening mode stability over 8 hours by polling
 * GET /internal/diagnostics every 30 minutes.
 *
 * Execution (full 8h):
 *   node --expose-gc apps/desktop/scripts/soak-test.ts
 *
 * Execution (1-minute quick test):
 *   node --expose-gc apps/desktop/scripts/soak-test.ts --duration 60000
 *
 * Requirements (QA-01):
 *   heap delta FAIL   : > 100 MB
 *   RSS delta FAIL    : > 200 MB
 *   event loop p99    : > 50 ms  (any sample)
 *   audioContext count: > 1      (any sample = FAIL)
 *
 * Output: soak-report-{timestamp}.html with Chart.js visualization
 *
 * Phase 44 differences:
 *   - HTTP polling instead of local process.memoryUsage()
 *   - 4-metric validation (+ event loop p99 + audioContextCount)
 *   - Thresholds updated: 100MB / 200MB / 50ms / 1
 *   - HTML report instead of console-only output
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================
// Configuration — QA-01 thresholds (D-07)
// ============================================

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const BASELINE_DELAY_MS = 30_000; // 30s warm-up before baseline

// Parse --duration flag for quick tests
const durationArg = process.argv.indexOf('--duration');
const SOAK_DURATION_MS =
  durationArg !== -1 && process.argv[durationArg + 1]
    ? parseInt(process.argv[durationArg + 1]!, 10)
    : 8 * 60 * 60 * 1000; // default: 8 hours

// Sample every 30 min in full mode; every 10s in quick mode (< 2 min)
const SAMPLE_INTERVAL_MS =
  SOAK_DURATION_MS < 2 * 60 * 1000 ? 10_000 : 30 * 60 * 1000;

// QA-01 thresholds (D-07)
const HEAP_DELTA_FAIL_THRESHOLD_MB = 100;
const RSS_DELTA_FAIL_THRESHOLD_MB = 200;
const EVENT_LOOP_P99_FAIL_THRESHOLD_MS = 50;
const AUDIO_CONTEXT_FAIL_THRESHOLD = 1; // count > 1 = FAIL

// ============================================
// Types
// ============================================

interface DiagnosticsResponse {
  heapUsed: number;
  rss: number;
  eventLoopP99Ms: number;
  audioContextCount: number;
  timestamp: string;
}

interface SoakSample {
  time: number;
  heapUsed: number;
  rss: number;
  eventLoopP99Ms: number;
  audioContextCount: number;
}

// ============================================
// State
// ============================================

let baseline: SoakSample | null = null;
const samples: SoakSample[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;
let soakTimeoutId: ReturnType<typeof setTimeout> | null = null;
let testPassed = true; // set to false on any QA-01 violation

// ============================================
// Utilities
// ============================================

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

function elapsed(fromTime: number): string {
  const mins = ((Date.now() - fromTime) / 1000 / 60).toFixed(1);
  return `t+${mins}min`;
}

// ============================================
// HTTP polling (Pitfall 5: timeout + retry)
// ============================================

async function fetchDiagnostics(attempt = 1): Promise<SoakSample | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${GATEWAY_URL}/internal/diagnostics`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[soak-test] /internal/diagnostics returned ${res.status}`);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2_000 * attempt));
        return fetchDiagnostics(attempt + 1);
      }
      return null;
    }

    const data = (await res.json()) as DiagnosticsResponse;
    return {
      time: Date.now(),
      heapUsed: data.heapUsed,
      rss: data.rss,
      eventLoopP99Ms: data.eventLoopP99Ms,
      audioContextCount: data.audioContextCount,
    };
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[soak-test] fetch error (attempt ${attempt}): ${msg}`);
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 2_000 * attempt));
      return fetchDiagnostics(attempt + 1);
    }
    return null;
  }
}

// ============================================
// Sample logging
// ============================================

function logSample(s: SoakSample, label: string): void {
  const elapsedStr = baseline ? elapsed(baseline.time) : 't+0';
  const heapDeltaMb = baseline ? (s.heapUsed - baseline.heapUsed) / 1024 / 1024 : 0;
  const rssDeltaMb = baseline ? (s.rss - baseline.rss) / 1024 / 1024 : 0;
  console.log(
    `[${new Date(s.time).toISOString()}] ${label} | ` +
    `heap=${mb(s.heapUsed)}MB (Δ${heapDeltaMb >= 0 ? '+' : ''}${heapDeltaMb.toFixed(2)}MB) | ` +
    `rss=${mb(s.rss)}MB (Δ${rssDeltaMb >= 0 ? '+' : ''}${rssDeltaMb.toFixed(2)}MB) | ` +
    `p99=${s.eventLoopP99Ms.toFixed(1)}ms | ` +
    `ctx=${s.audioContextCount} | ` +
    `${elapsedStr}`,
  );

  // Real-time FAIL checks (audioContextCount and p99 fail immediately)
  if (s.audioContextCount > AUDIO_CONTEXT_FAIL_THRESHOLD) {
    console.error(`[soak-test] FAIL — audioContextCount=${s.audioContextCount} > ${AUDIO_CONTEXT_FAIL_THRESHOLD} (memory leak detected)`);
    testPassed = false;
  }
  if (s.eventLoopP99Ms > EVENT_LOOP_P99_FAIL_THRESHOLD_MS) {
    console.error(`[soak-test] FAIL — event loop p99=${s.eventLoopP99Ms.toFixed(1)}ms > ${EVENT_LOOP_P99_FAIL_THRESHOLD_MS}ms`);
    testPassed = false;
  }
}

// ============================================
// HTML Report generation (D-03)
// ============================================

function generateHtmlReport(baselineSample: SoakSample, allSamples: SoakSample[]): string {
  const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.resolve(process.cwd(), `soak-report-${reportTimestamp}.html`);

  const last = allSamples[allSamples.length - 1] ?? baselineSample;
  const heapDeltaMb = (last.heapUsed - baselineSample.heapUsed) / 1024 / 1024;
  const rssDeltaMb = (last.rss - baselineSample.rss) / 1024 / 1024;
  const maxP99 = Math.max(...allSamples.map(s => s.eventLoopP99Ms), 0);
  const maxCtx = Math.max(...allSamples.map(s => s.audioContextCount), 0);

  const heapPass = heapDeltaMb < HEAP_DELTA_FAIL_THRESHOLD_MB;
  const rssPass = rssDeltaMb < RSS_DELTA_FAIL_THRESHOLD_MB;
  const p99Pass = maxP99 < EVENT_LOOP_P99_FAIL_THRESHOLD_MS;
  const ctxPass = maxCtx <= AUDIO_CONTEXT_FAIL_THRESHOLD;
  const overallPass = heapPass && rssPass && p99Pass && ctxPass;

  // Chart data
  const labels = JSON.stringify([
    'baseline',
    ...allSamples.map(s => `t+${(((s.time - baselineSample.time) / 1000 / 60)).toFixed(0)}m`),
  ]);
  const heapMbData = JSON.stringify([
    baselineSample.heapUsed / 1024 / 1024,
    ...allSamples.map(s => s.heapUsed / 1024 / 1024),
  ]);
  const rssMbData = JSON.stringify([
    baselineSample.rss / 1024 / 1024,
    ...allSamples.map(s => s.rss / 1024 / 1024),
  ]);
  const p99Data = JSON.stringify([
    baselineSample.eventLoopP99Ms,
    ...allSamples.map(s => s.eventLoopP99Ms),
  ]);
  const ctxData = JSON.stringify([
    baselineSample.audioContextCount,
    ...allSamples.map(s => s.audioContextCount),
  ]);
  const heapBaselineMb = baselineSample.heapUsed / 1024 / 1024;
  const rssBaselineMb = baselineSample.rss / 1024 / 1024;
  const heapFailLine = JSON.stringify(Array(allSamples.length + 1).fill(heapBaselineMb + HEAP_DELTA_FAIL_THRESHOLD_MB));
  const rssFailLine = JSON.stringify(Array(allSamples.length + 1).fill(rssBaselineMb + RSS_DELTA_FAIL_THRESHOLD_MB));
  const p99FailLine = JSON.stringify(Array(allSamples.length + 1).fill(EVENT_LOOP_P99_FAIL_THRESHOLD_MS));

  const samplesTableRows = [baselineSample, ...allSamples]
    .map((s, i) => {
      const label = i === 0 ? 'baseline' : `sample[${i}]`;
      return `<tr>
        <td>${label}</td>
        <td>${new Date(s.time).toISOString()}</td>
        <td>${(s.heapUsed / 1024 / 1024).toFixed(2)}</td>
        <td>${(s.rss / 1024 / 1024).toFixed(2)}</td>
        <td>${s.eventLoopP99Ms.toFixed(2)}</td>
        <td style="color:${s.audioContextCount > AUDIO_CONTEXT_FAIL_THRESHOLD ? 'red' : 'green'}">${s.audioContextCount}</td>
      </tr>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>JARVIS Soak Test Report — ${reportTimestamp}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.min.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1100px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 1.5rem; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 1.1rem; }
    .pass { background: #d4edda; color: #155724; }
    .fail { background: #f8d7da; color: #721c24; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .metric { border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; }
    .metric-value { font-size: 1.4rem; font-weight: bold; }
    .chart-container { width: 100%; height: 300px; margin: 24px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { border: 1px solid #dee2e6; padding: 6px 10px; text-align: left; }
    th { background: #f8f9fa; }
  </style>
</head>
<body>
  <h1>JARVIS Soak Test Report</h1>
  <p><strong>Overall Result:</strong> <span class="badge ${overallPass ? 'pass' : 'fail'}">${overallPass ? 'PASS' : 'FAIL'}</span></p>
  <p>Generated: ${new Date().toISOString()} | Duration: ${SOAK_DURATION_MS / 1000 / 60 / 60}h | Samples: ${allSamples.length}</p>

  <div class="metrics">
    <div class="metric">
      <div>Heap Delta</div>
      <div class="metric-value" style="color:${heapPass ? 'green' : 'red'}">${heapDeltaMb >= 0 ? '+' : ''}${heapDeltaMb.toFixed(1)} MB</div>
      <div>Threshold: &lt; ${HEAP_DELTA_FAIL_THRESHOLD_MB} MB</div>
    </div>
    <div class="metric">
      <div>RSS Delta</div>
      <div class="metric-value" style="color:${rssPass ? 'green' : 'red'}">${rssDeltaMb >= 0 ? '+' : ''}${rssDeltaMb.toFixed(1)} MB</div>
      <div>Threshold: &lt; ${RSS_DELTA_FAIL_THRESHOLD_MB} MB</div>
    </div>
    <div class="metric">
      <div>Event Loop p99 (max)</div>
      <div class="metric-value" style="color:${p99Pass ? 'green' : 'red'}">${maxP99.toFixed(1)} ms</div>
      <div>Threshold: &lt; ${EVENT_LOOP_P99_FAIL_THRESHOLD_MS} ms</div>
    </div>
    <div class="metric">
      <div>AudioContext Count (max)</div>
      <div class="metric-value" style="color:${ctxPass ? 'green' : 'red'}">${maxCtx}</div>
      <div>Threshold: = ${AUDIO_CONTEXT_FAIL_THRESHOLD}</div>
    </div>
  </div>

  <h2>Memory (Heap &amp; RSS)</h2>
  <div class="chart-container"><canvas id="memChart"></canvas></div>

  <h2>Event Loop p99</h2>
  <div class="chart-container"><canvas id="p99Chart"></canvas></div>

  <h2>AudioContext Count</h2>
  <div class="chart-container"><canvas id="ctxChart"></canvas></div>

  <h2>Samples</h2>
  <table>
    <thead><tr><th>Label</th><th>Timestamp</th><th>Heap (MB)</th><th>RSS (MB)</th><th>p99 (ms)</th><th>AudioCtx</th></tr></thead>
    <tbody>${samplesTableRows}</tbody>
  </table>

  <script>
    const labels = ${labels};
    const heapMb = ${heapMbData};
    const rssMb = ${rssMbData};
    const p99 = ${p99Data};
    const ctx = ${ctxData};
    const heapFail = ${heapFailLine};
    const rssFail = ${rssFailLine};
    const p99Fail = ${p99FailLine};

    new Chart(document.getElementById('memChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Heap (MB)', data: heapMb, borderColor: 'rgb(54,162,235)', borderWidth: 2, fill: false },
          { label: 'RSS (MB)', data: rssMb, borderColor: 'rgb(75,192,192)', borderWidth: 2, fill: false },
          { label: 'Heap FAIL threshold', data: heapFail, borderColor: 'rgba(255,99,132,0.8)', borderDash: [6,4], borderWidth: 1, pointRadius: 0, fill: false },
          { label: 'RSS FAIL threshold', data: rssFail, borderColor: 'rgba(255,159,64,0.8)', borderDash: [6,4], borderWidth: 1, pointRadius: 0, fill: false },
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { title: { display: true, text: 'MB' } } } }
    });

    new Chart(document.getElementById('p99Chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Event Loop p99 (ms)', data: p99, borderColor: 'rgb(153,102,255)', borderWidth: 2, fill: false },
          { label: 'FAIL threshold (50ms)', data: p99Fail, borderColor: 'rgba(255,99,132,0.8)', borderDash: [6,4], borderWidth: 1, pointRadius: 0, fill: false },
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { title: { display: true, text: 'ms' } } } }
    });

    new Chart(document.getElementById('ctxChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'AudioContext Count', data: ctx, borderColor: 'rgb(255,205,86)', borderWidth: 2, fill: false },
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 3, ticks: { stepSize: 1 }, title: { display: true, text: 'count' } } } }
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(`\n[soak-test] HTML report written to: ${outputPath}`);
  return outputPath;
}

// ============================================
// Final report + exit
// ============================================

function finalReport(reason: 'timeout' | 'sigint'): void {
  console.log('\n========================================');
  console.log(`JARVIS Soak Test — Phase 56 (QA-01) — ${reason === 'timeout' ? 'complete' : 'interrupted'}`);
  console.log('========================================');

  if (!baseline || samples.length === 0) {
    console.log('No samples collected — test did not run long enough for baseline.');
    process.exit(1);
  }

  const last = samples[samples.length - 1]!;
  const heapDeltaMb = (last.heapUsed - baseline.heapUsed) / 1024 / 1024;
  const rssDeltaMb = (last.rss - baseline.rss) / 1024 / 1024;

  console.log(`Baseline:  heap=${mb(baseline.heapUsed)} MB  rss=${mb(baseline.rss)} MB`);
  console.log(`Final:     heap=${mb(last.heapUsed)} MB  rss=${mb(last.rss)} MB`);
  console.log(`Delta heap: ${heapDeltaMb >= 0 ? '+' : ''}${heapDeltaMb.toFixed(2)} MB  (FAIL > ${HEAP_DELTA_FAIL_THRESHOLD_MB} MB)`);
  console.log(`Delta rss:  ${rssDeltaMb >= 0 ? '+' : ''}${rssDeltaMb.toFixed(2)} MB  (FAIL > ${RSS_DELTA_FAIL_THRESHOLD_MB} MB)`);
  console.log(`Samples collected: ${samples.length}`);

  // Final delta checks
  if (heapDeltaMb >= HEAP_DELTA_FAIL_THRESHOLD_MB) {
    console.error(`FAIL — heap delta ${heapDeltaMb.toFixed(2)} MB >= ${HEAP_DELTA_FAIL_THRESHOLD_MB} MB`);
    testPassed = false;
  }
  if (rssDeltaMb >= RSS_DELTA_FAIL_THRESHOLD_MB) {
    console.error(`FAIL — RSS delta ${rssDeltaMb.toFixed(2)} MB >= ${RSS_DELTA_FAIL_THRESHOLD_MB} MB`);
    testPassed = false;
  }

  // Generate HTML report
  generateHtmlReport(baseline, samples);

  if (testPassed) {
    console.log(`\nPASS — All QA-01 criteria met`);
    process.exit(0);
  } else {
    console.error(`\nFAIL — One or more QA-01 criteria exceeded`);
    process.exit(1);
  }
}

function cleanup(reason: 'timeout' | 'sigint'): void {
  if (intervalId) clearInterval(intervalId);
  if (soakTimeoutId) clearTimeout(soakTimeoutId);
  finalReport(reason);
}

// ============================================
// Startup
// ============================================

process.on('SIGINT', () => {
  console.log('\n[soak-test] Interrupted — generating partial report...');
  cleanup('sigint');
});

console.log('========================================');
console.log('JARVIS Soak Test — Phase 56 (QA-01)');
console.log('========================================');
console.log(`Start time: ${new Date().toISOString()}`);
console.log(`Gateway URL: ${GATEWAY_URL}`);
console.log(`Baseline delay: ${BASELINE_DELAY_MS / 1000}s warm-up`);
console.log(`Sample interval: ${SAMPLE_INTERVAL_MS / 1000 / 60} min`);
console.log(`Total duration: ${SOAK_DURATION_MS / 1000 / 60 / 60}h`);
console.log(`Thresholds: heap Δ<${HEAP_DELTA_FAIL_THRESHOLD_MB}MB | RSS Δ<${RSS_DELTA_FAIL_THRESHOLD_MB}MB | p99<${EVENT_LOOP_P99_FAIL_THRESHOLD_MS}ms | ctx=1`);
console.log('');
console.log(`Waiting ${BASELINE_DELAY_MS / 1000}s for warm-up...`);

setTimeout(async () => {
  baseline = await fetchDiagnostics();
  if (!baseline) {
    console.error('[soak-test] Failed to establish baseline — is JARVIS running on ' + GATEWAY_URL + '?');
    process.exit(1);
  }
  logSample(baseline, 'BASELINE');
  console.log(`Sampling every ${SAMPLE_INTERVAL_MS / 1000 / 60} min for ${SOAK_DURATION_MS / 1000 / 60 / 60}h...`);

  intervalId = setInterval(async () => {
    const s = await fetchDiagnostics();
    if (s) {
      samples.push(s);
      logSample(s, `SAMPLE[${samples.length}]`);
    } else {
      console.warn(`[soak-test] SAMPLE[${samples.length + 1}] fetch failed — skipping sample`);
    }
  }, SAMPLE_INTERVAL_MS);

  soakTimeoutId = setTimeout(() => {
    cleanup('timeout');
  }, SOAK_DURATION_MS);
}, BASELINE_DELAY_MS);
