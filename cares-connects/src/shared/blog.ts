/** Shared shapes for the public blog and its admin. */

export const BLOG_PAGE_SIZE = 10;

export type PostStatus = 'draft' | 'published';

export interface PostSummary {
  slug: string;
  title: string;
  description: string;
  coverImage: string | null;
  coverAlt: string | null;
  author: string | null;
  categories: string[];
  publishedAt: string;
}

export interface PublicPost extends PostSummary {
  /** Rendered from Markdown on the server; raw HTML is escaped and unsafe links removed. */
  html: string;
}

export interface PostInput {
  slug: string;
  title: string;
  description: string;
  body: string;
  coverImage: string | null;
  coverAlt: string | null;
  author: string | null;
  categories: string[];
  status: PostStatus;
  /** YYYY-MM-DD. Can be in the past for older posts; a future date goes live on that day. */
  publishedOn: string | null;
}

export interface AdminPost extends PostInput {
  id: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

/** Most categories a post can have. */
export const MAX_CATEGORIES = 6;

/** Trims, drops blanks and repeats (ignoring case), and keeps the first spelling used. */
export function cleanCategories(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.replace(/\s+/g, ' ').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export interface AdminPostRow {
  id: number;
  slug: string;
  title: string;
  status: PostStatus;
  publishedOn: string | null;
  updatedAt: string;
}
