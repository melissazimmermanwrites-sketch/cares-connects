/**
 * Applies pending SQL migrations in ./drizzle to DATABASE_URL (local file or Turso).
 * Safe to run repeatedly; already-applied migrations are skipped.
 *
 * Stops without changing anything if a migration would be silently skipped, which Drizzle does
 * not warn about (see migration-plan.ts). Run db:status first to see what this would do.
 *
 *   npm run db:migrate
 */
import { mkdirSync } from 'node:fs';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { client, db, DATABASE_URL } from '../src/server/db/client';
import { describeTarget } from '../src/server/db/migration-plan';
import { explainStranded, readPlan } from './migration-state.mts';

if (DATABASE_URL.startsWith('file:')) mkdirSync('data', { recursive: true });

console.log(`Migrating ${describeTarget(DATABASE_URL)} ...`);
const before = await readPlan();
if (before.stranded.length) {
  console.error(explainStranded(before));
  client.close();
  process.exit(1);
}
for (const m of before.pending) console.log(`  applying ${m.tag}`);
await migrate(db, { migrationsFolder: 'drizzle' });

const after = await readPlan();
if (after.pending.length || after.stranded.length) {
  console.error(`Migrations didn't all apply: ${[...after.pending, ...after.stranded].map((m) => m.tag).join(', ')}`);
  client.close();
  process.exit(1);
}
console.log(before.pending.length ? `Applied ${before.pending.length}. Migrations up to date.` : 'Migrations up to date.');
client.close();
