/**
 * Loads data/seed/directory.json into DATABASE_URL.
 * Refuses to touch a database that already has resources unless --force is passed,
 * which DELETES all directory data first. Never run --force against production
 * once Mel has started editing in the admin.
 *
 *   npm run db:seed
 *   npm run db:seed -- --force
 */
import { readFileSync } from 'node:fs';
import { count } from 'drizzle-orm';
import { client, db, DATABASE_URL } from '../src/server/db/client';
import {
  categories,
  counties,
  discoveries,
  resourceCategories,
  resourceCounties,
  resources,
  resourceTags,
  tags,
} from '../src/server/db/schema';
import type { SeedFile } from './extract-sheet.mts';

const SEED_PATH = 'data/seed/directory.json';
const force = process.argv.includes('--force');

const seed: SeedFile = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
const [{ existing }] = await db.select({ existing: count() }).from(resources);

if (existing > 0 && !force) {
  console.error(`${DATABASE_URL} already has ${existing} resources. Re-run with --force to wipe and reseed.`);
  process.exit(1);
}

await db.transaction(async (tx) => {
  if (force) {
    // Discoveries survive a reseed, but links to the listings being deleted are cleared.
    await tx.update(discoveries).set({ resourceId: null });
    await tx.delete(resourceTags);
    await tx.delete(resourceCategories);
    await tx.delete(resourceCounties);
    await tx.delete(tags);
    await tx.delete(resources);
    await tx.delete(categories);
  }

  const categoryRows = await tx
    .insert(categories)
    .values(seed.categories)
    .returning({ id: categories.id, slug: categories.slug });
  const categoryId = new Map(categoryRows.map((c) => [c.slug, c.id]));

  const tagNames = [...new Set(seed.resources.flatMap((r) => r.tags))].sort();
  const tagId = new Map<string, number>();
  for (let i = 0; i < tagNames.length; i += 500) {
    const rows = await tx
      .insert(tags)
      .values(tagNames.slice(i, i + 500).map((name) => ({ name })))
      .returning({ id: tags.id, name: tags.name });
    rows.forEach((t) => tagId.set(t.name, t.id));
  }

  // Counties come from migration 0003; the sheet's placer/sacramento/both become county links.
  const countyId = new Map((await tx.select({ id: counties.id, slug: counties.slug }).from(counties)).map((c) => [c.slug, c.id]));
  const countySlugs = { placer: ['placer'], sacramento: ['sacramento'], both: ['placer', 'sacramento'] };

  for (const { categories: cats, tags: resourceTagNames, county, ...fields } of seed.resources) {
    const [{ id }] = await tx
      .insert(resources)
      // The sheet never recorded when a row was verified, so verifiedAt starts empty.
      .values(fields)
      .returning({ id: resources.id });

    await tx.insert(resourceCategories).values(
      cats.map((slug) => {
        const cid = categoryId.get(slug);
        if (!cid) throw new Error(`Unknown category "${slug}" on ${fields.name}`);
        return { resourceId: id, categoryId: cid };
      }),
    );
    await tx.insert(resourceCounties).values(
      countySlugs[county].map((slug) => {
        const cid = countyId.get(slug);
        if (!cid) throw new Error(`County "${slug}" missing; run npm run db:migrate first`);
        return { resourceId: id, countyId: cid };
      }),
    );
    if (resourceTagNames.length) {
      await tx
        .insert(resourceTags)
        .values(resourceTagNames.map((t, position) => ({ resourceId: id, tagId: tagId.get(t)!, position })));
    }
  }
});

console.log(
  `Seeded ${seed.categories.length} categories, ${seed.resources.length} resources into ${DATABASE_URL.replace(/\?.*$/, '')}.`,
);
client.close();
