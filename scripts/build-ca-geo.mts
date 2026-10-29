/**
 * Builds src/server/data/ca-geo.json from the Census 2020 ZCTA↔county relationship file:
 *   - counties: all 58 California counties (FIPS + name)
 *   - zipToCounty: 5-digit ZIP → county FIPS (the county holding most of the ZIP's land area)
 *
 *   curl -o data/census/zcta_county.txt \
 *     https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
 *   npm run geo:build
 *
 * Only needed again if the Census publishes a new relationship file.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = process.argv[2] ?? 'data/census/zcta_county.txt';
const OUT = 'src/server/data/ca-geo.json';
const CA_STATE_FIPS = '06';

const lines = readFileSync(SOURCE, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
const header = lines[0].split('|');
const col = (name: string) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`Column ${name} missing from ${SOURCE}`);
  return i;
};
const ZCTA = col('GEOID_ZCTA5_20');
const COUNTY = col('GEOID_COUNTY_20');
const COUNTY_NAME = col('NAMELSAD_COUNTY_20');
const LAND = col('AREALAND_PART');

const counties = new Map<string, string>();
const best = new Map<string, { fips: string; land: number }>();

for (const line of lines.slice(1)) {
  const f = line.split('|');
  const fips = f[COUNTY];
  if (!fips?.startsWith(CA_STATE_FIPS)) continue;
  counties.set(fips, f[COUNTY_NAME].replace(/ County$/, ''));
  const zip = f[ZCTA];
  if (!zip) continue;
  const land = Number(f[LAND]) || 0;
  const current = best.get(zip);
  if (!current || land > current.land) best.set(zip, { fips, land });
}

if (counties.size !== 58) throw new Error(`Expected 58 California counties, found ${counties.size}`);

const out = {
  source: 'US Census Bureau 2020 ZCTA5–County relationship file',
  counties: [...counties].sort((a, b) => a[1].localeCompare(b[1])).map(([fips, name]) => ({ fips, name })),
  zipToCounty: Object.fromEntries([...best].sort(([a], [b]) => a.localeCompare(b)).map(([zip, v]) => [zip, v.fips])),
};
mkdirSync('src/server/data', { recursive: true });
writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`Wrote ${OUT}: ${out.counties.length} counties, ${Object.keys(out.zipToCounty).length} ZIPs`);
