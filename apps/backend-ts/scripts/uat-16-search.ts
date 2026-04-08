/**
 * UAT teste 2 — Critério 2: semantic search com threshold configurável.
 */
import { MemoryVectors } from '../src/memory/index.js';

async function main() {
  const host = process.env.CHROMA_HOST ?? 'localhost';
  const port = Number(process.env.CHROMA_PORT ?? 8000);
  const v = new MemoryVectors({ host, port, collection: `uat-16-search-${Date.now()}` });
  await v.init();

  await v.addMemory('m1', 'Adoro programar em TypeScript');
  await v.addMemory('m2', 'Minha cor favorita é roxo');
  await v.addMemory('m3', 'Pizza de calabresa é a melhor');

  console.log('\n--- Query: "qual cor eu gosto?" (sem threshold)');
  const r1 = await v.queryMemories('qual cor eu gosto?', 3);
  for (const x of r1) console.log(`  ${x.id} sim=${x.similarity?.toFixed(3)} :: ${x.document}`);

  console.log('\n--- Query: "qual cor eu gosto?" (threshold=0.4)');
  const r2 = await v.queryMemories('qual cor eu gosto?', 3, 0.4);
  for (const x of r2) console.log(`  ${x.id} sim=${x.similarity?.toFixed(3)} :: ${x.document}`);

  console.log('\n--- Query: "matemática quântica" (threshold=0.4, deve filtrar tudo)');
  const r3 = await v.queryMemories('matemática quântica', 3, 0.4);
  console.log(`  resultados: ${r3.length}`);

  // Heurísticas de PASS:
  const top1 = r1[0];
  const ok =
    top1?.id === 'm2' &&
    r2.some((x) => x.id === 'm2') &&
    r3.length === 0;

  if (ok) {
    console.log('\n✅ PASS — top-1 é m2 (cor), threshold deixa passar match relevante e filtra o irrelevante.');
    process.exit(0);
  } else {
    console.log('\n❌ FAIL — comportamento inesperado, ver acima.');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
