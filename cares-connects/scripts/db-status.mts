/**
 * Shows what a database has and what db:migrate would do to it. Read-only: safe on production.
 *
 *   npm run db:status
 *
 * Exits with 1 if anything needs attention, so it can be used as a check before deploying.
 */
import { client, DATABASE_URL } from '../src/server/db/client';
import { describeTarget } from '../src/server/db/migration-plan';
import { explainStranded, readPlan } from './migration-state.mts';

const plan = await readPlan();
console.log(`Database: ${describeTarget(DATABASE_URL)}\n`);
console.log(`Applied (${plan.applied.length}):`);
for (const m of plan.applied) console.log(`  ${m.tag}`);
console.log(`\nPending (${plan.pending.length}):`);
for (const m of plan.pending) console.log(`  ${m.tag}`);

const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name");
console.log(`\nRows:`);
for (const row of tables.rows) {
  const name = String(row['name']);
  // Sessions, and anything else holding sign-ins or secrets, are only ever counted.
  const counted = await client.execute(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`);
  console.log(`  ${name}: ${Number(counted.rows[0]['n']).toLocaleString()}`);
}

let problems = 0;
if (plan.stranded.length) {
  problems++;
  console.error(`\nPROBLEM: ${explainStranded(plan)}`);
}
if (plan.unknown.length) {
  console.log(`\nNote: ${plan.unknown.length} applied migration(s) have no matching file here, which is expected if this branch is behind the database.`);
}
if (!problems) console.log(plan.pending.length ? `\nReady: db:migrate would apply ${plan.pending.length} migration(s).` : '\nUp to date.');
client.close();
process.exitCode = problems ? 1 : 0;
