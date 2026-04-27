#!/usr/bin/env node
/**
 * JARVIS Soak Test — Phase 44 (VHARD-01, D-07 to D-10)
 *
 * Valida estabilidade de heap em Always-Listening mode ao longo de 8 horas.
 * Mede process.memoryUsage().heapUsed (JS heap) E rss (processo completo).
 *
 * Execução: node --expose-gc apps/desktop/scripts/soak-test.ts
 *
 * PASS criterion: delta heapUsed < 10MB em 8h (D-09)
 * WARNING: Soak test dura 8 horas. Não rodar em CI. Usar antes de release.
 *
 * Pitfall 2 (RESEARCH.md): heapUsed estável com RSS crescendo = native leak.
 * Por isso medimos AMBOS. RSS growth >50MB também é sinalizado como WARNING.
 */

const BASELINE_DELAY_MS = 30_000;            // 30s warm-up antes do baseline (D-09)
const SAMPLE_INTERVAL_MS = 30 * 60 * 1000;   // 30 min entre amostras (D-09 Claude's Discretion)
const SOAK_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas total (D-09)
const HEAP_DELTA_FAIL_THRESHOLD_MB = 10;      // >10MB = FAIL (D-09)
const RSS_DELTA_WARN_THRESHOLD_MB = 50;       // >50MB RSS delta = WARNING (Pitfall 2)

interface MemSample {
  time: number;
  heapUsed: number;
  rss: number;
}

let baseline: MemSample | null = null;
const samples: MemSample[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;
let soakTimeoutId: ReturnType<typeof setTimeout> | null = null;

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

function sample(): MemSample {
  // D-09: força GC antes de medir se disponível (--expose-gc flag)
  // Pitfall 5 (RESEARCH.md): GC não-determinístico sem essa flag
  if (typeof (global as unknown as { gc?: () => void }).gc === 'function') {
    (global as unknown as { gc: () => void }).gc();
  }
  const mem = process.memoryUsage();
  return { time: Date.now(), heapUsed: mem.heapUsed, rss: mem.rss };
}

function logSample(s: MemSample, label: string): void {
  const elapsed = baseline ? ((s.time - baseline.time) / 1000 / 60).toFixed(1) : '0.0';
  console.log(
    `[${new Date(s.time).toISOString()}] ${label} | heap: ${mb(s.heapUsed)} MB | rss: ${mb(s.rss)} MB | t+${elapsed}min`,
  );
}

function report(reason: 'timeout' | 'sigint'): void {
  console.log('\n========================================');
  console.log(`JARVIS Soak Test — ${reason === 'timeout' ? '8h complete' : 'interrupted'}`);
  console.log('========================================');

  if (!baseline || samples.length === 0) {
    console.log('No samples collected — test did not run long enough for baseline.');
    process.exit(1);
  }

  const last = samples[samples.length - 1]!;
  const heapDeltaBytes = last.heapUsed - baseline.heapUsed;
  const rssDeltaBytes = last.rss - baseline.rss;
  const heapDeltaMb = heapDeltaBytes / 1024 / 1024;
  const rssDeltaMb = rssDeltaBytes / 1024 / 1024;

  console.log(`Baseline (t+30s):  heap=${mb(baseline.heapUsed)} MB  rss=${mb(baseline.rss)} MB`);
  console.log(`Final    (t+${((last.time - baseline.time) / 1000 / 60 / 60).toFixed(1)}h): heap=${mb(last.heapUsed)} MB  rss=${mb(last.rss)} MB`);
  console.log(`Delta heap: ${heapDeltaMb >= 0 ? '+' : ''}${heapDeltaMb.toFixed(2)} MB`);
  console.log(`Delta rss:  ${rssDeltaMb >= 0 ? '+' : ''}${rssDeltaMb.toFixed(2)} MB`);
  console.log(`Samples collected: ${samples.length}`);
  console.log('');

  const heapPass = heapDeltaMb < HEAP_DELTA_FAIL_THRESHOLD_MB;
  const rssWarn = rssDeltaMb > RSS_DELTA_WARN_THRESHOLD_MB;

  if (rssWarn) {
    console.warn(
      `WARNING: RSS delta ${rssDeltaMb.toFixed(2)} MB > ${RSS_DELTA_WARN_THRESHOLD_MB} MB — possível native memory leak (Whisper.cpp, ONNX, áudio)`,
    );
  }

  if (heapPass) {
    console.log(`PASS — heap delta ${heapDeltaMb.toFixed(2)} MB < ${HEAP_DELTA_FAIL_THRESHOLD_MB} MB threshold`);
    process.exit(0);
  } else {
    console.error(`FAIL — heap delta ${heapDeltaMb.toFixed(2)} MB >= ${HEAP_DELTA_FAIL_THRESHOLD_MB} MB threshold`);
    process.exit(1);
  }
}

function cleanup(reason: 'timeout' | 'sigint'): void {
  if (intervalId) clearInterval(intervalId);
  if (soakTimeoutId) clearTimeout(soakTimeoutId);
  report(reason);
}

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  console.log('\n[soak-test] Interrupted — generating partial report...');
  cleanup('sigint');
});

console.log('========================================');
console.log('JARVIS Soak Test — Phase 44 (VHARD-01)');
console.log('========================================');
console.log(`Start time: ${new Date().toISOString()}`);
console.log(`Baseline delay: ${BASELINE_DELAY_MS / 1000}s warm-up`);
console.log(`Sample interval: ${SAMPLE_INTERVAL_MS / 1000 / 60} min`);
console.log(`Total duration: ${SOAK_DURATION_MS / 1000 / 60 / 60}h`);
console.log(`PASS threshold: heap delta < ${HEAP_DELTA_FAIL_THRESHOLD_MB} MB`);
console.log(
  `GC available: ${typeof (global as unknown as { gc?: () => void }).gc === 'function' ? 'YES (--expose-gc)' : 'NO (use node --expose-gc for better accuracy)'}`,
);
console.log('');
console.log(`Waiting ${BASELINE_DELAY_MS / 1000}s for warm-up...`);

setTimeout(() => {
  baseline = sample();
  logSample(baseline, 'BASELINE');
  console.log(`Sampling every ${SAMPLE_INTERVAL_MS / 1000 / 60} min for ${SOAK_DURATION_MS / 1000 / 60 / 60}h...`);

  intervalId = setInterval(() => {
    const s = sample();
    samples.push(s);
    logSample(s, `SAMPLE[${samples.length}]`);
  }, SAMPLE_INTERVAL_MS);

  soakTimeoutId = setTimeout(() => {
    cleanup('timeout');
  }, SOAK_DURATION_MS);
}, BASELINE_DELAY_MS);
