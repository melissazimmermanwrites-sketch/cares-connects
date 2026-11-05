import { Router } from 'express';
import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { categories, counties, discoveries, discoveryRuns } from '../db/schema';
import { handle, HttpError, parse } from '../http';
import type { DiscoveryRow, DiscoveryRunInfo, DiscoverySummary, Page } from '../../shared/api-types';
import { latestRun, runDiscovery, startRun } from './import';

/** Admin endpoints for the IRS discovery queue. Mounted at /api/admin/discovery (login required). */
export const discoveryRouter = Router();

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toRunInfo(run: typeof discoveryRuns.$inferSelect): DiscoveryRunInfo {
  return { ...run, startedAt: run.startedAt.toISOString(), finishedAt: iso(run.finishedAt) };
}

const rowSelect = {
  d: discoveries,
  countyName: counties.name,
  countySlug: counties.slug,
  categoryId: categories.id,
  categoryName: categories.name,
};

function toRow(r: {
  d: typeof discoveries.$inferSelect;
  countyName: string | null;
  countySlug: string | null;
  categoryId: number | null;
  categoryName: string | null;
}): DiscoveryRow {
  const d = r.d;
  return {
    ein: d.ein,
    name: d.name,
    street: d.street,
    city: d.city,
    zip: d.zip,
    county: d.countyId && r.countyName ? { id: d.countyId, name: r.countyName, slug: r.countySlug! } : null,
    ntee: d.ntee,
    ruling: d.ruling && d.ruling.length === 6 ? `${d.ruling.slice(0, 4)}-${d.ruling.slice(4)}` : null,
    category:
      r.categoryId && r.categoryName ? { id: r.categoryId, name: r.categoryName, slug: d.categorySlug! } : null,
    status: d.status,
    inIrs: d.inIrs,
    firstSeenAt: d.firstSeenAt.toISOString(),
    reviewedAt: iso(d.reviewedAt),
    reviewedBy: d.reviewedBy,
    resourceId: d.resourceId,
  };
}

const baseQuery = () =>
  db
    .select(rowSelect)
    .from(discoveries)
    .leftJoin(counties, eq(counties.id, discoveries.countyId))
    .leftJoin(categories, eq(categories.slug, discoveries.categorySlug));

discoveryRouter.get(
  '/summary',
  handle(async (_req, res) => {
    const [{ total }] = await db.select({ total: count() }).from(discoveries);
    const [{ newCount }] = await db.select({ newCount: count() }).from(discoveries).where(eq(discoveries.status, 'new'));
    const run = await latestRun();
    const body: DiscoverySummary = { total, newCount, lastRun: run ? toRunInfo(run) : null };
    res.json(body);
  }),
);

discoveryRouter.get(
  '/',
  handle(async (req, res) => {
    const q = req.query;
    const filters: (SQL | undefined)[] = [];
    const status = String(q['status'] ?? 'new');
    if (status !== 'all') filters.push(eq(discoveries.status, status as typeof discoveries.$inferSelect.status));
    const county = Number(q['county']);
    if (county > 0) filters.push(eq(discoveries.countyId, county));
    const category = Number(q['category']);
    if (category > 0) filters.push(eq(categories.id, category));
    const term = String(q['q'] ?? '').trim();
    if (term) {
      const pattern = `%${term.replace(/[%_\\]/g, '\\$&')}%`;
      filters.push(
        sql`(${discoveries.name} like ${pattern} escape '\\' or ${discoveries.city} like ${pattern} escape '\\' or ${discoveries.ein} = ${term.replace(/\D/g, '')})`,
      );
    }
    const where = and(...filters);
    const pageSize = Math.min(Math.max(Number(q['pageSize']) || 25, 1), 100);
    const page = Math.max(Number(q['page']) || 0, 0);

    const [{ total }] = await db
      .select({ total: count() })
      .from(discoveries)
      .leftJoin(categories, eq(categories.slug, discoveries.categorySlug))
      .where(where);
    // The queue shows the newest IRS registrations first; searches are alphabetical.
    const order = status === 'new' ? [desc(discoveries.ruling), asc(discoveries.name)] : [asc(discoveries.name)];
    const rows = await baseQuery()
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset(page * pageSize);

    const body: Page<DiscoveryRow> = { total, items: rows.map(toRow) };
    res.json(body);
  }),
);

discoveryRouter.get(
  '/:ein',
  handle(async (req, res) => {
    const [row] = await baseQuery().where(eq(discoveries.ein, String(req.params['ein'])));
    if (!row) throw new HttpError(404, 'Not found');
    res.json(toRow(row));
  }),
);

discoveryRouter.post(
  '/:ein/status',
  handle(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['new', 'available', 'rejected', 'listed']) }), req.body);
    const updated = await db
      .update(discoveries)
      .set({
        status,
        reviewedAt: status === 'new' || status === 'available' ? null : new Date(),
        reviewedBy: status === 'new' || status === 'available' ? null : res.locals.user!.email,
      })
      .where(eq(discoveries.ein, String(req.params['ein'])))
      .returning({ ein: discoveries.ein });
    if (!updated.length) throw new HttpError(404, 'Not found');
    const [row] = await baseQuery().where(eq(discoveries.ein, String(req.params['ein'])));
    res.json(toRow(row));
  }),
);

/**
 * Serverless hosts (Cloudflare Workers, Netlify) stop a function after ~10s and freeze it once it responds, while a
 * full import against Turso takes ~30–40s. There, the button starts the GitHub Action instead,
 * when GITHUB_DISPATCH_TOKEN (a token allowed to run workflows) and GITHUB_REPOSITORY are set.
 */
async function dispatchWorkflow(): Promise<void> {
  const token = process.env['GITHUB_DISPATCH_TOKEN'];
  const repo = process.env['GITHUB_REPOSITORY'];
  if (!token || !repo) {
    throw new HttpError(
      409,
      'On this host the IRS check runs from GitHub Actions (every Monday). Start it now from the repository’s Actions tab → “IRS discovery” → Run workflow.',
    );
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/discover.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (!res.ok) throw new HttpError(502, `GitHub did not start the IRS check (HTTP ${res.status}).`);
}

/** True on Netlify (AWS Lambda) and Cloudflare Workers, where a long import can't run in the background. */
function onServerlessHost(): boolean {
  return !!process.env['AWS_LAMBDA_FUNCTION_NAME'] || globalThis.navigator?.userAgent === 'Cloudflare-Workers';
}

/** "Check the IRS now": starts a run in the background and returns immediately. */
discoveryRouter.post(
  '/run',
  handle(async (_req, res) => {
    if (onServerlessHost()) {
      await dispatchWorkflow();
      res.status(202).json({ runId: null, message: 'Started on GitHub Actions; results appear here in a minute or two.' });
      return;
    }
    let runId: number;
    try {
      runId = await startRun(res.locals.user!.email);
    } catch (err) {
      throw new HttpError(409, err instanceof Error ? err.message : 'Could not start.');
    }
    runDiscovery(runId, { triggeredBy: res.locals.user!.email }).catch((err) =>
      console.error('[discovery] run failed', err),
    );
    res.status(202).json({ runId });
  }),
);
