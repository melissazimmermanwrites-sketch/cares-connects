/** Reads what's in ./drizzle and what the database has applied. Changes nothing. */
import { readFileSync } from 'node:fs';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { client } from '../src/server/db/client';
import { planMigrations, type MigrationFile, type MigrationPlan } from '../src/server/db/migration-plan';

const FOLDER = 'drizzle';

export function migrationFiles(): MigrationFile[] {
  const journal = JSON.parse(readFileSync(`${FOLDER}/meta/_journal.json`, 'utf8')) as { entries: { tag: string; when: number }[] };
  const read = readMigrationFiles({ migrationsFolder: FOLDER });
  return journal.entries.map((entry, i) => ({ tag: entry.tag, when: entry.when, hash: read[i].hash }));
}

export async function readPlan(): Promise<MigrationPlan> {
  const table = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'");
  const rows = table.rows.length ? (await client.execute('SELECT hash, created_at FROM __drizzle_migrations')).rows : [];
  return planMigrations(
    migrationFiles(),
    rows.map((r) => ({ hash: String(r['hash']), createdAt: Number(r['created_at']) })),
  );
}

export function explainStranded(plan: MigrationPlan): string {
  return [
    `These migrations are older than the newest one applied, so Drizzle would skip them forever: ${plan.stranded.map((m) => m.tag).join(', ')}`,
    'Nothing has been changed. To fix: restore the original file if it was edited. If it merged late, regenerate it',
    '(delete its .sql, snapshot and journal entry, then run npm run db:generate) so it gets a new timestamp.',
  ].join('\n');
}
