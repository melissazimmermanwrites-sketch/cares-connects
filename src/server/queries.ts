import { and, asc, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from './db/client';
import { categories, counties, resourceCategories, resourceCounties, resources, resourceTags, tags } from './db/schema';
import type { CategoryRef, CountyRef } from '../shared/api-types';

/** Query helpers shared by the JSON API and the exports. */

export async function categoriesFor(ids: number[]): Promise<Map<number, CategoryRef[]>> {
  const map = new Map<number, CategoryRef[]>();
  if (!ids.length) return map;
  const rows = await db
    .select({ resourceId: resourceCategories.resourceId, id: categories.id, slug: categories.slug, name: categories.name })
    .from(resourceCategories)
    .innerJoin(categories, eq(categories.id, resourceCategories.categoryId))
    .where(inArray(resourceCategories.resourceId, ids))
    .orderBy(asc(categories.sortOrder));
  for (const { resourceId, ...cat } of rows) map.set(resourceId, [...(map.get(resourceId) ?? []), cat]);
  return map;
}

export async function countiesFor(ids: number[]): Promise<Map<number, CountyRef[]>> {
  const map = new Map<number, CountyRef[]>();
  if (!ids.length) return map;
  const rows = await db
    .select({ resourceId: resourceCounties.resourceId, id: counties.id, slug: counties.slug, name: counties.name })
    .from(resourceCounties)
    .innerJoin(counties, eq(counties.id, resourceCounties.countyId))
    .where(inArray(resourceCounties.resourceId, ids))
    .orderBy(asc(counties.name));
  for (const { resourceId, ...county } of rows) map.set(resourceId, [...(map.get(resourceId) ?? []), county]);
  return map;
}

export async function tagsFor(ids: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (!ids.length) return map;
  const rows = await db
    .select({ resourceId: resourceTags.resourceId, name: tags.name })
    .from(resourceTags)
    .innerJoin(tags, eq(tags.id, resourceTags.tagId))
    .where(inArray(resourceTags.resourceId, ids))
    .orderBy(asc(resourceTags.position), asc(tags.name));
  for (const { resourceId, name } of rows) map.set(resourceId, [...(map.get(resourceId) ?? []), name]);
  return map;
}

// Drizzle prints columns unqualified ("id") inside sql`` templates, which a correlated
// subquery would resolve against its own tables. Outer-row references must be spelled out.
const OUTER_RESOURCE_ID = sql.raw('"resources"."id"');
export const OUTER_CATEGORY_ID = sql.raw('"categories"."id"');

/** Matches name, text fields, address, or any tag. */
export function searchFilter(q: string): SQL | undefined {
  const term = q.trim();
  if (!term) return undefined;
  const pattern = `%${term.replace(/[%_\\]/g, '\\$&')}%`;
  return or(
    sql`${resources.name} like ${pattern} escape '\\'`,
    sql`${resources.services} like ${pattern} escape '\\'`,
    sql`${resources.mission} like ${pattern} escape '\\'`,
    sql`${resources.address} like ${pattern} escape '\\'`,
    sql`${resources.notes} like ${pattern} escape '\\'`,
    sql`exists (select 1 from ${resourceTags} rt join ${tags} t on t.id = rt.tag_id
                where rt.resource_id = ${OUTER_RESOURCE_ID} and t.name like ${pattern} escape '\\')`,
  );
}

export function inCategory(categoryId: number): SQL {
  return sql`exists (select 1 from ${resourceCategories} rc
                     where rc.resource_id = ${OUTER_RESOURCE_ID} and rc.category_id = ${categoryId})`;
}

/** Listings that serve a county: linked to it directly, or statewide. */
export function servesCounty(countyId: number): SQL {
  return sql`(${resources.statewide} = 1 or exists (select 1 from ${resourceCounties} rcy
                where rcy.resource_id = ${OUTER_RESOURCE_ID} and rcy.county_id = ${countyId}))`;
}

/** WHERE clause for the admin table's filters (search, county, status, category, duplicates, archived). */
export function adminWhere(q: Record<string, unknown>): SQL | undefined {
  const filters: (SQL | undefined)[] = [searchFilter(String(q['q'] ?? ''))];

  const county = String(q['county'] ?? '');
  if (county === 'statewide') filters.push(eq(resources.statewide, true));
  else if (Number(county) > 0) filters.push(servesCounty(Number(county)));
  const status = String(q['status'] ?? '');
  if (status === 'verified' || status === 'needs_verification') filters.push(eq(resources.verificationStatus, status));
  const category = Number(q['category']);
  if (Number.isInteger(category) && category > 0) filters.push(inCategory(category));
  if (q['duplicates'] === 'true') filters.push(isNotNull(resources.duplicateGroup));
  const archived = String(q['archived'] ?? 'active');
  if (archived === 'active') filters.push(eq(resources.isActive, true));
  if (archived === 'archived') filters.push(eq(resources.isActive, false));

  return and(...filters);
}
