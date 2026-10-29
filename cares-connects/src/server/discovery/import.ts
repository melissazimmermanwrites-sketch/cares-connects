import { readFile } from 'node:fs/promises';
import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { counties, discoveries, discoveryRuns, resources, type DiscoveryStatus } from '../db/schema';
import geo from '../data/ca-geo.json';
import { categoryForNtee } from './ntee';

/**
 * Imports California 501(c)(3)s from the IRS Exempt Organizations Business Master File.
 * Safe to re-run: existing orgs are refreshed in place and keep their review status.
 *
 *  - New since the last run → status "new" (Mel's review queue).
 *  - On the very first run, only orgs whose IRS ruling is from the last 12 months are "new";
 *    older ones are "available" (searchable, not queued) so the queue starts manageable.
 *  - Orgs whose name or EIN matches an existing listing → "listed" and linked to it.
 *  - Orgs missing from the latest file get inIrs = false (revoked, merged or moved).
 */

export const IRS_CA_URL = 'https://www.irs.gov/pub/irs-soi/eo_ca.csv';
const BATCH = 200;
const STALE_RUN_MS = 2 * 60 * 60 * 1000;
/** Private foundations (grant-makers, not service providers). */
const PRIVATE_FOUNDATION_CODES = new Set(['02', '03', '04']);

export interface RunOptions {
  /** URL or local file path of the IRS CSV. */
  source?: string;
  triggeredBy: string;
}

