import express, { type NextFunction, type Request, type Response, Router } from 'express';
import { and, asc, count, desc, eq, inArray, like, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db/client';
import {
  admins,
  categories,
  counties,
  discoveries,
  resourceCategories,
  resourceCounties,
  resources,
  resourceTags,
  tags,
  type Resource,
} from './db/schema';
import {
  clearLoginAttempts,
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteSessionsForAdmin,
  hashPassword,
  loginRateLimited,
  readCookie,
  requireAdmin,
  sameOriginOnly,
  SESSION_COOKIE,
  setSessionCookie,
  userForToken,
  verifyPassword,
} from './auth';
import type {
  AdminResource,
  AdminResourceRow,
  AdminStats,
  CategoryRef,
  CategorySummary,
  CountyRef,
  CountySummary,
  Page,
  PublicResource,
  ResourceInput,
} from '../shared/api-types';
import { DIRECTORY_PAGE_SIZE, serviceAreaLabel } from '../shared/api-types';
import { slugify } from '../shared/slug';
import { exportCsv, exportWorkbook } from './export';
import { adminWhere, categoriesFor, countiesFor, inCategory, OUTER_CATEGORY_ID, searchFilter, servesCounty, tagsFor } from './queries';
import { discoveryRouter } from './discovery/routes';
import { adminSubmissionRouter, submissionRouter } from './submissions/routes';
import { handle, HttpError, parse } from './http';
import { locate } from './locate';

// ---------- validation ----------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const resourceInputSchema = z
  .object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  statewide: z.boolean(),
  countyIds: z.array(z.number().int().positive()).max(58),
  ein: optionalText(12).refine((v) => !v || /^\d{9}$/.test(v), 'EIN must be 9 digits'),
  website: optionalText(500).transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v)),
  phone: optionalText(100),
  address: optionalText(300),
  mission: optionalText(4000),
  services: optionalText(8000),
  notes: optionalText(8000),
  contactPerson: optionalText(200),
  contactPhone: optionalText(100),
  contactEmail: optionalText(200).refine((v) => !v || z.email().safeParse(v).success, 'Not a valid email'),
  verificationStatus: z.enum(['verified', 'needs_verification']),
  verifiedAt: z.iso.datetime().nullish().transform((v) => (v ? new Date(v) : null)),
  duplicateGroup: optionalText(200),
  isActive: z.boolean(),
  categoryIds: z.array(z.number().int().positive()).min(1, 'Pick at least one category'),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(60)).max(60),
  })
  .refine((v) => v.statewide || v.countyIds.length > 0, {
    path: ['countyIds'],
    message: 'Pick at least one county, or mark it statewide',
  });

const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: optionalText(1000),
  sortOrder: z.number().int().min(0).max(9999),
});

