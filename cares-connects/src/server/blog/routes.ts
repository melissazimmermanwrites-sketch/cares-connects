import { randomBytes } from 'node:crypto';
import express, { type ErrorRequestHandler, Router } from 'express';
import { and, asc, count, desc, eq, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { blogMedia, blogPosts } from '../db/schema';
import { handle, HttpError, parse } from '../http';
import type { Page } from '../../shared/api-types';
import { BLOG_PAGE_SIZE, type AdminPost, type AdminPostRow, type PostSummary, type PublicPost } from '../../shared/blog';
import { slugify } from '../../shared/slug';
import { renderMarkdown } from './markdown';
import { detectImageType, MAX_IMAGE_BYTES } from './media';

type Post = typeof blogPosts.$inferSelect;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const postSchema = z
  .object({
    title: z.string().trim().min(1, 'Add a title').max(200),
    slug: z
      .string()
      .trim()
      .max(120)
      .transform((v) => slugify(v)),
    description: z.string().trim().max(300),
    body: z.string().max(150_000),
    coverImage: optionalText(100).refine((v) => !v || /^\/media\/[a-f0-9]{24}$/.test(v), 'Choose an uploaded image'),
    coverAlt: optionalText(300),
    author: optionalText(100),
    status: z.enum(['draft', 'published']),
    publishedOn: optionalText(10).refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), 'Enter a valid date'),
  })
  .superRefine((post, ctx) => {
    if (post.status !== 'published') return;
    if (!post.body.trim()) ctx.addIssue({ code: 'custom', path: ['body'], message: 'Write the post before publishing' });
    if (!post.description) ctx.addIssue({ code: 'custom', path: ['description'], message: 'Add a description before publishing' });
    if (post.coverImage && !post.coverAlt) {
      ctx.addIssue({ code: 'custom', path: ['coverAlt'], message: 'Describe the cover image before publishing' });
    }
  });

const toDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
// Noon UTC, so the date doesn't move a day in US time zones.
const fromDay = (day: string) => new Date(`${day}T12:00:00Z`);

const toSummary = (p: Post): PostSummary => ({
  slug: p.slug,
  title: p.title,
  description: p.description,
  coverImage: p.coverImage,
  coverAlt: p.coverAlt,
  author: p.author,
  publishedAt: p.publishedAt!.toISOString(),
});

const toAdmin = (p: Post): AdminPost => ({
  id: p.id,
  slug: p.slug,
  title: p.title,
  description: p.description,
  body: p.body,
  coverImage: p.coverImage,
  coverAlt: p.coverAlt,
  author: p.author,
  status: p.status,
  publishedOn: toDay(p.publishedAt),
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
  updatedBy: p.updatedBy,
});

/** Published, and its date has arrived. */
const isLive = () => and(eq(blogPosts.status, 'published'), lte(blogPosts.publishedAt, new Date()));

/** Public endpoints. Mounted at /api/posts. */
export const blogRouter = Router();

blogRouter.get(
  '/',
  handle(async (req, res) => {
    const page = Math.max(Math.trunc(Number(req.query['page'])) || 1, 1);
    const [{ total }] = await db.select({ total: count() }).from(blogPosts).where(isLive());
    const rows = await db
      .select()
      .from(blogPosts)
      .where(isLive())
      .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id))
      .limit(BLOG_PAGE_SIZE)
      .offset((page - 1) * BLOG_PAGE_SIZE);
    const body: Page<PostSummary> = { total, items: rows.map(toSummary) };
    res.set('Cache-Control', 'public, max-age=60');
    res.json(body);
  }),
);

blogRouter.get(
  '/:slug',
  handle(async (req, res) => {
    const [post] = await db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.slug, String(req.params['slug'])), isLive()));
    if (!post) throw new HttpError(404, 'Post not found');
    const body: PublicPost = { ...toSummary(post), html: renderMarkdown(post.body) };
    res.set('Cache-Control', 'public, max-age=60');
    res.json(body);
  }),
);

/** Published posts for the sitemap. */
export async function livePostsForSitemap() {
  return db
    .select({ slug: blogPosts.slug, updatedAt: blogPosts.updatedAt })
    .from(blogPosts)
    .where(isLive())
    .orderBy(asc(blogPosts.id));
}

/** Serves an uploaded image. Mounted at /media (outside /api, so images can appear in search). */
export const mediaRouter = Router();

mediaRouter.get(
  '/media/:id',
  handle(async (req, res) => {
    const id = String(req.params['id']);
    if (!/^[a-f0-9]{24}$/.test(id)) throw new HttpError(404, 'Not found');
    const [image] = await db.select().from(blogMedia).where(eq(blogMedia.id, id));
    if (!image) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    res
      .type(image.contentType)
      .set('Cache-Control', 'public, max-age=31536000, immutable')
      .send(Buffer.from(image.data));
  }),
);

