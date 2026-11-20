import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { and, count, desc, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { categories, counties, listingSubmissions } from '../db/schema';
import { handle, HttpError, parse } from '../http';
import type { Page } from '../../shared/api-types';
import {
  APPLICATION_METHODS,
  ELIGIBILITY_BASES,
  FEE_OPTIONS,
  OUTREACH_CHANNELS,
  SERVICE_LENGTHS,
  WAIT_TIMES,
  MAX_VERIFICATION_EMAILS,
  nextStatusAfterConfirm,
  type EmailStatus,
  type SubmissionFormConfig,
  type SubmissionRow,
  type SubmissionSummary,
  type VerificationState,
} from '../../shared/submissions';
import { hostOf, isBlockedUrl, overallResult, runChecks } from './checks';
import { databaseMatches } from './crosscheck';
import { sendVerificationEmail, VERIFY_LINK_DAYS } from './mail';
import {
  checkToken,
  claimNonce,
  identityOverLimit,
  ipOverLimit,
  issueToken,
  LIMITS,
  purgeExpiredThrottles,
  siteOverLimit,
  spamReasons,
  submissionSecret,
  turnstileConfig,
  turnstilePassed,
} from './guard';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const websiteField = z
  .string()
  .trim()
  .min(4, 'Enter your website')
  .max(500)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      return !isBlockedUrl(new URL(v));
    } catch {
      return false;
    }
  }, 'Enter a public website address');

const submissionSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the organization’s name').max(200),
    website: websiteField,
    phone: z.string().trim().min(7, 'Enter a phone number').max(40),
    address: optionalText(300),
    ein: optionalText(12)
      .transform((v) => v?.replace(/\D/g, '') || null)
      .refine((v) => !v || v.length === 9, 'An EIN has 9 digits'),
    contactName: z.string().trim().min(2, 'Enter a contact name').max(200),
    contactEmail: z.email('Enter a valid email').max(200).toLowerCase(),
    mission: optionalText(2000),
    services: z.string().trim().min(10, 'Tell us what services you provide').max(4000),
    statewide: z.boolean(),
    countyIds: z.array(z.number().int().positive()).max(58),
    categoryIds: z.array(z.number().int().positive()).min(1, 'Pick at least one category').max(40),
    answers: z.object({
      applicationMethods: z.array(z.enum(APPLICATION_METHODS)).max(3),
      eligibility: z.array(z.enum(ELIGIBILITY_BASES)).max(3),
      outreach: z.array(z.enum(OUTREACH_CHANNELS)).max(4),
      fees: z.enum(FEE_OPTIONS).nullable(),
      waitTime: z.enum(WAIT_TIMES).nullable(),
      serviceLength: z.array(z.enum(SERVICE_LENGTHS)).max(4),
    }),
    authorized: z.literal(true, 'Please confirm you’re allowed to list this organization'),
    token: z.string().max(200),
    turnstile: z.string().max(4000).nullable(),
    faxExtension: z.string().max(200),
  })
  .refine((v) => v.statewide || v.countyIds.length > 0, {
    path: ['countyIds'],
    message: 'Pick at least one county, or choose statewide',
  });

const THANKS = { message: 'Thanks. We review every submission before it goes live.' };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const publicOrigin = () => (process.env['SITE_URL'] ?? 'https://caresconnects.org').replace(/\/$/, '');

/**
 * Emails a fresh verification link, replacing any earlier one. Skips addresses whose owner has
 * already told us they didn't ask for this, so the form can't be used to keep mailing someone.
 */
async function sendVerification(submission: { id: number; name: string; contactEmail: string }): Promise<EmailStatus> {
  const [declined] = await db
    .select({ id: listingSubmissions.id })
    .from(listingSubmissions)
    .where(and(eq(listingSubmissions.contactEmail, submission.contactEmail), eq(listingSubmissions.emailStatus, 'declined')))
    .limit(1);
  if (declined) return 'not_sent';

  const token = randomBytes(32).toString('base64url');
  const link = `${publicOrigin()}/list-your-organization/verify?token=${token}`;
  const result = await sendVerificationEmail({ to: submission.contactEmail, orgName: submission.name, link });
  const sent = result === 'sent';
  await db
    .update(listingSubmissions)
    .set({
      emailStatus: result,
      ...(sent
        ? {
            emailTokenHash: hashToken(token),
            emailTokenExpiresAt: new Date(Date.now() + VERIFY_LINK_DAYS * 86_400_000),
            emailSentAt: new Date(),
            emailSendCount: sql`${listingSubmissions.emailSendCount} + 1`,
          }
        : {}),
    })
    .where(eq(listingSubmissions.id, submission.id));
  return result;
}

