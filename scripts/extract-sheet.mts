/**
 * One-time import: turns Mel's Google Sheets HTML export (one .html per tab)
 * into data/seed/directory.json, plus data/seed/REVIEW.md listing anything a human should check.
 *
 *   npm run db:extract -- "<path to export folder>"
 *
 * Rules:
 *  - Rows identical in every field except tags are merged into one resource that
 *    lists every category it appeared in (tags are unioned).
 *  - Rows with the same org name but different details are kept as separate
 *    resources and share a `duplicateGroup` so the admin can review them.
 *  - The row count is checked against the sheet's own "New Tabs Index" total.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, type HTMLElement } from 'node-html-parser';
import type { VerificationStatus } from '../src/server/db/schema';
import { slugify } from '../src/shared/slug';

const DEFAULT_EXPORT_DIR = '../x_donotuse_Copy of CARES_DIRECTORY';
const OUT_DIR = 'data/seed';
const SKIP_FILES = new Set(['Legend.html', 'New Tabs Index.html']);
const INDEX_FILE = 'New Tabs Index.html';

const HEADER = [
  'County',
  'Organization Name',
  'Website',
  'Phone Number',
  'Mission Statement',
  'Services',
  'Tags',
  'Contact Person',
  'Contact Phone',
  'Contact Email',
  'Verification Status',
  'Notes',
];

/** The sheet's own service-area values; the seed script turns these into county links. */
export type SheetCounty = 'placer' | 'sacramento' | 'both';

const COUNTY_MAP: Record<string, SheetCounty> = {
  'Placer County': 'placer',
  'Sacramento County': 'sacramento',
  'Both Counties': 'both',
};

const STATUS_MAP: Record<string, VerificationStatus> = {
  Verified: 'verified',
  'Needs Verification': 'needs_verification',
};

const EMPTY_VALUES = new Set(['', 'n/a', 'na', 'none', '-']);

export interface SeedCategory {
  slug: string;
  name: string;
  sortOrder: number;
}

export interface SeedResource {
  name: string;
  county: SheetCounty;
  website: string | null;
  phone: string | null;
  address: string | null;
  mission: string | null;
  services: string | null;
  notes: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  verificationStatus: VerificationStatus;
  duplicateGroup: string | null;
  categories: string[];
  tags: string[];
}

export interface SeedFile {
  generatedAt: string;
  source: string;
  categories: SeedCategory[];
  resources: SeedResource[];
}

function clean(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim();
  return EMPTY_VALUES.has(text.toLowerCase()) ? null : text;
}

function cellText(cell: HTMLElement): string {
  return cell.text.replace(/ /g, ' ');
}

function rowsOf(html: string): HTMLElement[][] {
  return parse(html)
    .querySelectorAll('tr')
    .map((tr) => tr.querySelectorAll('td'));
}

/**
 * Pulls a street address out of Notes only when Notes starts with one. It's removed from Notes
 * only in the exact form "<address>. <rest>" (or the address alone), which the sheet export can
 * rebuild character-for-character; otherwise Notes is kept as-is (labels like "Office:" or a
 * following ";" / "(" stay). Addresses buried mid-sentence are left for a human.
 */
