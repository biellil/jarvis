/**
 * Embedding parity script: compares TypeScript (@xenova/transformers)
 * embeddings against pre-computed Python (sentence-transformers) vectors
 * for the same inputs. All cosine similarities must exceed 0.95.
 *
 * Usage:
 *   pnpm parity:embeddings
 *
 * Exit codes:
 *   0 — all similarities > 0.95
 *   1 — at least one similarity <= 0.95
 *   2 — fixture file missing (prints instructions to regenerate)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedText, EMBEDDING_DIM } from '../src/memory/embeddings.js';

const FIXTURES: string[] = [
  'Oi, tudo bem?',
  'Eu prefiro dark mode em tudo',
  'My favorite programming language is Python',
  'JARVIS lembra de tudo entre sessões',
  'The quick brown fox jumps over the lazy dog',
];

const THRESHOLD = 0.95;

function cosine(a: Float32Array, b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixturePath = resolve(here, 'embedding-parity-fixtures.json');

  if (!existsSync(fixturePath)) {
    console.error('[parity] fixture file missing:', fixturePath);
    console.error('\nGenerate it by running (from repo root):\n');
    console.error(
      `python -c "from sentence_transformers import SentenceTransformer; import json; m = SentenceTransformer('all-MiniLM-L6-v2'); texts = ['Oi, tudo bem?', 'Eu prefiro dark mode em tudo', 'My favorite programming language is Python', 'JARVIS lembra de tudo entre sessões', 'The quick brown fox jumps over the lazy dog']; vecs = m.encode(texts, normalize_embeddings=True).tolist(); json.dump({t: v for t, v in zip(texts, vecs)}, open('apps/backend-ts/scripts/embedding-parity-fixtures.json', 'w'))"`,
    );
    console.error('\nThen re-run: pnpm parity:embeddings');
    process.exit(2);
  }

  const raw = readFileSync(fixturePath, 'utf-8');
  const pythonVecs = JSON.parse(raw) as Record<string, number[]>;

  console.log('\nEmbedding parity check (TS @xenova/transformers vs Python sentence-transformers)');
  console.log('Model: Xenova/all-MiniLM-L6-v2 | dim:', EMBEDDING_DIM, '| threshold: >', THRESHOLD);
  console.log('─'.repeat(90));

  let allPass = true;
  const rows: Array<{ text: string; sim: number; pass: boolean }> = [];

  for (const text of FIXTURES) {
    const pyVec = pythonVecs[text];
    if (!pyVec) {
      console.error(`[parity] missing python vector for: ${text}`);
      allPass = false;
      continue;
    }
    const tsVec = await embedText(text);
    const sim = cosine(tsVec, pyVec);
    const pass = sim > THRESHOLD;
    if (!pass) allPass = false;
    rows.push({ text, sim, pass });
  }

  for (const r of rows) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    const label = r.text.length > 50 ? r.text.slice(0, 47) + '...' : r.text;
    console.log(`  [${mark}] cos=${r.sim.toFixed(6)}  ${label}`);
  }

  console.log('─'.repeat(90));
  if (allPass) {
    console.log(`All ${rows.length} inputs passed parity (> ${THRESHOLD}).`);
    process.exit(0);
  } else {
    console.error('Parity check FAILED.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[parity] unexpected error:', err);
  process.exit(1);
});
