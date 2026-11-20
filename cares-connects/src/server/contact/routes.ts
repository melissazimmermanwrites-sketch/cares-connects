import { Router } from 'express';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { contactMessages } from '../db/schema';
import { handle, HttpError, parse } from '../http';
import type { Page } from '../../shared/api-types';
import type { ContactMessageRow, ContactSummary } from '../../shared/contact';
import {
  checkToken,
  claimNonce,
  emailOverLimit,
  formSecret,
  issueToken,
  LIMITS,
  purgeExpiredThrottles,
  siteOverLimit,
  spamReasons,
  visitorOverLimit,
} from './guard';

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(200),
  email: z.email('Enter a valid email').max(200).toLowerCase(),
  message: z.string().trim().min(10, 'Tell us a little more').max(4000),
  token: z.string().max(200),
  faxExtension: z.string().max(200),
});

const UNAVAILABLE = 'This form isn’t available right now. Please try again later.';
const TOO_MANY = 'We’ve received a lot from you today. Please try again tomorrow. If you need help now, call or text 988 or dial 211.';
const BUSY = 'We can’t take new messages right now. Please try again in a few days. If you need help now, call or text 988 or dial 211.';

/** Public endpoints. Mounted at /api/contact. */
export const contactRouter = Router();

/** Starts a form: stateless, so loading the page never writes to the database. */
contactRouter.get('/token', (_req, res) => {
  const secret = formSecret();
  if (!secret) throw new HttpError(503, UNAVAILABLE);
  res.set('Cache-Control', 'no-store');
  res.json({ token: issueToken(secret) });
});

contactRouter.post(
  '/',
  handle(async (req, res) => {
    const secret = formSecret();
    if (!secret) throw new HttpError(503, UNAVAILABLE);
    const input = parse(contactSchema, req.body);

    // A bot filled in the hidden field. It sees success, so it learns nothing to adapt to.
    if (input.faxExtension) {
      res.status(202).json({ ok: true });
      return;
    }

    const token = checkToken(secret, input.token);
    if (!token.ok) {
      if (token.reason === 'too_fast') throw new HttpError(429, 'That was very fast. Please wait a few seconds and send it again.');
      res.status(409).json({ error: 'This form has expired. We’ve refreshed it, so please send it again.', code: 'token' });
      return;
    }

    if (await visitorOverLimit(secret, req.ip)) throw new HttpError(429, TOO_MANY);
    if (!(await claimNonce(secret, token.nonce))) {
      res.status(409).json({ error: 'This message was already sent. Please refresh the page to send another.', code: 'token' });
      return;
    }
    if (await emailOverLimit(secret, input.email)) throw new HttpError(429, TOO_MANY);

    // Sending the same message again: thank them, but don't file it twice.
    const [already] = await db
      .select({ id: contactMessages.id })
      .from(contactMessages)
      .where(and(eq(contactMessages.email, input.email), eq(contactMessages.message, input.message)))
      .limit(1);
    if (already) {
      res.status(202).json({ ok: true });
      return;
    }

    if (await siteOverLimit(secret)) throw new HttpError(503, BUSY);
    const [{ unread }] = await db.select({ unread: count() }).from(contactMessages).where(eq(contactMessages.status, 'new'));
    if (unread >= LIMITS.maxUnread) throw new HttpError(503, BUSY);

    const reasons = spamReasons(input);
    await db.insert(contactMessages).values({
      name: input.name,
      email: input.email,
      message: input.message,
      status: reasons.length ? 'spam' : 'new',
      spamReasons: reasons,
    });

    await purgeExpiredThrottles();
    // Spam lasts 30 days in case of a false alarm, so a flood can't fill the database.
    await db
      .delete(contactMessages)
      .where(and(eq(contactMessages.status, 'spam'), lt(contactMessages.createdAt, new Date(Date.now() - 30 * 86_400_000))));

    res.status(202).json({ ok: true });
  }),
);

const toRow = (m: typeof contactMessages.$inferSelect): ContactMessageRow => ({
  id: m.id,
  name: m.name,
  email: m.email,
  message: m.message,
  status: m.status,
  spamReasons: m.spamReasons,
  createdAt: m.createdAt.toISOString(),
});

/** Inbox. Mounted at /api/admin/messages (login required). */
export const adminContactRouter = Router();

adminContactRouter.get(
  '/summary',
  handle(async (_req, res) => {
    const rows = await db.select({ status: contactMessages.status, total: count() }).from(contactMessages).groupBy(contactMessages.status);
    const of = (status: string) => rows.find((r) => r.status === status)?.total ?? 0;
    const body: ContactSummary = { new: of('new'), spam: of('spam') };
    res.json(body);
  }),
);

adminContactRouter.get(
  '/',
  handle(async (req, res) => {
    const status = parse(z.enum(['new', 'read', 'spam']), req.query['status'] ?? 'new');
    const pageSize = 20;
    const page = Math.max(Number(req.query['page']) || 0, 0);
    const where = eq(contactMessages.status, status);
    const [{ total }] = await db.select({ total: count() }).from(contactMessages).where(where);
    const rows = await db
      .select()
      .from(contactMessages)
      .where(where)
      .orderBy(desc(contactMessages.createdAt), desc(contactMessages.id))
      .limit(pageSize)
      .offset(page * pageSize);
    const body: Page<ContactMessageRow> = { total, items: rows.map(toRow) };
    res.json(body);
  }),
);

adminContactRouter.post(
  '/:id/status',
  handle(async (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Bad id');
    const { status } = parse(z.object({ status: z.enum(['new', 'read', 'spam']) }), req.body);
    const [row] = await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id)).returning();
    if (!row) throw new HttpError(404, 'Not found');
    res.json(toRow(row));
  }),
);
