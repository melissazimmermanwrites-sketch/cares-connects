/** Shared shapes for the public contact form and the admin inbox. */

export interface ContactInput {
  name: string;
  email: string;
  message: string;
  /** From GET /api/contact/token. */
  token: string;
  /** Hidden from people. Anything in here means a bot filled in the form. */
  faxExtension: string;
}

export type ContactStatus = 'new' | 'read' | 'spam';

export interface ContactMessageRow {
  id: number;
  name: string;
  email: string;
  message: string;
  status: ContactStatus;
  spamReasons: string[];
  createdAt: string;
}

export interface ContactSummary {
  new: number;
  spam: number;
}
