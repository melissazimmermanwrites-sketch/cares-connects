/**
 * Sends the "confirm this request" email. Uses Resend's HTTP API because a Cloudflare Worker can't
 * speak SMTP directly. Without RESEND_API_KEY: local development prints the email to the terminal,
 * and production reports "not configured" so the admin queue can say so.
 */
export type MailResult = 'sent' | 'failed' | 'not_configured';

export interface VerificationEmail {
  to: string;
  orgName: string;
  link: string;
}

export const VERIFY_LINK_DAYS = 7;
const MAX_NAME_IN_EMAIL = 100;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The organization's name is the only text from the form that reaches the email. It's kept short
 * and on one line, and the subject is fixed, so the form can't be used to mail strangers a message.
 */
export function buildVerificationEmail({ orgName, link }: Pick<VerificationEmail, 'orgName' | 'link'>): { subject: string; text: string; html: string } {
  const flat = orgName.replace(/\s+/g, ' ').trim();
  const name = flat.length > MAX_NAME_IN_EMAIL ? `${flat.slice(0, MAX_NAME_IN_EMAIL).trimEnd()}…` : flat;
  const expiry = `The link works for ${VERIFY_LINK_DAYS} days.`;
  return {
    subject: 'Confirm your CARES Connects listing request',
    text: [
      `Someone used this email address to ask CARES Connects to list an organization called "${name}" in our free community resource directory.`,
      '',
      `If that was you, confirm it here. If it wasn't, the same page lets you tell us. ${expiry}`,
      '',
      link,
      '',
      'CARES Connects',
    ].join('\n'),
    html: [
      `<p>Someone used this email address to ask CARES Connects to list an organization called <strong>${escapeHtml(name)}</strong> in our free community resource directory.</p>`,
      `<p>If that was you, confirm it below. If it wasn't, the same page lets you tell us. ${expiry}</p>`,
      `<p><a href="${escapeHtml(link)}">Open the confirmation page</a></p>`,
      '<p>CARES Connects</p>',
    ].join(''),
  };
}

export async function sendVerificationEmail(email: VerificationEmail): Promise<MailResult> {
  const message = buildVerificationEmail(email);
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    if (process.env['NODE_ENV'] === 'production') return 'not_configured';
    console.log(`[mail] To: ${email.to}\n[mail] Subject: ${message.subject}\n[mail] ${email.link}`);
    return 'sent';
  }
  try {
    const res = await fetch(process.env['RESEND_API_URL'] ?? 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env['MAIL_FROM'] ?? 'CARES Connects <verify@caresconnects.org>',
        to: [email.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) console.error(`[mail] provider answered HTTP ${res.status}`);
    return res.ok ? 'sent' : 'failed';
  } catch (err) {
    console.error('[mail] send failed', err);
    return 'failed';
  }
}
