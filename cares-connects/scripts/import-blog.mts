/**
 * Imports Markdown blog posts (with front matter) and their cover images into DATABASE_URL.
 * Made for the posts exported from the old site in data/blog-import/.
 *
 *   npm run blog:import                 # data/blog-import
 *   npm run blog:import -- <folder>
 *
 * Each post's cover image is the .jpg/.png/.webp with the same name as its slug. Posts whose
 * slug already exists are skipped, so running it twice is safe and never overwrites edits.
 */
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { client, db, DATABASE_URL } from '../src/server/db/client';
import { blogMedia, blogPosts } from '../src/server/db/schema';
import { cleanCategories, MAX_CATEGORIES } from '../src/shared/blog';
import { detectImageType, MAX_IMAGE_BYTES } from '../src/server/blog/media';

const dir = process.argv[2] ?? 'data/blog-import';

/** Reads the simple `key: value` front matter the export uses. Lists stay as their `[a, b]` text. */
function parse(file: string): { meta: Record<string, string>; body: string } {
  const text = readFileSync(file, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${file}: no front matter`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([A-Za-z]\w*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value) as string;
    meta[kv[1]] = value;
  }
  return { meta, body: match[2].trim() + '\n' };
}

function findImage(slug: string): Buffer | null {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    try {
      return readFileSync(join(dir, `${slug}.${ext}`));
    } catch {
      // try the next extension
    }
  }
  return null;
}

console.log(`Importing posts from ${dir} into ${DATABASE_URL}`);
const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
let added = 0;

for (const file of files) {
  const { meta, body } = parse(join(dir, file));
  const slug = meta['slug'];
  const title = meta['title'];
  if (!slug || !title) throw new Error(`${file}: needs a title and slug`);

  const [existing] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, slug));
  if (existing) {
    console.log(`  skip  ${slug} (already there)`);
    continue;
  }

  let coverImage: string | null = null;
  const image = findImage(slug);
  if (image) {
    const contentType = detectImageType(image);
    if (!contentType) throw new Error(`${slug}: cover image isn't a JPEG, PNG, GIF or WebP`);
    if (image.length > MAX_IMAGE_BYTES) throw new Error(`${slug}: cover image is over 3 MB`);
    const id = randomBytes(12).toString('hex');
    await db.insert(blogMedia).values({ id, contentType, data: image, size: image.length, uploadedBy: 'import' });
    coverImage = `/media/${id}`;
  }

  const publishedAt = meta['publishedAt'] ? new Date(meta['publishedAt']) : null;
  await db.insert(blogPosts).values({
    slug,
    title,
    description: meta['description'] ?? '',
    body,
    coverImage,
    coverAlt: coverImage ? (meta['imageAlt'] ?? null) : null,
    author: meta['author'] ?? null,
    categories: cleanCategories((meta['categories'] ?? '').replace(/^\[|\]$/g, '').split(',')).slice(0, MAX_CATEGORIES),
    status: meta['status'] === 'published' ? 'published' : 'draft',
    publishedAt,
    updatedBy: 'import',
  });
  added++;
  console.log(`  added ${slug}${coverImage ? ' (with cover image)' : ''}`);
}

console.log(`Done: ${added} added, ${files.length - added} skipped.`);
client.close();
