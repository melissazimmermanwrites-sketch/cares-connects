import { type NextFunction, type Request, type Response, Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from './db/client';
import { categories, resources } from './db/schema';
import { shouldNoindex } from './robots';
import { resourceParam } from '../shared/slug';

/** Public origin for sitemap links. Set SITE_URL in production if the domain changes. */
const SITE_URL = (process.env['SITE_URL'] ?? 'https://caresconnects.org').replace(/\/$/, '');

/**
 * Security headers for every response.
 * HSTS is only sent over HTTPS (browsers ignore it on plain HTTP anyway). It starts at one year
 * without includeSubDomains/preload; add those once every caresconnects.org subdomain serves HTTPS.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  // Narrow CSP that doesn't fight Angular's inline hydration scripts: no framing, no plugins,
  // forms and <base> stay on this origin.
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  );
  // NOINDEX=true on test/staging deploys keeps them out of search results entirely.
  if (shouldNoindex(req.get('host'), req.path, process.env['NOINDEX'])) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
}

export const siteFiles = Router();

siteFiles.get('/robots.txt', (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600');
  res.send(['User-agent: *', 'Disallow: /admin', 'Disallow: /api/', '', `Sitemap: ${SITE_URL}/sitemap.xml`, ''].join('\n'));
});

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

siteFiles.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const [cats, live] = await Promise.all([
      db.select({ slug: categories.slug, updatedAt: categories.updatedAt }).from(categories).orderBy(asc(categories.sortOrder)),
      db
        .select({ id: resources.id, name: resources.name, updatedAt: resources.updatedAt })
        .from(resources)
        .where(eq(resources.isActive, true))
        .orderBy(asc(resources.id)),
    ]);
    const entry = (path: string, lastmod?: Date, priority = '0.5') =>
      `  <url><loc>${xmlEscape(SITE_URL + path)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${priority}</priority></url>`;
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      entry('/', undefined, '1.0'),
      entry('/find', undefined, '0.9'),
      entry('/resources', undefined, '0.8'),
      entry('/list-your-organization', undefined, '0.5'),
      ...cats.map((c) => entry(`/category/${c.slug}`, c.updatedAt, '0.8')),
      ...live.map((r) => entry(`/resource/${resourceParam(r)}`, r.updatedAt, '0.6')),
      '</urlset>',
      '',
    ].join('\n');
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(body);
  } catch (err) {
    next(err);
  }
});
