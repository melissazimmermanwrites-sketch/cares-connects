/**
 * Verification for a submitted organization: does the email belong to the website, does the site
 * exist, has it had new content in the last five months, and do we already know this org?
 *
 * These run only from a signed-in admin's queue, never because a visitor submitted the form.
 * They inform the reviewer; nothing is approved or rejected automatically.
 */
import type { CheckItem, EmailStatus, SubmissionChecks } from '../../shared/submissions';
import { historyItem, irsItem, listingsItem, type MatchCandidate } from './crosscheck';
import { isDisposableEmail } from './guard';

export const FRESH_MONTHS = 5;

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com',
  'att.net', 'sbcglobal.net', 'comcast.net', 'verizon.net', 'cox.net', 'charter.net',
]);

/** Places where many organizations share one domain, so a domain match proves nothing. */
const SHARED_HOSTS = [
  'facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'x.com', 'twitter.com', 'youtube.com', 'tiktok.com',
  'linktr.ee', 'sites.google.com', 'wixsite.com', 'weebly.com', 'wordpress.com', 'squarespace.com', 'godaddysites.com',
  'carrd.co', 'blogspot.com', 'eventbrite.com', 'yelp.com',
];

export function hostOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return null;
  }
}

const isUnder = (host: string, parent: string) => host === parent || host.endsWith(`.${parent}`);

export const isSharedHost = (host: string) => SHARED_HOSTS.some((shared) => isUnder(host, shared));

export function checkEmailDomain(email: string, website: string): Pick<CheckItem, 'status' | 'detail'> {
  const emailDomain = email.split('@').pop()?.toLowerCase() ?? '';
  const site = hostOf(website);
  if (isDisposableEmail(email)) return { status: 'fail', detail: `${emailDomain} is a throwaway email service.` };
  if (!site) return { status: 'fail', detail: 'The website address could not be read.' };
  if (FREE_MAIL.has(emailDomain)) {
    return { status: 'warn', detail: `Uses a personal address (${emailDomain}), so it can't be tied to ${site}. Common for small groups; confirm by phone.` };
  }
  if (isSharedHost(site)) return { status: 'warn', detail: `The site is on ${site}, so there's no domain of its own to match ${emailDomain} against.` };
  if (isUnder(emailDomain, site) || isUnder(site, emailDomain)) {
    return { status: 'pass', detail: `${emailDomain} matches ${site}. This shows the address is on their domain, not that the sender controls it.` };
  }
  return { status: 'fail', detail: `${emailDomain} doesn't match ${site}.` };
}

// ---------- freshness ----------

export function freshnessCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - FRESH_MONTHS);
  return cutoff;
}

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

function allMatches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => m[1]);
}

export interface Freshness {
  latest: Date | null;
  source: string | null;
}

/**
 * The newest believable date of new content. Dates the site publishes about itself win; a date
 * merely printed on the page only counts when there are none. Future dates (upcoming events) and
 * a Last-Modified header of "today" (many servers send it on every request) are ignored.
 */
