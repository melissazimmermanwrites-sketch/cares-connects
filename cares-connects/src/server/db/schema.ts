import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const VERIFICATION_STATUSES = ['verified', 'needs_verification'] as const;

export const DISCOVERY_STATUSES = ['new', 'available', 'approved', 'rejected', 'listed'] as const;
export const RUN_STATUSES = ['running', 'success', 'failed'] as const;
export const CONTACT_STATUSES = ['new', 'read', 'spam'] as const;

export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
};

/** A directory section, e.g. "Food" or "Shelter & Housing" (one per tab in the original sheet). */
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

/** California's 58 counties (seeded by migration from the Census list). */
export const counties = sqliteTable('counties', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fips: text('fips').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});

/** One listing in the directory. A resource can appear in several categories. */
export const resources = sqliteTable(
  'resources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    website: text('website'),
    phone: text('phone'),
    address: text('address'),
    mission: text('mission'),
    services: text('services'),
    notes: text('notes'),
    contactPerson: text('contact_person'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    verificationStatus: text('verification_status', { enum: VERIFICATION_STATUSES })
      .notNull()
      .default('needs_verification'),
    verifiedAt: integer('verified_at', { mode: 'timestamp' }),
    /** Shared by listings that look like the same org with different details; cleared once reviewed. */
    duplicateGroup: text('duplicate_group'),
    /** Archived listings are hidden from the public site but kept for history. */
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    /** Serves all of California, regardless of the counties linked below. */
    statewide: integer('statewide', { mode: 'boolean' }).notNull().default(false),
    /** IRS employer ID, set when the listing came from (or was matched to) IRS discovery. */
    ein: text('ein').unique(),
    /** Email of the admin who last saved this listing. */
    updatedBy: text('updated_by'),
    ...timestamps,
  },
  (t) => [
    index('resources_name_idx').on(t.name),
    index('resources_status_idx').on(t.verificationStatus),
    index('resources_duplicate_group_idx').on(t.duplicateGroup),
  ],
);

export const resourceCategories = sqliteTable(
  'resource_categories',
  {
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.categoryId] }),
    index('resource_categories_category_idx').on(t.categoryId),
  ],
);

/** Counties a listing serves (its service area). */
export const resourceCounties = sqliteTable(
  'resource_counties',
  {
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    countyId: integer('county_id')
      .notNull()
      .references(() => counties.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.countyId] }), index('resource_counties_county_idx').on(t.countyId)],
);

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const resourceTags = sqliteTable(
  'resource_tags',
  {
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    /** Keeps tags in the order they were entered. */
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.tagId] }),
    index('resource_tags_tag_idx').on(t.tagId),
  ],
);

/**
 * California 501(c)(3)s found in the IRS Exempt Organizations file that match a human-services
 * NTEE code. "new" ones wait in the admin's review queue; "available" ones are searchable but
 * were already registered before discovery started; approved ones link to the listing they became.
 */
export const discoveries = sqliteTable(
  'discoveries',
  {
    ein: text('ein').primaryKey(),
    name: text('name').notNull(),
    street: text('street'),
    city: text('city'),
    zip: text('zip'),
    countyId: integer('county_id').references(() => counties.id),
    ntee: text('ntee').notNull(),
    /** IRS ruling month, YYYYMM. */
    ruling: text('ruling'),
    /** Suggested CARES category slug from the NTEE code. */
    categorySlug: text('category_slug'),
    status: text('status', { enum: DISCOVERY_STATUSES }).notNull().default('available'),
    /** False when the org dropped out of the latest IRS file (revoked or moved). */
    inIrs: integer('in_irs', { mode: 'boolean' }).notNull().default(true),
    firstSeenRunId: integer('first_seen_run_id'),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    reviewedBy: text('reviewed_by'),
    resourceId: integer('resource_id').references(() => resources.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('discoveries_status_idx').on(t.status),
    index('discoveries_county_idx').on(t.countyId),
    index('discoveries_name_idx').on(t.name),
    index('discoveries_category_idx').on(t.categorySlug),
  ],
);

/** One run of the IRS discovery import (cron or "Check now"). */
export const discoveryRuns = sqliteTable('discovery_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  status: text('status', { enum: RUN_STATUSES }).notNull().default('running'),
  triggeredBy: text('triggered_by').notNull(),
  sourceModified: text('source_modified'),
  rowsRead: integer('rows_read').notNull().default(0),
  rowsMatched: integer('rows_matched').notNull().default(0),
  newCount: integer('new_count').notNull().default(0),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
});

/** People who can sign in to /admin. Create them with `npm run admin:create`. */
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  ...timestamps,
});

/** Signed-in browser sessions. `id` is a SHA-256 of the cookie token, so a leaked DB can't be replayed. */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    adminId: integer('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('sessions_admin_idx').on(t.adminId)],
);

/** Messages from the public contact form. Only signed-in admins can read them. */
export const contactMessages = sqliteTable(
  'contact_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    message: text('message').notNull(),
    status: text('status', { enum: CONTACT_STATUSES }).notNull().default('new'),
    /** Why the spam filter sorted this into the spam tab, if it did. */
    spamReasons: text('spam_reasons', { mode: 'json' }).$type<string[]>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('contact_messages_status_idx').on(t.status), index('contact_messages_email_idx').on(t.email)],
);

/**
 * Counters behind the contact form's rate limits. They live in the database because each
 * Cloudflare Worker instance has its own memory. Keys are keyed hashes, so no visitor IP is stored.
 */
export const contactThrottle = sqliteTable(
  'contact_throttle',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull().default(1),
    /** Unix seconds. */
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('contact_throttle_expires_idx').on(t.expiresAt)],
);

export type Category = typeof categories.$inferSelect;
export type CountyRow = typeof counties.$inferSelect;
export type Discovery = typeof discoveries.$inferSelect;
export type Admin = typeof admins.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
