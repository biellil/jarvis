/**
 * UAT teste 3 — Critério 5: user profile persiste e é injetado no contexto.
 */
import { MemoryManager, db, runMigrations } from '../src/memory/index.js';
import { userProfile } from '../src/memory/schema.js';

async function main() {
  runMigrations();

  // Limpa profile pra começar do zero.
  db.delete(userProfile).run();

  const host = process.env.CHROMA_HOST ?? 'localhost';
  const port = Number(process.env.CHROMA_PORT ?? 8000);
  const opts = { vectorsOptions: { host, port } };

  // Sessão A: grava fato manualmente via store interno.
  const a = new MemoryManager(opts);
  // upsertProfile é exposto pelo store; escrevendo via SQL pra simular um learnFromTurn que já rodou
  db.insert(userProfile)
    .values({
      key: 'cor_favorita',
      value: 'roxo',
      source: 'explicit',
      createdAt: new Date().toISOString(),
    })
    .run();
  console.log('[A] gravou fato no profile: cor_favorita=roxo');

  // Sessão B: novo MemoryManager, simula restart.
  const b = new MemoryManager(opts);
  const ctx = await b.buildContext('o que eu gosto?');
  console.log('\n--- buildContext output ---');
  console.log(ctx);
  console.log('---------------------------');

  if (ctx.includes('User profile') && ctx.includes('cor_favorita') && ctx.includes('roxo')) {
    console.log('\n✅ PASS — profile persistiu e foi injetado no contexto.');
    process.exit(0);
  } else {
    console.log('\n❌ FAIL — profile não apareceu no contexto.');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