function idParam(req: Request): number {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Bad id');
  return id;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toPublic(r: Resource, cats: CategoryRef[], tagNames: string[], areas: CountyRef[]): PublicResource {
  return {
    id: r.id,
    name: r.name,
    statewide: r.statewide,
    counties: areas,
    website: r.website,
    phone: r.phone,
    address: r.address,
    mission: r.mission,
    services: r.services,
    notes: r.notes,
    verificationStatus: r.verificationStatus,
    categories: cats,
    tags: tagNames,
  };
}

async function categorySummaries(includeArchived: boolean): Promise<CategorySummary[]> {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      sortOrder: categories.sortOrder,
      resourceCount: sql<number>`(select count(*) from ${resourceCategories} rc
        join ${resources} r on r.id = rc.resource_id
        where rc.category_id = ${OUTER_CATEGORY_ID} ${includeArchived ? sql`` : sql`and r.is_active = 1`})`,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

async function assertEinFree(ein: string | null, exceptId: number | null): Promise<void> {
  if (!ein) return;
  const [other] = await db.select({ id: resources.id, name: resources.name }).from(resources).where(eq(resources.ein, ein));
  if (other && other.id !== exceptId) throw new HttpError(409, `EIN ${ein} is already used by “${other.name}”.`);
}

/** Saving a listing with an EIN marks the matching IRS discovery as added, so it leaves the queue. */
async function linkDiscovery(
  tx: Pick<typeof db, 'update'>,
  ein: string | null,
  resourceId: number,
  reviewer: string,
): Promise<void> {
  if (!ein) return;
  await tx
    .update(discoveries)
    .set({ status: 'approved', resourceId, reviewedAt: new Date(), reviewedBy: reviewer })
    .where(eq(discoveries.ein, ein));
}

async function countySummaries(): Promise<CountySummary[]> {
  return db
    .select({
      id: counties.id,
      slug: counties.slug,
      name: counties.name,
      resourceCount: sql<number>`(select count(*) from ${resourceCounties} rcy
        join ${resources} r on r.id = rcy.resource_id
        where rcy.county_id = ${sql.raw('"counties"."id"')} and r.is_active = 1)`,
    })
    .from(counties)
    .orderBy(asc(counties.name));
}

async function replaceLinks(
  tx: Pick<typeof db, 'insert' | 'delete' | 'select'>,
  id: number,
  input: Pick<ResourceInput, 'categoryIds' | 'tags' | 'countyIds'>,
) {
  await tx.delete(resourceCategories).where(eq(resourceCategories.resourceId, id));
  await tx.insert(resourceCategories).values(input.categoryIds.map((categoryId) => ({ resourceId: id, categoryId })));

  await tx.delete(resourceCounties).where(eq(resourceCounties.resourceId, id));
  const countyIds = [...new Set(input.countyIds)];
  if (countyIds.length) {
    await tx.insert(resourceCounties).values(countyIds.map((countyId) => ({ resourceId: id, countyId })));
  }

  await tx.delete(resourceTags).where(eq(resourceTags.resourceId, id));
  const names = [...new Set(input.tags)];
  if (names.length) {
    await tx
      .insert(tags)
      .values(names.map((name) => ({ name })))
      .onConflictDoNothing();
    const rows = await tx.select({ id: tags.id, name: tags.name }).from(tags).where(inArray(tags.name, names));
    const idByName = new Map(rows.map((t) => [t.name, t.id]));
    await tx
      .insert(resourceTags)
      .values(names.map((name, position) => ({ resourceId: id, tagId: idByName.get(name)!, position })));
  }
}

async function adminResource(id: number): Promise<AdminResource> {
  const [r] = await db.select().from(resources).where(eq(resources.id, id));
  if (!r) throw new HttpError(404, 'Resource not found');
  const cats = (await categoriesFor([id])).get(id) ?? [];
  const tagNames = (await tagsFor([id])).get(id) ?? [];
  const areas = (await countiesFor([id])).get(id) ?? [];

  let duplicates: AdminResource['duplicates'] = [];
  if (r.duplicateGroup) {
    const others = await db
      .select({ id: resources.id, name: resources.name })
      .from(resources)
      .where(and(eq(resources.duplicateGroup, r.duplicateGroup), sql`${resources.id} <> ${id}`));
    const otherCats = await categoriesFor(others.map((o) => o.id));
    duplicates = others.map((o) => ({ ...o, categories: (otherCats.get(o.id) ?? []).map((c) => c.name) }));
  }

  return {
    id: r.id,
    name: r.name,
    statewide: r.statewide,
    countyIds: areas.map((c) => c.id),
    counties: areas,
    ein: r.ein,
    website: r.website,
    phone: r.phone,
    address: r.address,
    mission: r.mission,
    services: r.services,
    notes: r.notes,
    contactPerson: r.contactPerson,
    contactPhone: r.contactPhone,
    contactEmail: r.contactEmail,
    verificationStatus: r.verificationStatus,
    verifiedAt: iso(r.verifiedAt),
    duplicateGroup: r.duplicateGroup,
    isActive: r.isActive,
    categoryIds: cats.map((c) => c.id),
    categories: cats,
    tags: tagNames,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: r.updatedBy,
    duplicates,
  };
}

// ---------- routes ----------

export const api = Router();
api.use(express.json({ limit: '200kb' }));
api.use(sameOriginOnly);
api.use('/submissions', submissionRouter);

// Public site ---------------------------------------------------------------

api.get(
  '/categories',
  handle(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json((await categorySummaries(false)).filter((c) => c.resourceCount > 0));
  }),
);

api.get(
  '/resources',
  handle(async (req, res) => {
    const q = String(req.query['q'] ?? '');
    const county = String(req.query['county'] ?? '');
    const categorySlug = String(req.query['category'] ?? '');

    const filters: (SQL | undefined)[] = [eq(resources.isActive, true), searchFilter(q)];
    if (county) {
      const [row] = await db.select({ id: counties.id }).from(counties).where(eq(counties.slug, county));
      if (!row) throw new HttpError(404, 'County not found');
      filters.push(servesCounty(row.id));
    }
    if (categorySlug) {
      const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, categorySlug));
      if (!cat) throw new HttpError(404, 'Category not found');
      filters.push(inCategory(cat.id));
    }

    const rows = await db
      .select()
      .from(resources)
      .where(and(...filters))
      .orderBy(asc(resources.name))
      .limit(300);
    const ids = rows.map((r) => r.id);
    const [cats, tagMap, areas] = await Promise.all([categoriesFor(ids), tagsFor(ids), countiesFor(ids)]);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(rows.map((r) => toPublic(r, cats.get(r.id) ?? [], tagMap.get(r.id) ?? [], areas.get(r.id) ?? [])));
  }),
);