function postValues(input: z.output<typeof postSchema>, slug: string, existing: Post | null, email: string) {
  // Publishing without a date means today. A draft keeps whatever date it was given.
  const publishedAt = input.publishedOn
    ? fromDay(input.publishedOn)
    : input.status === 'published'
      ? (existing?.publishedAt ?? new Date())
      : null;
  return {
    slug,
    title: input.title,
    description: input.description,
    body: input.body,
    coverImage: input.coverImage,
    coverAlt: input.coverAlt,
    author: input.author,
    status: input.status,
    publishedAt,
    updatedBy: email,
    updatedAt: new Date(),
  };
}

async function assertSlugFree(slug: string, id?: number): Promise<void> {
  const [other] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, slug));
  if (other && other.id !== id) throw new HttpError(409, 'Another post already uses this web address. Change it and try again.');
}

const idParam = (raw: unknown) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Bad id');
  return id;
};

/** Blog admin. Mounted at /api/admin/posts (login required). */
export const adminBlogRouter = Router();

adminBlogRouter.get(
  '/',
  handle(async (req, res) => {
    const filters: (SQL | undefined)[] = [];
    const status = String(req.query['status'] ?? '');
    if (status === 'draft' || status === 'published') filters.push(eq(blogPosts.status, status));
    const term = String(req.query['q'] ?? '').trim();
    if (term) {
      const pattern = `%${term.replace(/[%_\\]/g, '\\$&')}%`;
      filters.push(or(sql`${blogPosts.title} like ${pattern} escape '\\'`, sql`${blogPosts.body} like ${pattern} escape '\\'`));
    }
    const where = and(...filters);
    const pageSize = 25;
    const page = Math.max(Number(req.query['page']) || 0, 0);
    const [{ total }] = await db.select({ total: count() }).from(blogPosts).where(where);
    const rows = await db
      .select()
      .from(blogPosts)
      .where(where)
      .orderBy(desc(blogPosts.updatedAt), desc(blogPosts.id))
      .limit(pageSize)
      .offset(page * pageSize);
    const body: Page<AdminPostRow> = {
      total,
      items: rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        status: p.status,
        publishedOn: toDay(p.publishedAt),
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
    res.json(body);
  }),
);

/** Renders with the same code as the public page, so the preview can't differ from the real post. */
adminBlogRouter.post(
  '/preview',
  handle(async (req, res) => {
    const { body } = parse(z.object({ body: z.string().max(150_000) }), req.body);
    res.json({ html: renderMarkdown(body) });
  }),
);

adminBlogRouter.get(
  '/:id',
  handle(async (req, res) => {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, idParam(req.params['id'])));
    if (!post) throw new HttpError(404, 'Post not found');
    res.json(toAdmin(post));
  }),
);

adminBlogRouter.post(
  '/',
  handle(async (req, res) => {
    const input = parse(postSchema, req.body);
    const slug = input.slug || slugify(input.title);
    if (!slug) throw new HttpError(400, 'Add a web address for this post');
    await assertSlugFree(slug);
    const [post] = await db
      .insert(blogPosts)
      .values(postValues(input, slug, null, res.locals.user!.email))
      .returning();
    res.status(201).json(toAdmin(post));
  }),
);

adminBlogRouter.put(
  '/:id',
  handle(async (req, res) => {
    const id = idParam(req.params['id']);
    const input = parse(postSchema, req.body);
    const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    if (!existing) throw new HttpError(404, 'Post not found');
    const slug = input.slug || slugify(input.title);
    if (!slug) throw new HttpError(400, 'Add a web address for this post');
    await assertSlugFree(slug, id);
    const [post] = await db
      .update(blogPosts)
      .set(postValues(input, slug, existing, res.locals.user!.email))
      .where(eq(blogPosts.id, id))
      .returning();
    res.json(toAdmin(post));
  }),
);

adminBlogRouter.delete(
  '/:id',
  handle(async (req, res) => {
    const deleted = await db.delete(blogPosts).where(eq(blogPosts.id, idParam(req.params['id']))).returning({ id: blogPosts.id });
    if (!deleted.length) throw new HttpError(404, 'Post not found');
    res.json({ ok: true });
  }),
);

/** Image upload. Mounted at /api/admin/media (login required). */
export const adminMediaRouter = Router();

/** The body parser rejects oversized files before the handler runs, so explain that here. */
const explainTooLarge: ErrorRequestHandler = (err, _req, _res, next) => {
  const tooLarge = (err as { type?: string }).type === 'entity.too.large';
  next(tooLarge ? new HttpError(413, 'That image is over 3 MB. Please use a smaller one.') : err);
};

adminMediaRouter.post(
  '/',
  express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
  handle(async (req, res) => {
    const data = req.body as Buffer;
    if (!Buffer.isBuffer(data) || !data.length) throw new HttpError(400, 'Choose an image to upload.');
    const contentType = detectImageType(data);
    if (!contentType) throw new HttpError(415, 'Use a JPEG, PNG, GIF or WebP image.');
    const id = randomBytes(12).toString('hex');
    await db.insert(blogMedia).values({ id, contentType, data, size: data.length, uploadedBy: res.locals.user!.email });
    res.status(201).json({ url: `/media/${id}` });
  }),
  explainTooLarge,
);
