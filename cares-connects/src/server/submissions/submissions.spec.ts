import { describe, expect, it } from 'vitest';
import { checkEmailDomain, findFreshness, freshnessCutoff, isBlockedUrl, isPrivateAddress, nameAppearsOn, overallResult } from './checks';
import { checkToken, ipBucket, issueToken, spamReasons } from './guard';
import { findListingMatches, matchReasons, normalizeName, phoneNumbers, type ListingForMatch } from './crosscheck';
import { buildVerificationEmail } from './mail';
import { nextStatusAfterConfirm, type CheckItem } from '../../shared/submissions';

const now = new Date('2026-11-07T12:00:00Z');

describe('form token', () => {
  const t0 = 1_000_000_000_000;
  it('accepts a token after the minimum fill time', () => {
    expect(checkToken('s', issueToken('s', t0), t0 + 5000).ok).toBe(true);
  });
  it('rejects instant submissions, old tokens, wrong secrets and tampering', () => {
    const token = issueToken('s', t0);
    expect(checkToken('s', token, t0 + 500)).toEqual({ ok: false, reason: 'too_fast' });
    expect(checkToken('s', token, t0 + 3 * 3600_000)).toEqual({ ok: false, reason: 'expired' });
    expect(checkToken('other', token, t0 + 5000)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkToken('s', `${t0 - 100000}${token.slice(13)}`, t0 + 5000)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkToken('s', 'garbage', t0)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('ipBucket', () => {
  it('groups an IPv6 /64 and keeps IPv4 whole', () => {
    expect(ipBucket('2001:db8:1:2:aaaa::1')).toBe(ipBucket('2001:db8:1:2:bbbb::9'));
    expect(ipBucket('::ffff:1.2.3.4')).toBe('1.2.3.4');
  });
});

describe('spamReasons', () => {
  const base = { name: 'Placer Food Closet', mission: null, services: 'Weekly food pantry for families.', contactEmail: 'a@placerfood.org' };
  it('passes a normal submission, including sensitive service words', () => {
    expect(spamReasons(base)).toEqual([]);
    expect(spamReasons({ ...base, services: 'Tribal casino employee support and gambling recovery groups.' })).toEqual([]);
  });
  it('flags spam signals', () => {
    expect(spamReasons({ ...base, services: 'Best seo services and backlinks' }).length).toBe(2);
    expect(spamReasons({ ...base, services: 'http://a.co http://b.co http://c.co' })).toContain('3 links in the description');
    expect(spamReasons({ ...base, services: '<a href="x">click here now</a>' })).toContain('Contains HTML or link markup');
    expect(spamReasons({ ...base, contactEmail: 'x@mailinator.com' })).toContain('Throwaway email address');
  });
});

describe('checkEmailDomain', () => {
  const status = (email: string, site: string) => checkEmailDomain(email, site).status;
  it('passes the same domain and subdomains', () => {
    expect(status('amy@foodbank.org', 'https://www.foodbank.org/about')).toBe('pass');
    expect(status('amy@placer.ca.gov', 'https://www.placer.ca.gov')).toBe('pass');
    expect(status('amy@mail.foodbank.org', 'foodbank.org')).toBe('pass');
  });
  it('fails a different domain, including lookalikes and sibling subdomains', () => {
    expect(status('amy@notfoodbank.org', 'https://foodbank.org')).toBe('fail');
    expect(status('amy@foodbank.org.evil.com', 'https://foodbank.org')).toBe('fail');
    expect(status('amy@yolo.ca.gov', 'https://www.placer.ca.gov')).toBe('fail');
  });
  it('warns on personal email and shared site hosts', () => {
    expect(status('amy@gmail.com', 'https://foodbank.org')).toBe('warn');
    expect(status('amy@foodbank.org', 'https://www.facebook.com/foodbank')).toBe('warn');
  });
  it('fails throwaway email', () => {
    expect(status('x@mailinator.com', 'https://foodbank.org')).toBe('fail');
  });
});

describe('findFreshness', () => {
  const run = (html: string, sitemap: string | null = null, lastModified: string | null = null) =>
    findFreshness({ html, sitemap, lastModified, now });

  it('reads structured dates and takes the newest', () => {
    const html = '<script type="application/ld+json">{"datePublished":"2026-01-01","dateModified":"2026-09-15T10:00:00Z"}</script>';
    expect(run(html).latest?.toISOString().slice(0, 10)).toBe('2026-09-15');
  });
  it('reads meta tags, time tags and sitemaps', () => {
    expect(run('<meta property="article:modified_time" content="2026-08-01">').latest?.getUTCMonth()).toBe(7);
    expect(run('<time datetime="2026-07-04">July 4</time>').latest?.getUTCMonth()).toBe(6);
    expect(run('', '<url><lastmod>2026-10-30</lastmod></url>').source).toBe('the site’s sitemap');
  });
  it('reads news feeds', () => {
    const found = findFreshness({ html: '', sitemap: null, feed: '<rss><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></rss>', lastModified: null, now });
    expect(found.source).toBe('the site’s news feed');
    expect(found.latest?.getUTCDate()).toBe(2);
  });
  it('ignores future dates such as upcoming events', () => {
    expect(run('<time datetime="2027-03-01">Gala</time><time datetime="2025-01-01">Old</time>').latest?.getUTCFullYear()).toBe(2025);
  });
  it('ignores a Last-Modified of right now but uses an older one', () => {
    expect(run('', null, now.toUTCString()).latest).toBeNull();
    expect(run('', null, 'Mon, 01 Jun 2026 00:00:00 GMT').latest?.getUTCMonth()).toBe(5);
  });
  it('falls back to a date printed on the page only when nothing better exists', () => {
    expect(run('<p>Posted October 12, 2026</p>').source).toBe('a date printed on the page');
    expect(run('<p>October 12, 2026</p><time datetime="2026-02-01"></time>').source).toBe('a dated post on the page');
  });
  it('returns nothing when no dates exist, without counting a copyright year', () => {
    expect(run('<footer>© 2026 Food Bank</footer>').latest).toBeNull();
  });
  it('uses a five month cutoff', () => {
    expect(freshnessCutoff(now).toISOString().slice(0, 10)).toBe('2026-06-07');
  });
});

describe('safe fetching rules', () => {
  it('blocks private and reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'nonsense']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it('blocks unsafe URLs', () => {
    for (const url of ['http://localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://[::1]/', 'file:///etc/passwd', 'https://foo.internal/', 'https://user:pw@example.org/', 'https://example.org:8443/', 'ftp://example.org/']) {
      expect(isBlockedUrl(new URL(url)), url).toBe(true);
    }
    expect(isBlockedUrl(new URL('https://www.foodbank.org/about'))).toBe(false);
  });
});

describe('nameAppearsOn', () => {
  it('looks for the distinctive words', () => {
    expect(nameAppearsOn('The Gathering Inn, Inc.', '<h1>Welcome to The Gathering Inn</h1>')).toBe(true);
    expect(nameAppearsOn('The Gathering Inn', '<h1>Cheap watches</h1>')).toBe(false);
  });
});

describe('overallResult', () => {
  const item = (key: CheckItem['key'], status: CheckItem['status']): CheckItem => ({ key, status, label: '', detail: '' });
  const good = [item('email_domain', 'pass'), item('website', 'pass'), item('freshness', 'pass'), item('irs', 'unknown')];
  it('passes only with the checks good and the email confirmed', () => {
    expect(overallResult(good, 'verified')).toBe('pass');
    expect(overallResult(good, 'sent')).toBe('review');
    expect(overallResult([item('email_domain', 'warn'), item('website', 'pass'), item('freshness', 'pass')], 'verified')).toBe('review');
    expect(overallResult([...good, item('duplicate', 'warn')], 'verified')).toBe('review');
  });
  it('fails on any failed check, or when the email owner says it was not them', () => {
    expect(overallResult([...good, item('freshness', 'fail')], 'verified')).toBe('fail');
    expect(overallResult(good, 'declined')).toBe('fail');
  });
});

describe('the gate on the to-be-sorted queue', () => {
  it('only lets a confirmed request through when nothing in the database matches', () => {
    expect(nextStatusAfterConfirm([])).toBe('pending');
    expect(nextStatusAfterConfirm([{ resourceId: 1, name: 'x', isActive: false, reasons: ['same EIN'] }])).toBe('duplicate');
  });
});

describe('normalizeName', () => {
  it('treats spelling variations of one name as equal', () => {
    const base = normalizeName('Gathering Inn');
    expect(normalizeName('The Gathering Inn, Inc.')).toBe(base);
    expect(normalizeName('GATHERING INN')).toBe(base);
    expect(normalizeName('The Gathering Inn (Clothing Closet)')).toBe(base);
    expect(normalizeName('Food & Shelter')).toBe(normalizeName('Food and Shelter'));
    expect(normalizeName('Gathering Place')).not.toBe(base);
  });
  it('keeps a name made only of a parenthetical', () => {
    expect(normalizeName('(CHIRLA)')).toBe('chirla');
  });
});

describe('phoneNumbers', () => {
  it('reads common formats and several numbers from free text', () => {
    expect(phoneNumbers('(916) 252-6053')).toEqual(['9162526053']);
    expect(phoneNumbers('+1 916.252.6053 ext 4')).toEqual(['9162526053']);
    expect(phoneNumbers('Dial 211 or (833) 342-5211; TTY 916-555-0100')).toEqual(['8333425211', '9165550100']);
  });
  it('ignores short codes and longer digit runs', () => {
    expect(phoneNumbers('211')).toEqual([]);
    expect(phoneNumbers('12345678901234')).toEqual([]);
    expect(phoneNumbers(null)).toEqual([]);
  });
});

describe('findListingMatches', () => {
  const candidate = { name: 'The Gathering Inn', website: 'https://www.gatheringinn.org/help', phone: '916-555-0100', address: '201 Main St, Roseville, CA', ein: '123456789', contactEmail: 'a@gatheringinn.org' };
  const listing = (over: Partial<ListingForMatch>): ListingForMatch => ({ id: 1, name: 'Unrelated', website: null, phone: null, address: null, ein: null, contactEmail: null, contactPhone: null, isActive: true, ...over });
  const reasons = (over: Partial<ListingForMatch>) => matchReasons(candidate, listing(over));

  it('matches on each kind of evidence', () => {
    expect(reasons({ ein: '123456789' })).toEqual(['same EIN']);
    expect(reasons({ name: 'Gathering Inn (Clothing Closet)' })).toEqual(['same name']);
    expect(reasons({ website: 'https://gatheringinn.org/' })).toEqual(['same website']);
    expect(reasons({ phone: '(916) 555-0100 main' })).toEqual(['same phone']);
    expect(reasons({ contactPhone: '9165550100' })).toEqual(['same phone']);
    expect(reasons({ address: '201 Main St., Suite 2' })).toEqual(['same address']);
    expect(reasons({ address: '202 Main St, Roseville' })).toEqual([]);
    expect(reasons({ address: '201 Main St, Sacramento' })).toEqual(['same address']);
    expect(reasons({ contactEmail: 'A@gatheringinn.org' })).toEqual(['same contact email']);
  });
  it('does not match unrelated listings, or shared hosts like Facebook', () => {
    expect(reasons({})).toEqual([]);
    const onFacebook = { ...candidate, website: 'https://www.facebook.com/a' };
    expect(matchReasons(onFacebook, listing({ website: 'https://www.facebook.com/b' }))).toEqual([]);
  });
  it('ranks an EIN match first, and includes archived listings', () => {
    const { total, shown } = findListingMatches(candidate, [
      listing({ id: 1, website: 'https://gatheringinn.org', phone: '916-555-0100' }),
      listing({ id: 2, ein: '123456789', isActive: false }),
      listing({ id: 3 }),
    ]);
    expect(total).toBe(2);
    expect(shown[0]).toMatchObject({ resourceId: 2, isActive: false });
  });
});

describe('buildVerificationEmail', () => {
  const link = 'https://caresconnects.org/list-your-organization/verify?token=abc';
  it('has a fixed subject and includes the link', () => {
    const mail = buildVerificationEmail({ orgName: 'Buy now', link });
    expect(mail.subject).toBe('Confirm your CARES Connects listing request');
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(link);
  });
  it('escapes the name, keeps it short and on one line', () => {
    const html = buildVerificationEmail({ orgName: '<a href="x">Click</a>', link }).html;
    expect(html).not.toContain('<a href="x">');
    expect(html).toContain('&lt;a href=');
    const long = buildVerificationEmail({ orgName: `${'x'.repeat(300)}\n\nsecond line`, link }).text;
    expect(long).not.toContain('x'.repeat(101));
    expect(long).not.toContain('second line');
  });
});

describe('spam filter and email safety', () => {
  it('flags a web address in the name, which would otherwise reach the email', () => {
    const base = { mission: null, services: 'Weekly food pantry.', contactEmail: 'a@b.org' };
    expect(spamReasons({ ...base, name: 'Win prizes at evil.com today' })).toContain('Link in the organization name');
    expect(spamReasons({ ...base, name: 'St. Vincent de Paul Society' })).toEqual([]);
  });
});