export function findFreshness(input: { html: string; sitemap: string | null; feed?: string | null; lastModified: string | null; now: Date }): Freshness {
  const { html, sitemap, feed, lastModified, now } = input;
  const usable = (raw: string) => {
    const date = new Date(raw.trim());
    return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime() + 86_400_000 && date.getUTCFullYear() >= 2000 ? date : null;
  };
  const newest = (values: string[]) =>
    values.map(usable).reduce<Date | null>((best, d) => (d && (!best || d > best) ? d : best), null);

  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /(?:property|name|itemprop)=["'](?:article:modified_time|article:published_time|og:updated_time|last-modified|datemodified|datepublished)["']/i.test(tag))
    .flatMap((tag) => allMatches(tag, /content=["']([^"']+)["']/gi));

  const candidates: [string, Date | null][] = [
    ['the page’s publishing data', newest(allMatches(html, /"(?:dateModified|datePublished)"\s*:\s*"([^"]+)"/g))],
    ['the page’s metadata', newest(meta)],
    ['a dated post on the page', newest(allMatches(html, /<time\b[^>]*\bdatetime=["']([^"']+)["']/gi))],
    ['the site’s sitemap', sitemap ? newest(allMatches(sitemap, /<lastmod>\s*([^<]+?)\s*<\/lastmod>/gi)) : null],
    ['the site’s news feed', feed ? newest(allMatches(feed, /<(?:pubDate|updated|published)>\s*([^<]+?)\s*<\//gi)) : null],
  ];
  if (lastModified) {
    const header = usable(lastModified);
    if (header && now.getTime() - header.getTime() > 86_400_000) candidates.push(['the server’s Last-Modified date', header]);
  }

  let best: Freshness = { latest: null, source: null };
  for (const [source, date] of candidates) {
    if (date && (!best.latest || date > best.latest)) best = { latest: date, source };
  }
  if (best.latest) return best;

  const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const printed = [
    ...allMatches(text, new RegExp(`\\b((?:${MONTHS})\\.?\\s+\\d{1,2},?\\s+20\\d{2})\\b`, 'gi')),
    ...allMatches(text, /\b(\d{1,2}\/\d{1,2}\/20\d{2})\b/g),
  ];
  const date = newest(printed);
  return date ? { latest: date, source: 'a date printed on the page' } : { latest: null, source: null };
}

// ---------- safe fetching ----------

export function isPrivateAddress(ip: string): boolean {
  const value = ip.toLowerCase().replace(/^::ffff:/, '');
  if (value.includes(':')) {
    return value === '::' || value === '::1' || /^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith('2001:db8');
  }
  const octets = value.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Names and address forms that should never be fetched, before looking anything up. */
export function isBlockedUrl(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  if (url.username || url.password) return true;
  if (url.port && url.port !== '80' && url.port !== '443') return true;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.')) return true;
  if (/\.(localhost|local|internal|intranet|lan|home|corp|test|invalid)$/.test(host)) return true;
  // IP addresses, including the numeric forms URL parsing normalizes to dotted notation.
  return host.startsWith('[') || /^[\d.]+$/.test(host);
}

interface DnsAnswer {
  type: number;
  data: string;
}

/** DNS over HTTPS works the same on Node and on Workers, which have no real DNS API. */
async function dnsLookup(name: string, type: 'A' | 'AAAA' | 'MX'): Promise<DnsAnswer[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const body = (await res.json()) as { Answer?: DnsAnswer[] };
  return body.Answer ?? [];
}

const onWorkers = () => globalThis.navigator?.userAgent === 'Cloudflare-Workers';

/** True when the name resolves only to public addresses. */
async function resolvesPublicly(host: string): Promise<boolean> {
  let answers: DnsAnswer[];
  try {
    answers = (await Promise.all([dnsLookup(host, 'A'), dnsLookup(host, 'AAAA')])).flat();
  } catch {
    // A Worker can't reach private networks anyway. Anywhere else, unknown means no.
    return onWorkers();
  }
  const addresses = answers.filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
  return addresses.length > 0 && !addresses.some(isPrivateAddress);
}

export interface FetchedPage {
  finalUrl: string;
  status: number;
  body: string;
  lastModified: string | null;
}

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;

/** GET with every redirect re-checked, a timeout, and a size cap. Returns null if refused or unreachable. */
export async function safeFetch(start: string): Promise<FetchedPage | null> {
  let url: URL;
  try {
    url = new URL(start);
  } catch {
    return null;
  }
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (isBlockedUrl(url) || !(await resolvesPublicly(url.hostname))) return null;
      const res = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'CARES-Connects-Verifier/1.0 (+https://caresconnects.org)', Accept: 'text/html,application/xml;q=0.9,*/*;q=0.5' },
        signal: AbortSignal.timeout(8000),
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        url = new URL(location, url);
        continue;
      }
      return { finalUrl: url.href, status: res.status, body: await readCapped(res), lastModified: res.headers.get('last-modified') };
    }
  } catch {
    return null;
  }
  return null;
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (size >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return text;
}

// ---------- the checks ----------

/** Where sitemaps usually live: the standard spot, then the common WordPress plugin's. */
const SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml'];

const COMMON_WORDS = new Set(['the', 'of', 'and', 'for', 'inc', 'llc', 'a', 'an', 'in', 'at', 'to', 'county', 'california', 'organization', 'foundation', 'center', 'services', 'community']);

/** Whether the org's distinctive words appear on the page. */
export function nameAppearsOn(name: string, html: string): boolean {
  const words = name.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((w) => !COMMON_WORDS.has(w)) ?? [];
  if (!words.length) return true;
  const page = html.toLowerCase();
  const found = words.filter((w) => page.includes(w)).length;
  return found / words.length >= 0.6;
}

function freshnessItem(html: string, sitemap: string | null, feed: string | null, lastModified: string | null, now: Date): CheckItem {
  const { latest, source } = findFreshness({ html, sitemap, feed, lastModified, now });
  const label = `New content in the last ${FRESH_MONTHS} months`;
  if (!latest) {
    return { key: 'freshness', label, status: 'unknown', detail: 'The site doesn’t publish any dates we can read. Look at the site to judge.' };
  }
  const day = latest.toISOString().slice(0, 10);
  return latest >= freshnessCutoff(now)
    ? { key: 'freshness', label, status: 'pass', detail: `Latest date found: ${day}, from ${source}.` }
    : { key: 'freshness', label, status: 'fail', detail: `Latest date found: ${day}, from ${source}. That’s older than ${FRESH_MONTHS} months.` };
}

export function overallResult(items: CheckItem[], emailStatus: EmailStatus): SubmissionChecks['overall'] {
  if (emailStatus === 'declined' || items.some((i) => i.status === 'fail')) return 'fail';
  const passed = (key: CheckItem['key']) => items.find((i) => i.key === key)?.status === 'pass';
  const duplicate = items.find((i) => i.key === 'duplicate')?.status === 'warn';
  return emailStatus === 'verified' && passed('email_domain') && passed('freshness') && passed('website') && !duplicate ? 'pass' : 'review';
}

export async function runChecks(
  id: number,
  input: MatchCandidate,
  emailStatus: EmailStatus,
): Promise<SubmissionChecks> {
  const now = new Date();
  const items: CheckItem[] = [{ key: 'email_domain', label: 'Email matches website', ...checkEmailDomain(input.contactEmail, input.website) }];

  const emailDomain = input.contactEmail.split('@').pop() ?? '';
  try {
    const mx = await dnsLookup(emailDomain, 'MX');
    items.push(
      mx.some((a) => a.type === 15)
        ? { key: 'mail_server', label: 'Email domain receives mail', status: 'pass', detail: `${emailDomain} has mail servers.` }
        : { key: 'mail_server', label: 'Email domain receives mail', status: 'fail', detail: `${emailDomain} has no mail servers, so this address can’t receive email.` },
    );
  } catch {
    items.push({ key: 'mail_server', label: 'Email domain receives mail', status: 'unknown', detail: 'The DNS lookup didn’t answer. Run the checks again.' });
  }

  const page = await safeFetch(input.website);
  const websiteLabel = 'Website is up';
  if (!page) {
    items.push({ key: 'website', label: websiteLabel, status: 'fail', detail: 'Couldn’t load the site. It may be down, or the address may be wrong or not allowed.' });
    items.push({ key: 'freshness', label: `New content in the last ${FRESH_MONTHS} months`, status: 'unknown', detail: 'Couldn’t load the site to check.' });
  } else if (page.status === 401 || page.status === 403 || page.status === 429 || page.status === 503) {
    // Bot protection often answers this way even though people can see the site fine.
    items.push({ key: 'website', label: websiteLabel, status: 'unknown', detail: `The site refused our automated check (HTTP ${page.status}). Open it to confirm it works.` });
    items.push({ key: 'freshness', label: `New content in the last ${FRESH_MONTHS} months`, status: 'unknown', detail: 'The site refused our automated check. Look at the site to judge.' });
  } else if (page.status >= 400) {
    items.push({ key: 'website', label: websiteLabel, status: 'fail', detail: `The site answered with an error (HTTP ${page.status}).` });
    items.push({ key: 'freshness', label: `New content in the last ${FRESH_MONTHS} months`, status: 'unknown', detail: 'Couldn’t load the site to check.' });
  } else {
    const finalHost = hostOf(page.finalUrl);
    const moved = finalHost !== hostOf(input.website);
    items.push({
      key: 'website',
      label: websiteLabel,
      status: moved ? 'warn' : 'pass',
      detail: moved ? `The address sends visitors to ${finalHost}. Make sure that’s really them.` : `${finalHost} loaded.`,
    });
    items.push(
      nameAppearsOn(input.name, page.body)
        ? { key: 'name_on_site', label: 'Name appears on the site', status: 'pass', detail: 'The organization’s name is on the page.' }
        : { key: 'name_on_site', label: 'Name appears on the site', status: 'warn', detail: 'Couldn’t find the organization’s name on the page. Sites built with JavaScript can hide it from this check.' },
    );
    let sitemap: string | null = null;
    let feed: string | null = null;
    if (!isSharedHost(finalHost ?? '')) {
      for (const path of SITEMAP_PATHS) {
        const res = await safeFetch(new URL(path, page.finalUrl).href);
        if (res?.status === 200 && /<lastmod>/i.test(res.body)) {
          sitemap = res.body;
          break;
        }
      }
      const res = await safeFetch(new URL('/feed/', page.finalUrl).href);
      if (res?.status === 200 && /<(?:rss|feed)\b/i.test(res.body)) feed = res.body;
    }
    items.push(freshnessItem(page.body, sitemap, feed, page.lastModified, now));
  }

  items.push(await listingsItem(input), await irsItem(input.name, input.ein), await historyItem(id, input));
  return { ranAt: now.toISOString(), overall: overallResult(items, emailStatus), items };
}