api.get(
  '/resources/directory',
  handle(async (req, res) => {
    const page = Math.max(Math.trunc(Number(req.query['page'])) || 1, 1);
    const county = String(req.query['county'] ?? '');

    const filters: (SQL | undefined)[] = [eq(resources.isActive, true)];
    if (county) {
      const [row] = await db.select({ id: counties.id }).from(counties).where(eq(counties.slug, county));
      if (!row) throw new HttpError(404, 'County not found');
      filters.push(servesCounty(row.id));
    }
    const where = and(...filters);

    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() }).from(resources).where(where),
      db
        .select()
        .from(resources)
        .where(where)
        .orderBy(asc(resources.name), asc(resources.id))
        .limit(DIRECTORY_PAGE_SIZE)
        .offset((page - 1) * DIRECTORY_PAGE_SIZE),
    ]);
    const ids = rows.map((r) => r.id);
    const [cats, tagMap, areas] = await Promise.all([categoriesFor(ids), tagsFor(ids), countiesFor(ids)]);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      items: rows.map((r) => toPublic(r, cats.get(r.id) ?? [], tagMap.get(r.id) ?? [], areas.get(r.id) ?? [])),
      total,
    });
  }),
);

api.get(
  '/resources/:id',
  handle(async (req, res) => {
    const id = idParam(req);
    const [r] = await db
      .select()
      .from(resources)
      .where(and(eq(resources.id, id), eq(resources.isActive, true)));
    if (!r) throw new HttpError(404, 'Resource not found');
    const [cats, tagMap, areas] = await Promise.all([categoriesFor([id]), tagsFor([id]), countiesFor([id])]);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(toPublic(r, cats.get(id) ?? [], tagMap.get(id) ?? [], areas.get(id) ?? []));
  }),
);

/** Chat widget: "95678" / "Roseville" / "placer county" → a California county. */
api.get(
  '/locate',
  handle(async (req, res) => {
    const q = String(req.query['q'] ?? '').slice(0, 100);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(await locate(q));
  }),
);

/** Counties with at least one live listing, for the public "Where are you?" picker. */
api.get(
  '/counties',
  handle(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json((await countySummaries()).filter((c) => c.resourceCount > 0));
  }),
);

// Auth ----------------------------------------------------------------------

api.post(
  '/auth/login',
  handle(async (req, res) => {
    const { email, password } = parse(
      z.object({ email: z.string().trim().toLowerCase().min(1), password: z.string().min(1) }),
      req.body,
    );
    const limitKey = `${req.ip}|${email}`;
    if (loginRateLimited(limitKey)) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');

    const [admin] = await db.select().from(admins).where(eq(admins.email, email));
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      throw new HttpError(401, 'Email or password is incorrect.');
    }
    clearLoginAttempts(limitKey);
    await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));
    const { token, expiresAt } = await createSession(admin.id);
    setSessionCookie(req, res, token, expiresAt);
    res.json({ id: admin.id, email: admin.email, name: admin.name });
  }),
);

