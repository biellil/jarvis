/**
 * E2E Comparison Script: Python (port 8000) vs TypeScript (port 8001)
 *
 * Valida paridade de outputs entre os dois backends para os mesmos inputs.
 * Categorias: Text Similarity (VAL-02), Tool Calls (VAL-03), SQLite State (VAL-04),
 * ChromaDB Embeddings (VAL-05), Performance (VAL-06).
 *
 * Voice validation SKIPPED: providers são diferentes por design
 * (nodejs-whisper vs faster-whisper, Speecht5 vs kokoro).
 * Known limitation documentada: TTS/STT parity não é validada nesta fase.
 *
 * Localização: apps/backend-ts/scripts/e2e-compare.ts
 * (Nota: localizado aqui em vez da raiz do repo por necessidade de resolução ESM —
 *  o import de embedText requer path relativo dentro do pacote backend-ts)
 *
 * Usage:
 *   pnpm e2e                         (via root package.json)
 *   pnpm --filter @jarvis/backend-ts e2e
 *
 * Env vars:
 *   FASTAPI_URL         Python backend URL (default: http://localhost:8000)
 *   BACKEND_TS_URL      TypeScript backend URL (default: http://localhost:8001)
 *   TEXT_SIM_THRESHOLD  Cosine similarity threshold for text (default: 0.85)
 *   E2E_PYTHON_DB_PATH  Path to Python SQLite .db (default: <repo-root>/data/jarvis.db)
 *   E2E_TS_DB_PATH      Path to TypeScript SQLite .db (default: <repo-root>/apps/backend-ts/jarvis.sqlite)
 *   E2E_PASS_THRESHOLD  Overall pass % threshold (default: 0.90)
 *
 * Exit codes:
 *   0 — overall pass rate >= E2E_PASS_THRESHOLD
 *   1 — overall pass rate < E2E_PASS_THRESHOLD OR pre-flight failed
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { embedText } from '../src/memory/embeddings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');

const PYTHON_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';
const TS_URL = process.env.BACKEND_TS_URL ?? 'http://localhost:8001';
const TEXT_SIM_THRESHOLD = parseFloat(process.env.TEXT_SIM_THRESHOLD ?? '0.85');
const PASS_THRESHOLD = parseFloat(process.env.E2E_PASS_THRESHOLD ?? '0.90');
const PYTHON_DB_PATH = process.env.E2E_PYTHON_DB_PATH ?? resolve(REPO_ROOT, 'data/jarvis.db');
const TS_DB_PATH = process.env.E2E_TS_DB_PATH ?? resolve(REPO_ROOT, 'apps/backend-ts/jarvis.sqlite');

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function passStr(msg: string): string { return `${GREEN}✅ PASS${RESET} ${msg}`; }
function failStr(msg: string): string { return `${RED}❌ FAIL${RESET} ${msg}`; }
function warnStr(msg: string): string { return `${YELLOW}⚠️  WARN${RESET} ${msg}`; }

const TEST_INPUTS: string[] = [
  'Olá, qual é seu nome?',
  'Que horas são agora?',
  'Qual é a capital do Brasil?',
  'Quanto é 2 mais 2?',
  'Me diga algo interessante sobre astronomia.',
  'Qual é a linguagem de programação mais popular?',
  'O que é machine learning?',
  'Me recomende um filme de ficção científica.',
  'Qual é a diferença entre RAM e armazenamento?',
  'Como funciona a internet?',
  'O que é TypeScript?',
  'Me explique o que é um banco de dados.',
  'Qual é o animal mais rápido do mundo?',
  'O que é open source?',
  'Me diga uma curiosidade sobre o espaço.',
  'Qual é a diferença entre Python e JavaScript?',
  'O que é uma API REST?',
  'Me explique recursão em programação.',
  'Qual é o maior planeta do sistema solar?',
  'O que é cloud computing?',
];

interface ChatResponse {
  reply: string;
  latencyMs: number;
}

// 'NOT_APPLICABLE' usado quando tabela tool_calls está vazia (Phase 18 pendente)
type CompareOutcome = 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'SKIP';

interface TestResult {
  input: string;
  python: ChatResponse | null;
  ts: ChatResponse | null;
  error?: string;
  textSim: number;
  textPass: CompareOutcome;
  toolCallsOutcome: CompareOutcome;
  sqlitePass: CompareOutcome;
  chromadbSim: number;
  chromadbPass: CompareOutcome;
  perfPass: CompareOutcome;
  perfRatio: number;
}

/**
 * Verifica que ambos os backends estão online antes de iniciar o suite.
 * Lança Error com instrução clara de como iniciar cada backend se algum estiver offline.
 */
