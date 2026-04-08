import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { db } from './db.js';

export function runMigrations(): void {
  const migrationsFolder = path.join(process.cwd(), 'src/memory/migrations');
  migrate(db, { migrationsFolder });
}