api.post(
  '/auth/logout',
  handle(async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await deleteSession(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

api.get(
  '/auth/me',
  handle(async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    res.set('Cache-Control', 'no-store');
    res.json(token ? await userForToken(token) : null);
  }),
);

// Admin ---------------------------------------------------------------------

const admin = Router();
admin.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  requireAdmin(req, res, next).catch(next);
});

admin.post(
  '/password',
  handle(async (req, res) => {
    const { currentPassword, newPassword } = parse(
      z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10, 'Use at least 10 characters') }),
      req.body,
    );
    const user = res.locals.user!;
    const [row] = await db.select().from(admins).where(eq(admins.id, user.id));
    if (!(await verifyPassword(currentPassword, row.passwordHash))) {
      throw new HttpError(400, 'Current password is incorrect.');
    }
    await db
      .update(admins)
      .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(admins.id, user.id));
    // Sign out other browsers, keep this one signed in.
    await deleteSessionsForAdmin(user.id);
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(req, res, token, expiresAt);
    res.json({ ok: true });
  }),
);

admin.get(
  '/stats',
  handle(async (_req, res) => {
    const [row] = await db
      .select({
        total: count(),
        active: sql<number>`sum(${resources.isActive})`,
        needsVerification: sql<number>`sum(${resources.isActive} and ${resources.verificationStatus} = 'needs_verification')`,
        possibleDuplicates: sql<number>`sum(${resources.isActive} and ${resources.duplicateGroup} is not null)`,
      })
      .from(resources);
    const stats: AdminStats = {
      total: row.total,
      active: Number(row.active ?? 0),
      archived: row.total - Number(row.active ?? 0),
      needsVerification: Number(row.needsVerification ?? 0),
      possibleDuplicates: Number(row.possibleDuplicates ?? 0),
    };
    res.json(stats);
  }),
);

const SORT_COLUMNS = {
  name: resources.name,
  verificationStatus: resources.verificationStatus,
  verifiedAt: resources.verifiedAt,
  updatedAt: resources.updatedAt,
} as const;

admin.get(
  '/resources',
  handle(async (req, res) => {
    const q = req.query;
    const sortKey = String(q['sort'] ?? 'name') as keyof typeof SORT_COLUMNS;
    const sortColumn = SORT_COLUMNS[sortKey] ?? resources.name;
    const order = q['dir'] === 'desc' ? desc(sortColumn) : asc(sortColumn);
    const pageSize = Math.min(Math.max(Number(q['pageSize']) || 25, 1), 200);
    const page = Math.max(Number(q['page']) || 0, 0);

    const where = adminWhere(q);
    const [{ total }] = await db.select({ total: count() }).from(resources).where(where);
    const rows = await db
      .select()
      .from(resources)
      .where(where)
      .orderBy(order, asc(resources.id))
      .limit(pageSize)
      .offset(page * pageSize);
    const [cats, areas] = await Promise.all([categoriesFor(rows.map((r) => r.id)), countiesFor(rows.map((r) => r.id))]);

    const body: Page<AdminResourceRow> = {
      total,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        serviceArea: serviceAreaLabel({ statewide: r.statewide, counties: areas.get(r.id) ?? [] }),
        phone: r.phone,
        website: r.website,
        verificationStatus: r.verificationStatus,
        verifiedAt: iso(r.verifiedAt),
        duplicateGroup: r.duplicateGroup,
        isActive: r.isActive,
        categories: (cats.get(r.id) ?? []).map((c) => c.name),
        updatedAt: r.updatedAt.toISOString(),
        updatedBy: r.updatedBy,
      })),
    };
    res.json(body);
  }),
);

admin.get(
  '/resources/:id',
  handle(async (req, res) => {
    res.json(await adminResource(idParam(req)));
  }),
);

