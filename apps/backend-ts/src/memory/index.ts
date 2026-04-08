export * from './schema.js';
export { db } from './db.js';
export { runMigrations } from './migrate.js';
export {
  MemoryStore,
  ToolLogger,
  createStoreForTests,
  type MessageInput,
  type ProfileFact,
} from './store.js';
export {
  MemoryVectors,
  COLLECTION_NAME,
  type QueryResult,
  type MemoryVectorsOptions,
} from './vectors.js';
export { embedText, embedBatch, EMBEDDING_MODEL, EMBEDDING_DIM } from './embeddings.js';
