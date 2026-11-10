/**
 * Compares a submission with what we already have: published and archived listings, the IRS
 * charities we track, and earlier submissions. Matching happens here rather than in SQL because
 * listing phone numbers and addresses are free text, in many formats.
 */
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { discoveries, listingSubmissions, resources } from '../db/schema';
import type { CheckItem, CheckMatch } from '../../shared/submissions';
import { hostOf, isSharedHost } from './checks';

const NOISE_WORDS = new Set(['the', 'inc', 'incorporated', 'llc', 'corp', 'corporation', 'ltd', 'a']);

/** "The Gathering Inn, Inc. (Clothing Closet)" and "GATHERING INN" compare equal. */
export function normalizeName(name: string): string {
  const words = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((w) => w && !NOISE_WORDS.has(w));
  const main = words(name.replace(/\([^)]*\)/g, ' '));
  return (main.length ? main : words(name)).join(' ');
}

/** Every 10-digit US number in a free-text field. Short codes like 211 don't identify anyone. */
export function phoneNumbers(text: string | null): string[] {
  if (!text) return [];
  return [...text.matchAll(/(?<!\d)(?:\+?1[\s.-]*)?\(?(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})(?!\d)/g)].map((m) => m[1] + m[2] + m[3]);
}

/** The street line, only when it starts with a building number. */
export function normalizeStreet(address: string | null): string | null {
  if (!address) return null;
  const street = address.split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return /^\d/.test(street) ? street : null;
}

export interface MatchCandidate {
  name: string;
  website: string;
  phone: string;
  address: string | null;
  ein: string | null;
  contactEmail: string;
}

export interface ListingForMatch {
  id: number;
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  ein: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
}

/** Why a listing might be the same organization, strongest evidence first. Empty means no match. */
export function matchReasons(candidate: MatchCandidate, listing: ListingForMatch): string[] {
  const reasons: string[] = [];
  if (candidate.ein && listing.ein === candidate.ein) reasons.push('same EIN');
  if (normalizeName(candidate.name) === normalizeName(listing.name)) reasons.push('same name');
  const host = hostOf(candidate.website);
  if (host && !isSharedHost(host) && listing.website && hostOf(listing.website) === host) reasons.push('same website');
  const phones = new Set(phoneNumbers(candidate.phone));
  if ([...phoneNumbers(listing.phone), ...phoneNumbers(listing.contactPhone)].some((p) => phones.has(p))) reasons.push('same phone');
  const street = normalizeStreet(candidate.address);
  if (street && normalizeStreet(listing.address) === street) reasons.push('same address');
  if (listing.contactEmail && listing.contactEmail.toLowerCase() === candidate.contactEmail.toLowerCase()) reasons.push('same contact email');
  return reasons;
}

const MAX_SHOWN = 5;

export function findListingMatches(candidate: MatchCandidate, listings: ListingForMatch[]): { total: number; shown: CheckMatch[] } {
  const matches = listings
    .map((l) => ({ resourceId: l.id, name: l.name, isActive: l.isActive, reasons: matchReasons(candidate, l) }))
    .filter((m) => m.reasons.length)
    .sort((a, b) => Number(b.reasons.includes('same EIN')) - Number(a.reasons.includes('same EIN')) || b.reasons.length - a.reasons.length);
  return { total: matches.length, shown: matches.slice(0, MAX_SHOWN) };
}

const listingColumns = {
  id: resources.id,
  name: resources.name,
  website: resources.website,
  phone: resources.phone,
  address: resources.address,
  ein: resources.ein,
  contactEmail: resources.contactEmail,
  contactPhone: resources.contactPhone,
  isActive: resources.isActive,
};

/**
 * Everything in our database that looks like this organization: listings (published or archived)
 * and other submissions still in play. Empty means it can go to the to-be-sorted queue. IRS records
 * don't count, because being a known charity is a good sign rather than a duplicate.
 */
export async function databaseMatches(id: number, candidate: MatchCandidate): Promise<CheckMatch[]> {
  const [listings, others] = await Promise.all([
    db.select(listingColumns).from(resources),
    db
      .select()
      .from(listingSubmissions)
      .where(and(ne(listingSubmissions.id, id), inArray(listingSubmissions.status, ['pending', 'duplicate', 'approved']))),
  ]);
  const fromListings = findListingMatches(candidate, listings).shown;
  const fromSubmissions = others
    .map((o) => ({
      resourceId: o.resourceId,
      name: o.name,
      isActive: true,
      reasons: matchReasons(candidate, {
        id: o.id,
        name: o.name,
        website: o.website,
        phone: o.phone,
        address: o.address,
        ein: o.ein,
        contactEmail: o.contactEmail,
        contactPhone: null,
        isActive: true,
      }),
    }))
    .filter((m) => m.reasons.length);
  return [...fromListings, ...fromSubmissions.slice(0, MAX_SHOWN)];
}

