import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';

const dbPath = path.join(process.cwd(), 'jarvis_memory.sqlite'); // This will place it in the backend-ts root, which is fine for now

const sqlite = new Database(dbPath);

export const db = drizzle(sqlite, { schema });
