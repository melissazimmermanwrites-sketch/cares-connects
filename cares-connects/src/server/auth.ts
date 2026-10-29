import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from './db/client';
import { admins, sessions } from './db/schema';
import type { SessionUser } from '../shared/api-types';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'cc_session';
const SESSION_DAYS = 30;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(adminId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: hashToken(token), adminId, expiresAt });
  // Opportunistic cleanup so the table doesn't grow forever.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteSessionsForAdmin(adminId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.adminId, adminId));
}

export async function userForToken(token: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: admins.id, email: admins.email, name: admins.name })
    .from(sessions)
    .innerJoin(admins, eq(admins.id, sessions.adminId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setSessionCookie(req: Request, res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || process.env['NODE_ENV'] === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: SessionUser;
    }
  }
}

/** Rejects the request with 401 unless it carries a valid session cookie. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  const user = token ? await userForToken(token) : null;
  if (!user) {
    res.status(401).json({ error: 'Please sign in.' });
    return;
  }
  res.locals.user = user;
  next();
}

/**
 * Blocks cross-site form posts against cookie-authenticated routes. Browsers always send
 * Origin on cross-origin POST/PUT/DELETE, so a mismatch with Host means another site sent it.
 */
export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) {
    res.status(403).json({ error: 'Cross-site request blocked.' });
    return;
  }
  next();
}

/** Tiny in-memory limiter for the login form: 10 tries per 15 minutes per IP + email. */
const attempts = new Map<string, { count: number; resetAt: number }>();
export function loginRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}
export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}