admin.post(
  '/resources',
  handle(async (req, res) => {
    const input = parse(resourceInputSchema, req.body);
    const { categoryIds: _c, tags: _t, countyIds: _co, ...fields } = input;
    await assertEinFree(input.ein, null);
    const id = await db.transaction(async (tx) => {
      const [{ id }] = await tx
        .insert(resources)
        .values({ ...fields, updatedBy: res.locals.user!.email })
        .returning({ id: resources.id });
      await replaceLinks(tx, id, input);
      await linkDiscovery(tx, input.ein, id, res.locals.user!.email);
      return id;
    });
    res.status(201).json(await adminResource(id));
  }),
);

admin.put(
  '/resources/:id',
  handle(async (req, res) => {
    const id = idParam(req);
    const input = parse(resourceInputSchema, req.body);
    const { categoryIds: _c, tags: _t, countyIds: _co, ...fields } = input;
    await assertEinFree(input.ein, id);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ duplicateGroup: resources.duplicateGroup })
        .from(resources)
        .where(eq(resources.id, id));
      const updated = await tx
        .update(resources)
        .set({ ...fields, updatedBy: res.locals.user!.email, updatedAt: new Date() })
        .where(eq(resources.id, id))
        .returning({ id: resources.id });
      if (!updated.length) throw new HttpError(404, 'Resource not found');
      await replaceLinks(tx, id, input);
      await linkDiscovery(tx, input.ein, id, res.locals.user!.email);

      // If clearing this flag leaves a single listing in the group, that one isn't a duplicate either.
      const oldGroup = before?.duplicateGroup;
      if (oldGroup && oldGroup !== input.duplicateGroup) {
        const remaining = await tx
          .select({ id: resources.id })
          .from(resources)
          .where(eq(resources.duplicateGroup, oldGroup));
        if (remaining.length === 1) {
          await tx.update(resources).set({ duplicateGroup: null }).where(eq(resources.id, remaining[0].id));
        }
      }
    });
    res.json(await adminResource(id));
  }),
);

admin.get(
  '/counties',
  handle(async (_req, res) => {
    res.json(await countySummaries());
  }),
);

admin.use('/discovery', discoveryRouter);
admin.use('/submissions', adminSubmissionRouter);

admin.get(
  '/export.csv',
  handle(async (req, res) => exportCsv(req, res)),
);

admin.get(
  '/export.xlsx',
  handle(async (_req, res) => exportWorkbook(res)),
);

admin.get(
  '/categories',
  handle(async (_req, res) => {
    res.json(await categorySummaries(true));
  }),
);

admin.post(
  '/categories',
  handle(async (req, res) => {
    const input = parse(categoryInputSchema, req.body);
    const slug = slugify(input.name);
    const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
    if (existing) throw new HttpError(409, 'A category with that name already exists.');
    const [row] = await db
      .insert(categories)
      .values({ ...input, slug })
      .returning();
    res.status(201).json(row);
  }),
);

admin.put(
  '/categories/:id',
  handle(async (req, res) => {
    // The slug (public URL) stays fixed when a category is renamed so existing links keep working.
    const input = parse(categoryInputSchema, req.body);
    const [row] = await db
      .update(categories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(categories.id, idParam(req)))
      .returning();
    if (!row) throw new HttpError(404, 'Category not found');
    res.json(row);
  }),
);

admin.delete(
  '/categories/:id',
  handle(async (req, res) => {
    const id = idParam(req);
    const [{ used }] = await db
      .select({ used: count() })
      .from(resourceCategories)
      .where(eq(resourceCategories.categoryId, id));
    if (used > 0) throw new HttpError(409, `Move or remove its ${used} listings first.`);
    await db.delete(categories).where(eq(categories.id, id));
    res.json({ ok: true });
  }),
);

admin.get(
  '/tags',
  handle(async (req, res) => {
    const q = String(req.query['q'] ?? '').trim().toLowerCase();
    const rows = await db
      .select({ name: tags.name })
      .from(tags)
      .where(q ? like(tags.name, `${q}%`) : undefined)
      .orderBy(asc(tags.name))
      .limit(20);
    res.json(rows.map((r) => r.name));
  }),
);

api.use('/admin', admin);

api.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
