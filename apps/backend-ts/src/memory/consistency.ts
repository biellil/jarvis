/**
 * Memory consistency check — Phase 35-P02 (REL-02)
 *
 * Validates that all typed_memories rows in SQLite are also present in ChromaDB.
 * Logs mismatches as WARN. Never throws — errors are caught internally.
 *
 * Called non-blocking from index.ts server startup:
 *   void validateMemoryConsistency(store, vectors).catch(() => {});
 */
import type { MemoryStore } from './store.js';
import type { MemoryVectors } from './vectors.js';

export async function validateMemoryConsistency(
  store: MemoryStore,
  vectors: MemoryVectors,
): Promise<void> {
  try {
    const sqliteMemories = store.getAllTypedMemories();
    const chromadbIds = await vectors.getAllDocIds();
    const mismatches = sqliteMemories.filter((m) => !chromadbIds.has(m.id));
    if (mismatches.length > 0) {
      console.warn(
        `[consistency check] Found ${mismatches.length} typed_memories in SQLite but missing in ChromaDB:`,
      );
      mismatches.slice(0, 10).forEach((m) => console.warn(`  - ${m.id}`));
      if (mismatches.length > 10) {
        console.warn(`  ... and ${mismatches.length - 10} more`);
      }
    } else {
      console.log('[consistency check] typed_memories consistency OK');
    }
  } catch (err) {
    console.warn(`[consistency check] validation failed: ${(err as Error).message}`);
  }
}
