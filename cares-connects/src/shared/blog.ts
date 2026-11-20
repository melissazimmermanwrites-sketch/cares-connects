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

/** A category in use on live posts, for the blog's filter. */
export interface BlogCategory {
  name: string;
  count: number;
}

/** Longest search the blog accepts, and the most words it matches on. */
export const MAX_SEARCH_LENGTH = 100;
export const MAX_SEARCH_WORDS = 6;

/**
 * Splits a blog search into the words a post must all contain, ignoring case.
 * "Food  help, Lincoln" → ["food", "help", "lincoln"]. Repeats and punctuation-only words are dropped.
 */
export function searchWords(q: string): string[] {
  const words = q
    .slice(0, MAX_SEARCH_LENGTH)
    .toLowerCase()
    .split(/[\s,]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
  return [...new Set(words)].slice(0, MAX_SEARCH_WORDS);
}

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