export async function listingsItem(candidate: MatchCandidate): Promise<CheckItem> {
  const label = 'Not already listed';
  const listings = await db.select(listingColumns).from(resources);
  const { total, shown } = findListingMatches(candidate, listings);
  if (!total) {
    return { key: 'duplicate', label, status: 'pass', detail: `Compared with all ${listings.length} listings: no matching EIN, name, website, phone, address or email.` };
  }
  return {
    key: 'duplicate',
    label,
    status: 'warn',
    detail: total === 1 ? 'One listing looks related.' : `${total} listings look related${total > MAX_SHOWN ? `, closest ${MAX_SHOWN} shown` : ''}. A shared website can just mean the same agency.`,
    matches: shown,
  };
}

export async function irsItem(name: string, ein: string | null): Promise<CheckItem> {
  const label = 'IRS records';
  const normalized = normalizeName(name);
  if (ein) {
    const [match] = await db.select().from(discoveries).where(eq(discoveries.ein, ein)).limit(1);
    if (!match) {
      return { key: 'irs', label, status: 'warn', detail: `EIN ${ein} isn’t among the California human-services charities we track. Look it up on the IRS site.` };
    }
    if (!match.inIrs) return { key: 'irs', label, status: 'fail', detail: `EIN ${ein} (${match.name}) has dropped out of the IRS file.` };
    return normalizeName(match.name) === normalized
      ? { key: 'irs', label, status: 'pass', detail: `EIN ${ein} belongs to ${match.name}.` }
      : { key: 'irs', label, status: 'warn', detail: `EIN ${ein} belongs to “${match.name}”, a different name from the one submitted.` };
  }
  const pattern = `%${normalized.replace(/[%_\\]/g, '\\$&')}%`;
  const near = await db
    .select({ name: discoveries.name, ein: discoveries.ein, inIrs: discoveries.inIrs })
    .from(discoveries)
    .where(sql`lower(${discoveries.name}) like ${pattern} escape '\\'`)
    .limit(25);
  const exact = near.find((d) => normalizeName(d.name) === normalized);
  return exact
    ? { key: 'irs', label, status: exact.inIrs ? 'pass' : 'warn', detail: `Same name as ${exact.name} (EIN ${exact.ein})${exact.inIrs ? '' : ', which has dropped out of the IRS file'}. No EIN was given, so ask them to confirm it.` }
    : { key: 'irs', label, status: 'unknown', detail: 'No EIN given and no matching name. Public agencies and churches often won’t appear.' };
}

/** Whether this email or website has come through the form before, and what we decided. */
export async function historyItem(id: number, candidate: MatchCandidate): Promise<CheckItem> {
  const label = 'Earlier submissions';
  const host = hostOf(candidate.website);
  const rows = await db
    .select({ name: listingSubmissions.name, status: listingSubmissions.status, website: listingSubmissions.website, email: listingSubmissions.contactEmail, emailStatus: listingSubmissions.emailStatus })
    .from(listingSubmissions)
    .where(and(ne(listingSubmissions.id, id)));
  const related = rows.filter((r) => r.email === candidate.contactEmail || (host && !isSharedHost(host) && hostOf(r.website) === host));
  if (!related.length) return { key: 'history', label, status: 'pass', detail: 'First submission from this email and website.' };
  const count = (status: string) => related.filter((r) => r.status === status).length;
  const declined = related.filter((r) => r.emailStatus === 'declined').length;
  const parts = [
    `${related.length} earlier`,
    count('spam') ? `${count('spam')} marked spam` : null,
    count('rejected') ? `${count('rejected')} not a fit` : null,
    count('approved') ? `${count('approved')} added` : null,
    declined ? `${declined} where the email owner said it wasn’t them` : null,
  ].filter(Boolean);
  return { key: 'history', label, status: count('spam') || count('rejected') || declined ? 'warn' : 'pass', detail: `${parts.join(', ')}.` };
}
