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

export interface AdminPostRow {
  id: number;
  slug: string;
  title: string;
  status: PostStatus;
  publishedOn: string | null;
  updatedAt: string;
}