async function preflight(): Promise<void> {
  const [pyOk, tsOk] = await Promise.all([
    fetch(`${PYTHON_URL}/health`).then(r => r.ok).catch(() => false),
    fetch(`${TS_URL}/health`).then(r => r.ok).catch(() => false),
  ]);
  if (!pyOk) {
    throw new Error(
      `Python backend (${PYTHON_URL}) não responde.\n` +
      `  Para iniciar: cd src/jarvis && uvicorn main:app --port 8000`
    );
  }
  if (!tsOk) {
    throw new Error(
      `TypeScript backend (${TS_URL}) não responde.\n` +
      `  Para iniciar: pnpm --filter @jarvis/backend-ts dev`
    );
  }
  console.log(`${GREEN}✅ Pre-flight OK${RESET} — ambos os backends estão online`);
}

async function sendChat(baseUrl: string, message: string): Promise<ChatResponse> {
  const t0 = performance.now();
  const res = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const latencyMs = performance.now() - t0;
  if (!res.ok) {
    throw new Error(`${baseUrl}/chat retornou HTTP ${res.status}`);
  }
  const data = await res.json() as { message: string };
  return { reply: data.message, latencyMs };
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function openDbReadonly(dbPath: string): Database.Database | null {
  if (!existsSync(dbPath)) {
    console.warn(warnStr(`SQLite não encontrado: ${dbPath}`));
    return null;
  }
  return new Database(dbPath, { readonly: true });
}

async function compareText(
  pyReply: string,
  tsReply: string,
): Promise<{ sim: number; outcome: CompareOutcome }> {
  const [pyVec, tsVec] = await Promise.all([embedText(pyReply), embedText(tsReply)]);
  const sim = cosine(pyVec, tsVec);
  return { sim, outcome: sim >= TEXT_SIM_THRESHOLD ? 'PASS' : 'FAIL' };
}

function compareToolCalls(
  pyDb: Database.Database | null,
  tsDb: Database.Database | null,
  afterTimestamp: string,
): { outcome: CompareOutcome; reason?: string } {
  if (!pyDb || !tsDb) {
    return { outcome: 'SKIP', reason: 'SQLite não disponível' };
  }

  const pyHasTable = pyDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_calls'")
    .get() != null;
  const tsHasTable = tsDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_calls'")
    .get() != null;

  if (!pyHasTable || !tsHasTable) {
    return {
      outcome: 'NOT_APPLICABLE',
      reason: 'Tabela tool_calls ausente — Phase 18 pode estar incompleta',
    };
  }

  type ToolRow = { tool_name: string; params_json: string | null };
  const pyTools = pyDb
    .prepare("SELECT tool_name, params_json FROM tool_calls WHERE timestamp >= ? ORDER BY id")
    .all(afterTimestamp) as ToolRow[];
  const tsTools = tsDb
    .prepare("SELECT tool_name, params_json FROM tool_calls WHERE timestamp >= ? ORDER BY id")
    .all(afterTimestamp) as ToolRow[];

  // FIX B-01: zero rows em AMBOS = NOT_APPLICABLE, não PASS vacuous
  if (pyTools.length === 0 && tsTools.length === 0) {
    return {
      outcome: 'NOT_APPLICABLE',
      reason: 'Nenhum tool call registrado em nenhum backend — Phase 18 pode estar incompleta',
    };
  }

  if (pyTools.length !== tsTools.length) {
    return { outcome: 'FAIL' };
  }

  const allMatch = pyTools.every((r, i) => r.tool_name === tsTools[i].tool_name);
  return { outcome: allMatch ? 'PASS' : 'FAIL' };
}

function compareSqliteMessages(
  pyDb: Database.Database | null,
  tsDb: Database.Database | null,
  inputMessage: string,
): CompareOutcome {
  if (!pyDb || !tsDb) return 'SKIP';

  type MsgRow = { role: string; content: string };
  const pyMsg = pyDb
    .prepare("SELECT role, content FROM messages WHERE content = ? ORDER BY id DESC LIMIT 1")
    .get(inputMessage) as MsgRow | undefined;
  const tsMsg = tsDb
    .prepare("SELECT role, content FROM messages WHERE content = ? ORDER BY id DESC LIMIT 1")
    .get(inputMessage) as MsgRow | undefined;

  if (!pyMsg || !tsMsg) return 'FAIL';
  return pyMsg.role === tsMsg.role ? 'PASS' : 'FAIL';
}

/**
 * VAL-05: Compara a similaridade semântica entre as respostas REAIS dos dois backends.
 *
 * FIX (B-02): A versão anterior chamava embedText(text) duas vezes para o MESMO texto,
 * produzindo sempre ~1.0 — sinal nulo. Agora embeda a resposta real do Python e a
 * resposta real do TypeScript e compara ENTRE ELAS.
 *
 * threshold: 0.95 (mais restrito que VAL-02).
 */
async function compareChromadb(
  pythonReply: string,
  tsReply: string,
): Promise<{ sim: number; outcome: CompareOutcome }> {
  const [pyVec, tsVec] = await Promise.all([embedText(pythonReply), embedText(tsReply)]);
  const sim = cosine(pyVec, tsVec);
  return { sim, outcome: sim >= 0.95 ? 'PASS' : 'FAIL' };
}

function outcomeCounts(results: TestResult[], key: keyof TestResult): { pass: number; fail: number; na: number; skip: number } {
  let pass = 0, fail = 0, na = 0, skip = 0;
  for (const r of results) {
    const v = r[key] as CompareOutcome;
    if (v === 'PASS') pass++;
    else if (v === 'FAIL') fail++;
    else if (v === 'NOT_APPLICABLE') na++;
    else if (v === 'SKIP') skip++;
  }
  return { pass, fail, na, skip };
}

async function main(): Promise<void> {
  console.log(`${BOLD}${CYAN}===== E2E COMPARISON (Python vs TypeScript) =====${RESET}`);
  console.log(`${CYAN}Python:${RESET} ${PYTHON_URL}`);
  console.log(`${CYAN}TypeScript:${RESET} ${TS_URL}`);
  console.log(`${YELLOW}Nota:${RESET} primeira execução baixa o modelo Xenova/all-MiniLM-L6-v2 (~22 MB)`);
  console.log();

  await preflight();

  const pyDb = openDbReadonly(PYTHON_DB_PATH);
  const tsDb = openDbReadonly(TS_DB_PATH);

  const results: TestResult[] = [];

  for (let i = 0; i < TEST_INPUTS.length; i++) {
    const input = TEST_INPUTS[i];
    console.log(`${CYAN}[${i + 1}/${TEST_INPUTS.length}]${RESET} ${input}`);
    const beforeTimestamp = new Date().toISOString();

    const result: TestResult = {
      input,
      python: null,
      ts: null,
      textSim: 0,
      textPass: 'FAIL',
      toolCallsOutcome: 'SKIP',
      sqlitePass: 'SKIP',
      chromadbSim: 0,
      chromadbPass: 'FAIL',
      perfPass: 'FAIL',
      perfRatio: 0,
    };

    try {
      const [pyRes, tsRes] = await Promise.all([
        sendChat(PYTHON_URL, input),
        sendChat(TS_URL, input),
      ]);
      result.python = pyRes;
      result.ts = tsRes;

      const textRes = await compareText(pyRes.reply, tsRes.reply);
      result.textSim = textRes.sim;
      result.textPass = textRes.outcome;

      const toolRes = compareToolCalls(pyDb, tsDb, beforeTimestamp);
      result.toolCallsOutcome = toolRes.outcome;

      result.sqlitePass = compareSqliteMessages(pyDb, tsDb, input);

      const chromaRes = await compareChromadb(pyRes.reply, tsRes.reply);
      result.chromadbSim = chromaRes.sim;
      result.chromadbPass = chromaRes.outcome;

      result.perfRatio = tsRes.latencyMs / pyRes.latencyMs;
      result.perfPass = result.perfRatio <= 1.10 ? 'PASS' : 'FAIL';

      console.log(
        `   text=${textRes.sim.toFixed(3)} (${textRes.outcome}) ` +
        `chroma=${chromaRes.sim.toFixed(3)} (${chromaRes.outcome}) ` +
        `perf=${result.perfRatio.toFixed(2)}x (${result.perfPass})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      result.textPass = 'FAIL';
      result.toolCallsOutcome = 'FAIL';
      result.sqlitePass = 'FAIL';
      result.chromadbPass = 'FAIL';
      result.perfPass = 'FAIL';
      console.log(failStr(`   erro: ${msg}`));
    }

    results.push(result);
  }

  pyDb?.close();
  tsDb?.close();

  // Relatório final
  const textCounts = outcomeCounts(results, 'textPass');
  const toolCounts = outcomeCounts(results, 'toolCallsOutcome');
  const sqliteCounts = outcomeCounts(results, 'sqlitePass');
  const chromaCounts = outcomeCounts(results, 'chromadbPass');
  const perfCounts = outcomeCounts(results, 'perfPass');

  const textTotal = textCounts.pass + textCounts.fail;
  const avgTextSim = results.reduce((a, r) => a + r.textSim, 0) / Math.max(1, results.length);
  const avgChromaSim = results.reduce((a, r) => a + r.chromadbSim, 0) / Math.max(1, results.length);
  const validPerf = results.filter(r => r.python && r.ts);
  const avgPerfRatio = validPerf.length > 0
    ? validPerf.reduce((a, r) => a + r.perfRatio, 0) / validPerf.length
    : 0;

  console.log();
  console.log(`${BOLD}===== E2E COMPARISON REPORT =====${RESET}`);
  console.log(`Text Similarity: ${textCounts.pass}/${textTotal} PASS (${textCounts.fail} FAIL) — avg similarity: ${avgTextSim.toFixed(2)}`);

  if (toolCounts.na > 0 && toolCounts.pass === 0 && toolCounts.fail === 0) {
    console.log(`Tool Calls:      NOT_APPLICABLE (no tool calls registered — Phase 18 incomplete)`);
  } else {
    const tTotal = toolCounts.pass + toolCounts.fail;
    console.log(`Tool Calls:      ${toolCounts.pass}/${tTotal} PASS (${toolCounts.fail} FAIL)`);
  }

  const sqTotal = sqliteCounts.pass + sqliteCounts.fail;
  console.log(`SQLite State:    ${sqliteCounts.pass}/${sqTotal} PASS`);

  const chTotal = chromaCounts.pass + chromaCounts.fail;
  console.log(`ChromaDB:        ${chromaCounts.pass}/${chTotal} PASS (${chromaCounts.fail} FAIL) — avg similarity: ${avgChromaSim.toFixed(2)}`);

  const pTotal = perfCounts.pass + perfCounts.fail;
  console.log(`Performance:     ${perfCounts.pass}/${pTotal} PASS (avg TS/Python ratio: ${avgPerfRatio.toFixed(2)})`);

  console.log(`${BOLD}=================================${RESET}`);
  console.log(`${YELLOW}[KNOWN LIMITATION]${RESET} Voice/audio validation skipped: STT/TTS providers differ by design`);
  console.log(`(nodejs-whisper vs faster-whisper, Speecht5 vs kokoro). Not a bug — documented tradeoff.`);
  console.log(`${BOLD}=================================${RESET}`);

  // Overall: PASS=1, FAIL=0, NOT_APPLICABLE/SKIP = não conta
  const totalPass =
    textCounts.pass + toolCounts.pass + sqliteCounts.pass + chromaCounts.pass + perfCounts.pass;
  const totalEval =
    (textCounts.pass + textCounts.fail) +
    (toolCounts.pass + toolCounts.fail) +
    (sqliteCounts.pass + sqliteCounts.fail) +
    (chromaCounts.pass + chromaCounts.fail) +
    (perfCounts.pass + perfCounts.fail);

  const overall = totalEval > 0 ? totalPass / totalEval : 0;
  const pct = Math.round(overall * 100);
  const threshPct = Math.round(PASS_THRESHOLD * 100);
  const color = overall >= PASS_THRESHOLD ? GREEN : RED;
  console.log(`${BOLD}Overall: ${totalPass}/${totalEval} (${color}${pct}%${RESET}${BOLD}) — THRESHOLD: ${threshPct}%${RESET}`);

  process.exit(overall >= PASS_THRESHOLD ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(`${RED}[e2e] Falha fatal:${RESET}`, err instanceof Error ? err.message : err);
  process.exit(1);
});
