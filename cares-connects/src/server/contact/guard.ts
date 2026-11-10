/**
 * Flood protection for the contact form: a hidden field, a signed one-time form token with a
 * minimum fill time, rate limits per visitor / email / site-wide, a cap on unread messages, and a
 * filter that sorts likely spam into its own inbox tab. Counters live in the database because each
 * Cloudflare Worker instance has its own memory, and are keyed hashes, so no visitor IP is stored.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { contactThrottle } from '../db/schema';

const MIN_FILL_MS = 3_000;
const MAX_TOKEN_AGE_MS = 2 * 60 * 60_000;
const HOUR = 3600;
const DAY = 24 * HOUR;

export const LIMITS = {
  ipPerHour: 3,
  ipPerDay: 6,
  emailPerDay: 3,
  sitePerDay: 100,
  /** Stop taking messages while this many are unread, so a flood can't bury real ones. */
  maxUnread: 500,
} as const;

/** Signs form tokens and hashes throttle keys. Production must set SUBMISSION_SECRET. */
export function formSecret(): string | null {
  const secret = process.env['SUBMISSION_SECRET'];
  if (secret) return secret;
  return process.env['NODE_ENV'] === 'production' ? null : 'local-development-only';
}

const sign = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('base64url');

export function issueToken(secret: string, now = Date.now()): string {
  const body = `${now}.${randomBytes(12).toString('base64url')}`;
  return `${body}.${sign(secret, body)}`;
}

export type TokenResult = { ok: true; nonce: string } | { ok: false; reason: 'invalid' | 'expired' | 'too_fast' };

export function checkToken(secret: string, token: string, now = Date.now()): TokenResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid' };
  const [issued, nonce, signature] = parts;
  const expected = Buffer.from(sign(secret, `${issued}.${nonce}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: 'invalid' };
  const age = now - Number(issued);
  if (!Number.isFinite(age) || age < 0) return { ok: false, reason: 'invalid' };
  if (age < MIN_FILL_MS) return { ok: false, reason: 'too_fast' };
  if (age > MAX_TOKEN_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true, nonce };
}

/** Rate-limit bucket for an address. IPv6 visitors usually control a whole /64, so count that. */
export function ipBucket(ip: string | undefined): string {
  const value = (ip ?? 'unknown').replace(/^::ffff:/, '');
  return value.includes(':') ? value.split(':').slice(0, 4).join(':') : value;
}

/** Adds one to a counter and returns the new total. Atomic, and restarts once its window ends. */
async function bump(secret: string, name: string, windowSeconds: number): Promise<number> {
  const key = sign(secret, `contact:${name}`);
  const now = Math.floor(Date.now() / 1000);
  const expires = now + windowSeconds;
  const [row] = await db
    .insert(contactThrottle)
    .values({ key, count: 1, expiresAt: expires })
    .onConflictDoUpdate({
      target: contactThrottle.key,
      set: {
        count: sql`case when ${contactThrottle.expiresAt} <= ${now} then 1 else ${contactThrottle.count} + 1 end`,
        expiresAt: sql`case when ${contactThrottle.expiresAt} <= ${now} then ${expires} else ${contactThrottle.expiresAt} end`,
      },
    })
    .returning({ count: contactThrottle.count });
  return row.count;
}

export async function visitorOverLimit(secret: string, ip: string | undefined): Promise<boolean> {
  const bucket = ipBucket(ip);
  const [hour, day] = await Promise.all([bump(secret, `ip-hour:${bucket}`, HOUR), bump(secret, `ip-day:${bucket}`, DAY)]);
  return hour > LIMITS.ipPerHour || day > LIMITS.ipPerDay;
}

/** False if this form token has already been used. */
export async function claimNonce(secret: string, nonce: string): Promise<boolean> {
  return (await bump(secret, `nonce:${nonce}`, 3 * HOUR)) === 1;
}

export async function emailOverLimit(secret: string, email: string): Promise<boolean> {
  return (await bump(secret, `email:${email}`, DAY)) > LIMITS.emailPerDay;
}

export async function siteOverLimit(secret: string): Promise<boolean> {
  return (await bump(secret, 'site-day', DAY)) > LIMITS.sitePerDay;
}

/** Clears finished counters so the table can't grow without limit. */
export async function purgeExpiredThrottles(): Promise<void> {
  await db.delete(contactThrottle).where(sql`${contactThrottle.expiresAt} <= ${Math.floor(Date.now() / 1000)}`);
}

const SPAM_PHRASES = ['viagra', 'cialis', 'backlink', 'seo services', 'seo agency', 'guest post', 'online casino', 'sports betting', 'crypto trading', 'bitcoin investment', 'forex', 'essay writing', 'buy followers', 'porn'];

/**
 * Reasons a message looks like spam. It goes to the Spam tab rather than being thrown away, so a
 * false alarm can be moved back. People may write here about hard things, so the phrases are narrow.
 */
export function spamReasons(input: { name: string; message: string }): string[] {
  const text = `${input.name}\n${input.message}`;
  const lower = text.toLowerCase();
  const reasons = SPAM_PHRASES.filter((phrase) => new RegExp(`\\b${phrase}`).test(lower)).map((phrase) => `Contains “${phrase}”`);
  const links = text.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links >= 3) reasons.push(`${links} links`);
  if (/<\/?[a-z][^>]*>|\[url[=\]]/i.test(text)) reasons.push('Contains HTML or link markup');
  if (/https?:\/\/|www\./i.test(input.name)) reasons.push('Link in the name');
  return reasons;
}
