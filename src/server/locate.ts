import { asc, eq, sql } from 'drizzle-orm';
import { db } from './db/client';
import { counties, discoveries } from './db/schema';
import geo from './data/ca-geo.json';
import type { CountyRef, LocateResult } from '../shared/api-types';

/**
 * Turns what someone typed ("95678", "Roseville", "placer county") into a California county.
 *  - ZIP: Census ZIP→county lookup.
 *  - County name: exact match against the 58 counties ("county" optional).
 *  - City: the county where most IRS-listed nonprofits in that city sit. That's data, not a
 *    guess; when a city spans counties without a clear winner, the caller gets choices.
 */

const zipToCounty = geo.zipToCounty as Record<string, string>;

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(county|ca|california|city of|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function allCounties(): Promise<(CountyRef & { fips: string })[]> {
  return db
    .select({ id: counties.id, slug: counties.slug, name: counties.name, fips: counties.fips })
    .from(counties)
    .orderBy(asc(counties.name));
}

export async function locate(input: string): Promise<LocateResult> {
  const text = input.trim();
  const list = await allCounties();
  const ref = (c: CountyRef & { fips?: string }): CountyRef => ({ id: c.id, slug: c.slug, name: c.name });

  const zip = text.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  if (zip) {
    const fips = zipToCounty[zip];
    const county = fips ? list.find((c) => c.fips === fips) : undefined;
    if (county) return { kind: 'county', county: ref(county), label: `${zip} · ${county.name} County` };
    // California ZIPs all start 90–96; anything else is out of state.
    return zip >= '90000' && zip <= '96199' ? { kind: 'unknown' } : { kind: 'outside' };
  }

  const words = clean(text);
  if (!words) return { kind: 'unknown' };

  const byName = list.find((c) => clean(c.name) === words);
  if (byName) return { kind: 'county', county: ref(byName), label: `${byName.name} County` };

  const cityVotes = await db
    .select({ countyId: discoveries.countyId, n: sql<number>`count(*)` })
    .from(discoveries)
    .where(eq(sql`lower(${discoveries.city})`, words))
    .groupBy(discoveries.countyId)
    .orderBy(sql`count(*) desc`);
  const votes = cityVotes.filter((v) => v.countyId !== null);
  if (votes.length) {
    const total = votes.reduce((s, v) => s + Number(v.n), 0);
    const cityName = words.replace(/\b\w/g, (ch) => ch.toUpperCase());
    const choices = votes
      .filter((v) => Number(v.n) / total >= 0.15)
      .map((v) => list.find((c) => c.id === v.countyId)!)
      .filter(Boolean)
      .map((c) => ({ county: ref(c), label: `${cityName}, ${c.name} County` }));
    if (Number(votes[0].n) / total >= 0.8 || choices.length === 1) return { kind: 'county', ...choices[0] };
    return { kind: 'choices', choices };
  }

  // Partial county name ("sac" → Sacramento) as a last resort, only when unambiguous.
  const partial = list.filter((c) => clean(c.name).startsWith(words) && words.length >= 3);
  if (partial.length === 1) return { kind: 'county', county: ref(partial[0]), label: `${partial[0].name} County` };
  if (partial.length > 1) return { kind: 'choices', choices: partial.map((c) => ({ county: ref(c), label: `${c.name} County` })) };
  return { kind: 'unknown' };
}
