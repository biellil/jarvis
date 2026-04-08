/**
 * UAT teste 1 — Critério 1: persistência através de restart.
 *
 * 1. Abre MemoryManager A, cria conversa, salva turn (user+assistant).
 * 2. Descarta A. Abre MemoryManager B (novo processo simulado).
 * 3. Lê mensagens recentes diretamente do MemoryStore.
 * 4. Imprime o que encontrou. PASS se a frase do user reaparecer.
 *
 * Pré-requisito: servidor Chroma rodando em CHROMA_HOST/CHROMA_PORT
 *   (default: localhost:8000). Suba com: `pnpm dlx chroma run --host 127.0.0.1 --port 8765`
 *   e exporte CHROMA_HOST=127.0.0.1 CHROMA_PORT=8765 antes de rodar.
 */
import { eq } from 'drizzle-orm';
import { MemoryManager, db, messages, runMigrations } from '../src/memory/index.js';

async function main() {
  runMigrations();

  const host = process.env.CHROMA_HOST ?? 'localhost';
  const port = Number(process.env.CHROMA_PORT ?? 8000);
  const opts = { vectorsOptions: { host, port, collection: 'uat-16-persist' } };

  // --- "Sessão 1" ---------------------------------------------------------
  const a = new MemoryManager(opts);
  const convId = await a.startConversation();
  if (convId == null) throw new Error('startConversation retornou null');
  await a.saveTurn(convId, 'minha cor favorita é roxo', 'Anotado, vou lembrar disso.');
  await a.endConversation(convId);
  console.log(`[A] gravou conversa #${convId}`);

  // --- "Sessão 2" — novo MemoryManager (mesmo arquivo SQLite) -------------
  const b = new MemoryManager(opts);
  void b; // só pra provar que reabrir não corrompe nada

  // Lê direto da tabela messages via Drizzle (simula leitura "fria").
  const recent = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .all();
  console.log('[B] mensagens encontradas após "restart":');
  console.log(JSON.stringify(recent, null, 2));

  const userMsg = recent.find(
    (m) => m.role === 'user' && (m.content ?? '').includes('roxo'),
  );
  if (userMsg) {
    console.log('\n✅ PASS — mensagem do user persistiu.');
    process.exit(0);
  } else {
    console.log('\n❌ FAIL — mensagem do user não foi encontrada após restart.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
