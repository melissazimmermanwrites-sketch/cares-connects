/** Shared shapes for the public "List your organization" form and the admin review queue. */

export const APPLICATION_METHODS = ['In person', 'Online', 'Paper application'] as const;
export const ELIGIBILITY_BASES = ['Degree of need', 'Income or finances', 'Several factors (such as family size)'] as const;
export const OUTREACH_CHANNELS = ['Word of mouth', 'Online', 'Flyers or paper', 'Through another agency'] as const;
export const FEE_OPTIONS = ['Free', 'Fee based', 'Some services have fees'] as const;
export const WAIT_TIMES = ['Same day', 'Within a week', 'Within a month', 'Within six months', 'Up to a year'] as const;
export const SERVICE_LENGTHS = ['Transitory only', 'Emergency only', 'Short term', 'Long term'] as const;

export interface SubmissionAnswers {
  applicationMethods: string[];
  eligibility: string[];
  outreach: string[];
  fees: string | null;
  waitTime: string | null;
  serviceLength: string[];
}

export interface SubmissionInput {
  name: string;
  website: string;
  phone: string;
  address: string | null;
  ein: string | null;
  contactName: string;
  contactEmail: string;
  mission: string | null;
  services: string;
  statewide: boolean;
  countyIds: number[];
  categoryIds: number[];
  answers: SubmissionAnswers;
  authorized: true;
  /** From GET /api/submissions/token. */
  token: string;
  /** Cloudflare Turnstile response, when Turnstile is switched on. */
  turnstile: string | null;
  /** Hidden from people. Anything in here means a bot filled in the form. */
  faxExtension: string;
}

export interface SubmissionFormConfig {
  token: string;
  turnstileSiteKey: string | null;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

/** An existing listing that may be the same organization. */
export interface CheckMatch {
  /** Set when the match is a listing; otherwise it's another submission. */
  resourceId: number | null;
  name: string;
  isActive: boolean;
  reasons: string[];
}

export interface CheckItem {
  key: 'email_domain' | 'mail_server' | 'website' | 'name_on_site' | 'freshness' | 'irs' | 'duplicate' | 'history';
  label: string;
  status: CheckStatus;
  detail: string;
  matches?: CheckMatch[];
}

export interface SubmissionChecks {
  ranAt: string;
  /** "pass" still needs a person: nothing is ever published automatically. */
  overall: 'pass' | 'review' | 'fail';
  items: CheckItem[];
}

/** The gate on the to-be-sorted queue: a confirmed email, and nothing like it in our database. */
export const nextStatusAfterConfirm = (matches: CheckMatch[]): 'pending' | 'duplicate' => (matches.length ? 'duplicate' : 'pending');

export type SubmissionStatus = 'awaiting_email' | 'duplicate' | 'pending' | 'approved' | 'rejected' | 'spam';

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: 'To be sorted',
  awaiting_email: 'Waiting on email',
  duplicate: 'Already in our database',
  approved: 'Added to directory',
  rejected: 'Not a fit',
  spam: 'Spam',
};

export type EmailStatus = 'not_sent' | 'sent' | 'failed' | 'not_configured' | 'verified' | 'declined';

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  not_sent: 'No verification email sent',
  sent: 'Waiting for them to answer the email',
  failed: 'The verification email failed to send',
  not_configured: 'Email sending isn’t set up yet',
  verified: 'Confirmed by the email owner',
  declined: 'Email owner says this wasn’t them',
};

/** How many verification emails one submission can ever send. */
export const MAX_VERIFICATION_EMAILS = 3;

/** What the verification page shows. */
export interface VerificationState {
  state: 'ready' | 'verified' | 'declined' | 'expired' | 'invalid';
  orgName: string | null;
}

export interface SubmissionRow {
  id: number;
  status: SubmissionStatus;
  name: string;
  website: string;
  phone: string;
  address: string | null;
  ein: string | null;
  contactName: string;
  contactEmail: string;
  mission: string | null;
  services: string;
  statewide: boolean;
  counties: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  countyIds: number[];
  categoryIds: number[];
  answers: SubmissionAnswers;
  spamFlags: string[];
  checks: SubmissionChecks | null;
  dbMatches: CheckMatch[] | null;
  emailStatus: EmailStatus;
  emailSentAt: string | null;
  emailSendCount: number;
  emailAnsweredAt: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  resourceId: number | null;
}

export interface SubmissionSummary {
  pending: number;
  awaitingEmail: number;
  duplicate: number;
  spam: number;
}