function splitAddress(notes: string | null): { address: string | null; notes: string | null } {
  if (!notes) return { address: null, notes: null };
  const match = notes.match(/^((?:[A-Za-z][\w&.'-]*\s?){1,4}:\s*)?(\d[^;]{3,120}?,\s*CA,?\s+\d{5}(?:-\d{4})?)/);
  if (!match) return { address: null, notes };
  const address = match[2];
  const rest = notes.slice(match[0].length);
  if (!match[1] && rest === '') return { address, notes: null };
  if (!match[1] && rest.startsWith('. ')) return { address, notes: clean(rest.slice(2)) };
  return { address, notes };
}

function parseTags(value: string): string[] {
  const tags = value
    .split(',')
    .map((t) => t.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

function readCategoryOrder(exportDir: string): { names: string[]; total: number } {
  const rows = rowsOf(readFileSync(join(exportDir, INDEX_FILE), 'utf8')).map((r) => r.map(cellText));
  const headerAt = rows.findIndex((r) => r[0]?.trim() === 'Category');
  const names: string[] = [];
  let total = 0;
  for (const row of rows.slice(headerAt + 1)) {
    const name = row[0]?.trim();
    if (!name) continue;
    if (name === 'TOTAL') total = Number(row[1]);
    else names.push(name);
  }
  return { names, total };
}

function extract(exportDir: string): { seed: SeedFile; review: string[] } {
  const order = readCategoryOrder(exportDir);
  const review: string[] = [];
  const categories: SeedCategory[] = [];
  const merged = new Map<string, SeedResource>();
  let rowCount = 0;

  const files = readdirSync(exportDir)
    .filter((f) => f.endsWith('.html') && !SKIP_FILES.has(f))
    .sort();

  for (const file of files) {
    const rows = rowsOf(readFileSync(join(exportDir, file), 'utf8'));
    const title = rows.map((r) => cellText(r[0] ?? parse(''))).find((t) => t.startsWith('CARES Connects'));
    // The title row has the true name (file names lose "/"), but a few titles are trimmed
    // (e.g. "Parenting Resources Database"), so fall back to the tab name when it matches the index.
    const titleName = title?.match(/CARES Connects — (.+) Resources Database/)?.[1]?.trim();
    const tabName = file.replace(/\.html$/, '');
    const name = titleName && order.names.includes(titleName) ? titleName : order.names.includes(tabName) ? tabName : titleName;
    if (!name) throw new Error(`${file}: could not find the category title row`);

    const slug = slugify(name);
    const sortOrder = order.names.indexOf(name);
    if (sortOrder === -1) review.push(`- Category **${name}** is not listed in the index tab.`);
    categories.push({ slug, name, sortOrder: sortOrder === -1 ? 999 : sortOrder });

    const headerAt = rows.findIndex((r) => cellText(r[0] ?? parse('')).trim() === 'County');
    const header = rows[headerAt]?.map((c) => cellText(c).trim());
    if (JSON.stringify(header) !== JSON.stringify(HEADER)) {
      throw new Error(`${file}: unexpected columns ${JSON.stringify(header)}`);
    }

    for (const cells of rows.slice(headerAt + 1)) {
      const raw = cells.map(cellText);
      if (!raw.slice(1).some((v) => v.trim())) continue;
      rowCount++;

      const [county, orgName, , phone, mission, services, tags, contactPerson, contactPhone, contactEmail, status, notes] =
        raw.map((v) => v.trim());
      const website = cells[2]?.querySelector('a')?.getAttribute('href') ?? raw[2];

      if (!COUNTY_MAP[county]) throw new Error(`${file}: unknown county "${county}" for ${orgName}`);
      if (!STATUS_MAP[status]) throw new Error(`${file}: unknown status "${status}" for ${orgName}`);

      const { address, notes: restNotes } = splitAddress(clean(notes));
      const resource: SeedResource = {
        name: clean(orgName) ?? '(unnamed)',
        county: COUNTY_MAP[county],
        website: clean(website),
        phone: clean(phone),
        address,
        mission: clean(mission),
        services: clean(services),
        notes: restNotes,
        contactPerson: clean(contactPerson),
        contactPhone: clean(contactPhone),
        contactEmail: clean(contactEmail),
        verificationStatus: STATUS_MAP[status],
        duplicateGroup: null,
        categories: [slug],
        tags: parseTags(tags),
      };

      const { categories: _c, tags: _t, ...identity } = resource;
      const key = JSON.stringify(identity);
      const existing = merged.get(key);
      if (existing) {
        if (!existing.categories.includes(slug)) existing.categories.push(slug);
        existing.tags = [...new Set([...existing.tags, ...resource.tags])];
      } else {
        merged.set(key, resource);
      }
    }
  }

  if (order.total && rowCount !== order.total) {
    throw new Error(`Parsed ${rowCount} rows but the index tab says ${order.total}.`);
  }

  const resources = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));

  // Same name, different details → flag for review rather than guess which one is right.
  const byName = new Map<string, SeedResource[]>();
  for (const r of resources) {
    const key = r.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  const groups = [...byName.values()].filter((g) => g.length > 1);
  for (const group of groups) {
    const groupId = slugify(group[0].name);
    group.forEach((r) => (r.duplicateGroup = groupId));
    const fields = (Object.keys(group[0]) as (keyof SeedResource)[]).filter(
      (f) => !['categories', 'tags', 'duplicateGroup'].includes(f) && new Set(group.map((r) => r[f])).size > 1,
    );
    review.push(
      `- **${group[0].name}** — ${group.length} versions (in: ${group.map((r) => r.categories.join(', ')).join(' | ')}); differs on: ${fields.join(', ')}`,
    );
  }

  const needsVerification = resources.filter((r) => r.verificationStatus === 'needs_verification');
  const noContact = resources.filter((r) => !r.phone && !r.website && !r.contactEmail);

  const report = [
    '# Import review',
    '',
    `Source rows: **${rowCount}** (matches index tab: ${order.total === rowCount ? 'yes' : 'NO'})`,
    `Resources after merging identical rows: **${resources.length}**`,
    `Categories: **${categories.length}**`,
    `Addresses pulled out of Notes: **${resources.filter((r) => r.address).length}**`,
    '',
    `## Possible duplicates (${groups.length})`,
    '',
    'Same organization name, different details. Each version was kept; in the admin, filter by "possible duplicate" to merge or clear them.',
    '',
    ...review,
    '',
    `## Needs verification (${needsVerification.length})`,
    '',
    ...needsVerification.map((r) => `- ${r.name} (${r.categories.join(', ')})`),
    '',
    `## No phone, website, or email (${noContact.length})`,
    '',
    ...noContact.map((r) => `- ${r.name} (${r.categories.join(', ')})`),
    '',
  ];

  return {
    seed: {
      generatedAt: new Date().toISOString(),
      source: 'CARES_DIRECTORY Google Sheet (HTML export)',
      categories: categories.sort((a, b) => a.sortOrder - b.sortOrder),
      resources,
    },
    review: report,
  };
}

const exportDir = resolve(process.argv[2] ?? DEFAULT_EXPORT_DIR);
const { seed, review } = extract(exportDir);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'directory.json'), JSON.stringify(seed, null, 2) + '\n');
writeFileSync(join(OUT_DIR, 'REVIEW.md'), review.join('\n'));
console.log(
  `Wrote ${seed.resources.length} resources in ${seed.categories.length} categories to ${OUT_DIR}/directory.json (see REVIEW.md)`,
);
