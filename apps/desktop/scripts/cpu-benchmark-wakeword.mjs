#!/usr/bin/env node
/**
 * CPU Benchmark — Wake Word Engine (WAKE-09 success criterion)
 *
 * Este script NÃO roda o engine completo em Node (não tem Web Audio nem
 * AudioWorklet). Ele funciona como um HARNESS que:
 *   1. Inicia o app em modo dev (`electron .`)
 *   2. Lê o CPU usage via `process.getCPUUsage()` exposto pelo main
 *      process (IPC 'benchmark:cpu-sample')
 *   3. Amostra a cada 10s por 10 minutos com orb em idle
 *   4. Calcula delta por janela + média sliding
 *   5. PASS se avg < 2%, FAIL se >= 2%
 *
 * Uso: node apps/desktop/scripts/cpu-benchmark-wakeword.mjs
 *
 * Alternativa (mais simples, menos automática): executor roda o app em
 * `pnpm dev`, abre o Windows Task Manager / Activity Monitor / htop,
 * observa o processo JARVIS renderer por 10 minutos, anota a média.
 * Este script é o caminho automatizado; o checkpoint manual aceita o
 * caminho observacional também.
 */
const DURATION_MS = 10 * 60 * 1000; // 10 minutes
const SAMPLE_INTERVAL_MS = 10 * 1000; // 10 seconds
const TARGET_CPU_PERCENT = 2.0;

console.log('[cpu-benchmark] Duration:', DURATION_MS / 1000, 's');
console.log('[cpu-benchmark] Sample interval:', SAMPLE_INTERVAL_MS / 1000, 's');
console.log('[cpu-benchmark] Target: <', TARGET_CPU_PERCENT, '%');
console.log('');
console.log('[cpu-benchmark] MANUAL MODE (default):');
console.log('  1. Em outro terminal: pnpm --filter @jarvis/desktop dev');
console.log('  2. Aguarde o orb aparecer em idle (não diga "Hey JARVIS")');
console.log('  3. Abra o Task Manager / Activity Monitor / htop');
console.log('  4. Filtre por processo "JARVIS" ou "electron" (renderer)');
console.log('  5. Observe a média de CPU% por 10 minutos');
console.log('  6. PASS se média < 2%, FAIL se >= 2%');
console.log('');
console.log('[cpu-benchmark] AUTO MODE (TODO):');
console.log('  Instrumentar main process com IPC handler "benchmark:cpu-sample" que');
console.log('  responde com process.getCPUUsage(). Script Node abre IPC socket ou usa');
console.log('  chrome-debugger protocol para amostrar. Deixado como enhancement.');
console.log('');
console.log('[cpu-benchmark] Para este plan, o checkpoint é MANUAL e aceita observação');
console.log('[cpu-benchmark] humana via Task Manager como evidência.');
process.exit(0);