const verifyToken = z.string().min(20).max(100);

async function findByToken(token: string) {
  const [row] = await db.select().from(listingSubmissions).where(eq(listingSubmissions.emailTokenHash, hashToken(token))).limit(1);
  return row;
}

function verificationState(row: typeof listingSubmissions.$inferSelect | undefined): VerificationState {
  if (!row) return { state: 'invalid', orgName: null };
  if (row.emailStatus === 'verified' || row.emailStatus === 'declined') return { state: row.emailStatus, orgName: row.name };
  if (!row.emailTokenExpiresAt || row.emailTokenExpiresAt <= new Date()) return { state: 'expired', orgName: row.name };
  return { state: 'ready', orgName: row.name };
}

/** Public endpoints. Mounted at /api/submissions. */
export const submissionRouter = Router();

/** Starts a form: stateless, so loading the page never writes to the database. */
submissionRouter.get('/token', (_req, res) => {
  const secret = submissionSecret();
  if (!secret) throw new HttpError(503, 'This form isn’t available right now. Please try again later.');
  const body: SubmissionFormConfig = { token: issueToken(secret), turnstileSiteKey: turnstileConfig()?.siteKey ?? null };
  res.set('Cache-Control', 'no-store');
  res.json(body);
});

submissionRouter.post(
  '/',
  handle(async (req, res) => {
    const secret = submissionSecret();
    if (!secret) throw new HttpError(503, 'This form isn’t available right now. Please try again later.');
    const input = parse(submissionSchema, req.body);

    // A bot filled in the hidden field. It sees success, so it learns nothing to adapt to.
    if (input.faxExtension) {
      res.status(202).json(THANKS);
      return;
    }

    const token = checkToken(secret, input.token);
    if (!token.ok) {
      if (token.reason === 'too_fast') throw new HttpError(429, 'That was very fast. Please wait a few seconds and send it again.');
      res.status(409).json({ error: 'This form has expired. We’ve refreshed it, so please send it again.', code: 'token' });
      return;
    }

    const turnstile = turnstileConfig();
    if (turnstile && !(await turnstilePassed(turnstile.secret, input.turnstile, req.ip))) {
      res.status(409).json({ error: 'We couldn’t confirm you’re a person. Please try the check again.', code: 'token' });
      return;
    }

    const tooMany = 'We’ve received a lot from you today. Please try again tomorrow, or contact us directly.';
    if (await ipOverLimit(secret, req.ip)) throw new HttpError(429, tooMany);
    if (!(await claimNonce(secret, token.nonce))) {
      res.status(409).json({ error: 'This form was already sent. Please refresh the page to send another.', code: 'token' });
      return;
    }
    if (await identityOverLimit(secret, input.contactEmail, hostOf(input.website) ?? input.website)) {
      throw new HttpError(429, tooMany);
    }

    // Sending the same organization again: thank them, but don't queue it twice.
    const [already] = await db
      .select({ id: listingSubmissions.id })
      .from(listingSubmissions)
      .where(
        and(
          inArray(listingSubmissions.status, ['awaiting_email', 'duplicate', 'pending']),
          eq(listingSubmissions.contactEmail, input.contactEmail),
          sql`lower(${listingSubmissions.name}) = ${input.name.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (already) {
      res.status(202).json(THANKS);
      return;
    }

    const busy = 'We’re not taking new submissions right now. Please try again in a few days.';
    if (await siteOverLimit(secret)) throw new HttpError(503, busy);
    const [{ pending }] = await db
      .select({ pending: count() })
      .from(listingSubmissions)
      .where(inArray(listingSubmissions.status, ['awaiting_email', 'duplicate', 'pending']));
    if (pending >= LIMITS.maxPending) throw new HttpError(503, busy);

    const [knownCategories, knownCounties] = await Promise.all([
      db.select({ id: categories.id }).from(categories).where(inArray(categories.id, input.categoryIds)),
      input.countyIds.length
        ? db.select({ id: counties.id }).from(counties).where(inArray(counties.id, input.countyIds))
        : Promise.resolve([]),
    ]);
    if (!knownCategories.length) throw new HttpError(400, 'Pick at least one category');

    const reasons = spamReasons(input);
    const [created] = await db.insert(listingSubmissions).values({
      status: reasons.length ? 'spam' : 'awaiting_email',
      name: input.name,
      website: input.website,
      phone: input.phone,
      address: input.address,
      ein: input.ein,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      mission: input.mission,
      services: input.services,
      statewide: input.statewide,
      countyIds: input.statewide ? [] : knownCounties.map((c) => c.id),
      categoryIds: knownCategories.map((c) => c.id),
      answers: input.answers,
      spamFlags: reasons,
    }).returning({ id: listingSubmissions.id });
    // Likely spam never gets an email, so the form can't be used to reach strangers with it.
    if (!reasons.length) {
      await sendVerification({ id: created.id, name: input.name, contactEmail: input.contactEmail });
    }
    await purgeExpiredThrottles();
    // Spam and requests nobody ever confirmed last 30 days, so a flood can't fill the database.
    await db
      .delete(listingSubmissions)
      .where(
        and(
          inArray(listingSubmissions.status, ['spam', 'awaiting_email']),
          lt(listingSubmissions.createdAt, new Date(Date.now() - 30 * 86_400_000)),
        ),
      );

    res.status(202).json(THANKS);
  }),
);

/**
 * Reading the state never changes it. Mail scanners open every link in a message, so only the
 * button on the page (the POST below) counts as an answer.
 */
submissionRouter.get(
  '/verify',
  handle(async (req, res) => {
    const parsed = verifyToken.safeParse(req.query['token']);
    const body = verificationState(parsed.success ? await findByToken(parsed.data) : undefined);
    res.set('Cache-Control', 'no-store');
    res.json(body);
  }),
);

submissionRouter.post(
  '/verify',
  handle(async (req, res) => {
    const { token, answer } = parse(z.object({ token: verifyToken, answer: z.enum(['verified', 'declined']) }), req.body);
    const row = await findByToken(token);
    const current = verificationState(row);
    res.set('Cache-Control', 'no-store');
    if (current.state !== 'ready') {
      res.json(current);
      return;
    }
    // Confirming only moves a request along if it's still waiting; an admin may have already acted.
    const waiting = row!.status === 'awaiting_email';
    const matches = answer === 'verified' && waiting ? await databaseMatches(row!.id, row!) : null;
    await db
      .update(listingSubmissions)
      .set({
        emailStatus: answer,
        emailAnsweredAt: new Date(),
        updatedAt: new Date(),
        ...(answer === 'declined' && row!.status !== 'approved' ? { status: 'rejected' as const, reviewedAt: new Date(), reviewedBy: 'Email owner' } : {}),
        ...(matches ? { status: nextStatusAfterConfirm(matches), dbMatches: matches } : {}),
      })
      .where(eq(listingSubmissions.id, row!.id));
    const body: VerificationState = { state: answer, orgName: row!.name };
    res.json(body);
  }),
);

// ---------- admin ----------

async function toRows(rows: (typeof listingSubmissions.$inferSelect)[]): Promise<SubmissionRow[]> {
  const [cats, areas] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select({ id: counties.id, name: counties.name }).from(counties),
  ]);
  const pick = <T extends { id: number }>(all: T[], ids: number[]) => all.filter((x) => ids.includes(x.id));
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return rows.map(({ emailTokenHash: _hash, emailTokenExpiresAt: _expires, updatedAt: _updated, ...r }) => ({
    ...r,
    categories: pick(cats, r.categoryIds),
    counties: pick(areas, r.countyIds),
    // The email can be answered after the checks ran, so the summary is worked out when read.
    checks: r.checks ? { ...r.checks, overall: overallResult(r.checks.items, r.emailStatus) } : null,
    emailSentAt: iso(r.emailSentAt),
    emailAnsweredAt: iso(r.emailAnsweredAt),
    createdAt: r.createdAt.toISOString(),
    reviewedAt: iso(r.reviewedAt),
  }));
}

async function loadRow(id: number): Promise<SubmissionRow> {
  const [row] = await db.select().from(listingSubmissions).where(eq(listingSubmissions.id, id));
  if (!row) throw new HttpError(404, 'Not found');
  return (await toRows([row]))[0];
}

const idParam = (raw: unknown) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Bad id');
  return id;
};

/** Review queue. Mounted at /api/admin/submissions (login required). */
export const adminSubmissionRouter = Router();

adminSubmissionRouter.get(
  '/summary',
  handle(async (_req, res) => {
    const rows = await db
      .select({ status: listingSubmissions.status, total: count() })
      .from(listingSubmissions)
      .groupBy(listingSubmissions.status);
    const of = (status: string) => rows.find((r) => r.status === status)?.total ?? 0;
    const body: SubmissionSummary = { pending: of('pending'), awaitingEmail: of('awaiting_email'), duplicate: of('duplicate'), spam: of('spam') };
    res.json(body);
  }),
);

adminSubmissionRouter.get(
  '/',
  handle(async (req, res) => {
    const status = String(req.query['status'] ?? 'pending');
    const where: SQL | undefined =
      status === 'all' ? undefined : eq(listingSubmissions.status, status as typeof listingSubmissions.$inferSelect.status);
    const pageSize = 20;
    const page = Math.max(Number(req.query['page']) || 0, 0);
    const [{ total }] = await db.select({ total: count() }).from(listingSubmissions).where(where);
    const rows = await db
      .select()
      .from(listingSubmissions)
      .where(where)
      .orderBy(desc(listingSubmissions.createdAt), desc(listingSubmissions.id))
      .limit(pageSize)
      .offset(page * pageSize);
    const body: Page<SubmissionRow> = { total, items: await toRows(rows) };
    res.json(body);
  }),
);

adminSubmissionRouter.get(
  '/:id',
  handle(async (req, res) => {
    res.json(await loadRow(idParam(req.params['id'])));
  }),
);

/** Runs the website, email and IRS checks, one submission per request so each stays within host time limits. */
adminSubmissionRouter.post(
  '/:id/check',
  handle(async (req, res) => {
    const id = idParam(req.params['id']);
    const row = await loadRow(id);
    const checks = await runChecks(id, row, row.emailStatus);
    await db.update(listingSubmissions).set({ checks, updatedAt: new Date() }).where(eq(listingSubmissions.id, id));
    res.json(await loadRow(id));
  }),
);

/** Sends the link again. Capped, because every send lands in someone's inbox. */
adminSubmissionRouter.post(
  '/:id/resend-verification',
  handle(async (req, res) => {
    const id = idParam(req.params['id']);
    const row = await loadRow(id);
    if (row.emailStatus === 'verified' || row.emailStatus === 'declined') throw new HttpError(409, 'They have already answered.');
    if (row.emailSendCount >= MAX_VERIFICATION_EMAILS) {
      throw new HttpError(429, `We’ve already emailed this address ${MAX_VERIFICATION_EMAILS} times. Call them instead.`);
    }
    const result = await sendVerification({ id, name: row.name, contactEmail: row.contactEmail });
    if (result === 'not_sent') throw new HttpError(409, 'This address has asked us not to contact it about this.');
    if (result === 'not_configured') throw new HttpError(503, 'Email sending isn’t set up yet.');
    if (result === 'failed') throw new HttpError(502, 'The email failed to send. Try again later.');
    res.json(await loadRow(id));
  }),
);

adminSubmissionRouter.post(
  '/:id/status',
  handle(async (req, res) => {
    const id = idParam(req.params['id']);
    const { status, resourceId } = parse(
      z.object({
        status: z.enum(['awaiting_email', 'duplicate', 'pending', 'approved', 'rejected', 'spam']),
        resourceId: z.number().int().positive().nullish(),
      }),
      req.body,
    );
    const reopened = status === 'pending' || status === 'awaiting_email' || status === 'duplicate';
    const updated = await db
      .update(listingSubmissions)
      .set({
        status,
        resourceId: status === 'approved' ? (resourceId ?? null) : null,
        reviewedAt: reopened ? null : new Date(),
        reviewedBy: reopened ? null : res.locals.user!.email,
        updatedAt: new Date(),
      })
      .where(eq(listingSubmissions.id, id))
      .returning({ id: listingSubmissions.id });
    if (!updated.length) throw new HttpError(404, 'Not found');
    res.json(await loadRow(id));
  }),
);
