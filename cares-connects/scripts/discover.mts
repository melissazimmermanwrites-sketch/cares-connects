/**
 * Runs IRS discovery once against DATABASE_URL. This is what the scheduled job calls.
 *
 *   npm run discover                       # download the live IRS California file
 *   npm run discover -- data/irs/eo_ca.csv # use a local copy
 */
import { client, DATABASE_URL } from '../src/server/db/client';
import { IRS_CA_URL, latestRun, runDiscovery, startRun } from '../src/server/discovery/import';

const source = process.argv[2] ?? IRS_CA_URL;
console.log(`Discovery: ${source} → ${DATABASE_URL.replace(/\?.*$/, '')}`);

const runId = await startRun(process.env['GITHUB_ACTIONS'] ? 'scheduled job' : 'command line');
const started = Date.now();
try {
  await runDiscovery(runId, { source, triggeredBy: 'cli' });
  const run = await latestRun();
  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s: ${run?.rowsRead} IRS rows, ${run?.rowsMatched} human-services charities, ${run?.newCount} new for review.`,
  );
} catch (err) {
  console.error('Discovery failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.close();
}