/** Splits one CSV line, honoring double-quoted fields. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

const KEEP_UPPER = new Set([
  'USA', 'US', 'YMCA', 'YWCA', 'LGBT', 'LGBTQ', 'LGBTQIA', 'NAACP', 'NAMI', 'AIDS', 'HIV', 'PTA', 'PTSA', 'ARC',
  'II', 'III', 'IV', 'CA', 'SF', 'LA', 'OC', 'UC', 'CSU', 'DBA', 'AA', 'NA', 'CASA', 'WIC', 'VFW', 'RV',
]);
const KEEP_LOWER = new Set(['of', 'and', 'the', 'for', 'in', 'on', 'at', 'to', 'a', 'an', 'by', 'de', 'la', 'del', 'y']);

/** "SACRAMENTO FOOD BANK & FAMILY SERVICES INC" → "Sacramento Food Bank & Family Services Inc". */
export function titleCase(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, i) => {
      if (KEEP_UPPER.has(word)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && KEEP_LOWER.has(lower)) return lower;
      return lower.replace(/(^|[-/(.'])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
    })
    .join(' ');
}

/** Loose key for matching an IRS name against a listing name. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(inc|incorporated|corp|corporation|co|ltd|llc|the|of|a)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function loadSource(source: string): Promise<{ text: string; modified: string | null }> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`IRS download failed: HTTP ${res.status}`);
    // The IRS file is Latin-1, not UTF-8.
    const text = new TextDecoder('latin1').decode(await res.arrayBuffer());
    return { text, modified: res.headers.get('last-modified') };
  }
  return { text: new TextDecoder('latin1').decode(await readFile(source)), modified: null };
}

/** Starts a run unless one is already going. Returns the run id. */
export async function startRun(triggeredBy: string): Promise<number> {
  const [running] = await db
    .select({ id: discoveryRuns.id })
    .from(discoveryRuns)
    .where(and(eq(discoveryRuns.status, 'running'), gt(discoveryRuns.startedAt, new Date(Date.now() - STALE_RUN_MS))));
  if (running) throw new Error('A discovery run is already in progress.');
  const [run] = await db.insert(discoveryRuns).values({ triggeredBy }).returning({ id: discoveryRuns.id });
  return run.id;
}

export async function runDiscovery(runId: number, options: RunOptions): Promise<void> {
  const startedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  try {
    const { text, modified } = await loadSource(options.source ?? IRS_CA_URL);
    const lines = text.split(/\r?\n/);
    const header = splitCsv(lines[0]);
    const col = (name: string) => {
      const i = header.indexOf(name);
      if (i === -1) throw new Error(`IRS file is missing the ${name} column`);
      return i;
    };
    const C = {
      ein: col('EIN'), name: col('NAME'), street: col('STREET'), city: col('CITY'), zip: col('ZIP'),
      subsection: col('SUBSECTION'), foundation: col('FOUNDATION'), ruling: col('RULING'), ntee: col('NTEE_CD'),
    };

    // County lookup: ZIP first, then the most common county for the same city in this file
    // (covers PO-box ZIPs that the Census ZIP areas don't include).
    const countyRows = await db.select({ id: counties.id, fips: counties.fips }).from(counties);
    const countyIdByFips = new Map(countyRows.map((c) => [c.fips, c.id]));
    const zipToCounty = geo.zipToCounty as Record<string, string>;
    const rows = lines.slice(1).filter(Boolean).map(splitCsv);
    const cityVotes = new Map<string, Map<string, number>>();
    for (const f of rows) {
      const fips = zipToCounty[f[C.zip]?.slice(0, 5)];
      if (!fips) continue;
      const city = f[C.city]?.trim().toUpperCase();
      const votes = cityVotes.get(city) ?? new Map<string, number>();
      votes.set(fips, (votes.get(fips) ?? 0) + 1);
      cityVotes.set(city, votes);
    }
    const countyFor = (zip: string, city: string): number | null => {
      let fips = zipToCounty[zip.slice(0, 5)];
      if (!fips) {
        const votes = cityVotes.get(city.trim().toUpperCase());
        if (votes) fips = [...votes].sort((a, b) => b[1] - a[1])[0][0];
      }
      return fips ? (countyIdByFips.get(fips) ?? null) : null;
    };

    const [{ priorRuns }] = await db
      .select({ priorRuns: sql<number>`count(*)` })
      .from(discoveryRuns)
      .where(eq(discoveryRuns.status, 'success'));
    const firstRun = Number(priorRuns) === 0;
    const recentCutoff = monthsAgo(12);

    const existing = new Set((await db.select({ ein: discoveries.ein }).from(discoveries)).map((d) => d.ein));
    const listings = await db.select({ id: resources.id, name: resources.name, ein: resources.ein }).from(resources);
    const listingByEin = new Map(listings.filter((l) => l.ein).map((l) => [l.ein!, l.id]));
    const listingByName = new Map(listings.map((l) => [nameKey(l.name), l.id]));

    type Row = typeof discoveries.$inferInsert;
    const batch: Row[] = [];
    let rowsMatched = 0;
    let newCount = 0;

    const flush = async () => {
      if (!batch.length) return;
      await db
        .insert(discoveries)
        .values(batch)
        .onConflictDoUpdate({
          target: discoveries.ein,
          set: {
            name: sql`excluded.name`,
            street: sql`excluded.street`,
            city: sql`excluded.city`,
            zip: sql`excluded.zip`,
            countyId: sql`excluded.county_id`,
            ntee: sql`excluded.ntee`,
            ruling: sql`excluded.ruling`,
            categorySlug: sql`excluded.category_slug`,
            inIrs: true,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        });
      batch.length = 0;
    };

    for (const f of rows) {
      if (f[C.subsection] !== '03' || PRIVATE_FOUNDATION_CODES.has(f[C.foundation])) continue;
      const ntee = (f[C.ntee] ?? '').trim();
      const categorySlug = categoryForNtee(ntee);
      if (!categorySlug) continue;
      rowsMatched++;

      const ein = f[C.ein].trim();
      const name = titleCase(f[C.name]);
      const ruling = f[C.ruling]?.trim() || null;
      let status: DiscoveryStatus | undefined;
      let resourceId: number | null = null;
      if (!existing.has(ein)) {
        resourceId = listingByEin.get(ein) ?? listingByName.get(nameKey(name)) ?? null;
        status = resourceId ? 'listed' : firstRun && (!ruling || ruling < recentCutoff) ? 'available' : 'new';
        if (status === 'new') newCount++;
      }

      batch.push({
        ein,
        name,
        street: titleCase(f[C.street] ?? '') || null,
        city: titleCase(f[C.city] ?? '') || null,
        zip: f[C.zip]?.trim() || null,
        countyId: countyFor(f[C.zip] ?? '', f[C.city] ?? ''),
        ntee,
        ruling,
        categorySlug,
        // Used only when the row is inserted; on conflict the upsert's `set` leaves the existing
        // status, link and first-seen date alone, so these placeholders never overwrite a review.
        status: status ?? 'available',
        resourceId,
        firstSeenRunId: runId,
        firstSeenAt: startedAt,
        inIrs: true,
        lastSeenAt: startedAt,
      });
      if (batch.length >= BATCH) await flush();
    }
    await flush();

    // Anything not refreshed by this run is no longer in the IRS file.
    await db.update(discoveries).set({ inIrs: false }).where(lt(discoveries.lastSeenAt, startedAt));

    await db
      .update(discoveryRuns)
      .set({
        status: 'success',
        sourceModified: modified,
        rowsRead: rows.length,
        rowsMatched,
        newCount,
        finishedAt: new Date(),
      })
      .where(eq(discoveryRuns.id, runId));
  } catch (err) {
    await db
      .update(discoveryRuns)
      .set({ status: 'failed', error: err instanceof Error ? err.message : String(err), finishedAt: new Date() })
      .where(eq(discoveryRuns.id, runId));
    throw err;
  }
}

export async function latestRun() {
  const [run] = await db.select().from(discoveryRuns).orderBy(desc(discoveryRuns.id)).limit(1);
  return run ?? null;
}
