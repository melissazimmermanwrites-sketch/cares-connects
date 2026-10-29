/**
 * Applies pending SQL migrations in ./drizzle to DATABASE_URL (local file or Turso).
 * Safe to run repeatedly; already-applied migrations are skipped.
 *
 *   npm run db:migrate
 */
import { mkdirSync } from 'node:fs';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { client, db, DATABASE_URL } from '../src/server/db/client';

if (DATABASE_URL.startsWith('file:')) mkdirSync('data', { recursive: true });

console.log(`Migrating ${DATABASE_URL.replace(/\?.*$/, '')} ...`);
await migrate(db, { migrationsFolder: 'drizzle' });
console.log('Migrations up to date.');
client.close();
