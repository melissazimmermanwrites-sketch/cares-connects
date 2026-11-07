/**
 * Flood and spam protection for the public "List your organization" form.
 *
 * Layers, cheapest first: hidden field, signed one-time form token with a minimum fill time,
 * optional Cloudflare Turnstile, rate limits per visitor / email / website / site-wide, a cap on
 * the size of the queue, then a content filter that sorts likely spam into its own admin tab.
 *
 * Nothing here makes an outbound request to an address a visitor typed. Website checks only run
 * from a signed-in admin's queue (see checks.ts), so a flood can't make this server crawl anything.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { submissionThrottle } from '../db/schema';

const MIN_FILL_MS = 3_000;
const MAX_TOKEN_AGE_MS = 2 * 60 * 60_000;

const HOUR = 3600;
const DAY = 24 * HOUR;

export const LIMITS = {
  ipPerHour: 3,
  ipPerDay: 6,
  emailPerDay: 2,
  domainPerDay: 3,
  sitePerDay: 60,
  /** Stop taking new submissions while this many are waiting, so a flood can't bury the queue. */
  maxPending: 300,
} as const;

/** Signs form tokens and hashes throttle keys. Production must set SUBMISSION_SECRET. */
export function submissionSecret(): string | null {
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
  const key = sign(secret, name);
  const now = Math.floor(Date.now() / 1000);
  const expires = now + windowSeconds;
  const [row] = await db
    .insert(submissionThrottle)
    .values({ key, count: 1, expiresAt: expires })
    .onConflictDoUpdate({
      target: submissionThrottle.key,
      set: {
        count: sql`case when ${submissionThrottle.expiresAt} <= ${now} then 1 else ${submissionThrottle.count} + 1 end`,
        expiresAt: sql`case when ${submissionThrottle.expiresAt} <= ${now} then ${expires} else ${submissionThrottle.expiresAt} end`,
      },
    })
    .returning({ count: submissionThrottle.count });
  return row.count;
}

export async function ipOverLimit(secret: string, ip: string | undefined): Promise<boolean> {
  const bucket = ipBucket(ip);
  const [hour, day] = await Promise.all([
    bump(secret, `ip-hour:${bucket}`, HOUR),
    bump(secret, `ip-day:${bucket}`, DAY),
  ]);
  return hour > LIMITS.ipPerHour || day > LIMITS.ipPerDay;
}

/** False if this form token has already been used. */
export async function claimNonce(secret: string, nonce: string): Promise<boolean> {
  return (await bump(secret, `nonce:${nonce}`, 3 * HOUR)) === 1;
}

export async function identityOverLimit(secret: string, email: string, domain: string): Promise<boolean> {
  const [byEmail, byDomain] = await Promise.all([
    bump(secret, `email:${email}`, DAY),
    bump(secret, `domain:${domain}`, DAY),
  ]);
  return byEmail > LIMITS.emailPerDay || byDomain > LIMITS.domainPerDay;
}

export async function siteOverLimit(secret: string): Promise<boolean> {
  return (await bump(secret, 'site-day', DAY)) > LIMITS.sitePerDay;
}

/** Clears finished counters so the table can't grow without limit. */
export async function purgeExpiredThrottles(): Promise<void> {
  await db.delete(submissionThrottle).where(sql`${submissionThrottle.expiresAt} <= ${Math.floor(Date.now() / 1000)}`);
}

export function turnstileConfig(): { siteKey: string; secret: string } | null {
  const siteKey = process.env['TURNSTILE_SITE_KEY'];
  const secret = process.env['TURNSTILE_SECRET_KEY'];
  return siteKey && secret ? { siteKey, secret } : null;
}

/** Asks Cloudflare whether the visitor passed. If Cloudflare can't answer, the submission is refused. */
export async function turnstilePassed(secret: string, response: string | null, ip: string | undefined): Promise<boolean> {
  if (!response) return false;
  try {
    const body = new URLSearchParams({ secret, response });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

const SPAM_PHRASES = [
  'viagra',
  'cialis',
  'backlink',
  'seo services',
  'seo agency',
  'guest post',
  'online casino',
  'sports betting',
  'crypto trading',
  'bitcoin investment',
  'forex',
  'essay writing',
  'buy followers',
  'porn',
];

/**
 * Reasons a submission looks like spam. Any reason sends it to the Spam tab rather than deleting
 * it, so a false alarm can be moved back. Phrases are specific on purpose: words like "casino" or
 * "gambling" can be legitimate here (tribal programs, recovery services).
 */
export function spamReasons(input: { name: string; mission: string | null; services: string; contactEmail: string }): string[] {
  const reasons: string[] = [];
  const text = `${input.name}\n${input.mission ?? ''}\n${input.services}`;
  const lower = text.toLowerCase();
  for (const phrase of SPAM_PHRASES) {
    if (new RegExp(`\\b${phrase}`).test(lower)) reasons.push(`Contains “${phrase}”`);
  }
  const links = text.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links >= 3) reasons.push(`${links} links in the description`);
  if (/<\/?[a-z][^>]*>|\[url[=\]]/i.test(text)) reasons.push('Contains HTML or link markup');
  // The name is quoted in the verification email, so it must not be able to carry a link.
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|info|biz|xyz|top|ru|cn|io|co|shop|site|online|click|link)\b/i.test(input.name)) {
    reasons.push('Link in the organization name');
  }
  if (isDisposableEmail(input.contactEmail)) reasons.push('Throwaway email address');
  return reasons;
}

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
]);

export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE_DOMAINS.has(email.split('@').pop()?.toLowerCase() ?? '');
}
