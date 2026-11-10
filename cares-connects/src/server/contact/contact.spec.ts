import { describe, expect, it } from 'vitest';
import { checkToken, ipBucket, issueToken, spamReasons } from './guard';

describe('contact form token', () => {
  const t0 = 1_000_000_000_000;
  it('accepts a token after the minimum fill time', () => {
    expect(checkToken('s', issueToken('s', t0), t0 + 5000).ok).toBe(true);
  });
  it('rejects instant sends, old tokens, wrong secrets and tampering', () => {
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
  it('leaves normal messages alone, including hard subjects', () => {
    expect(spamReasons({ name: 'Ana', message: 'I need help finding gambling recovery groups and a shelter. See www.example.org' })).toEqual([]);
  });
  it('flags spam signals', () => {
    expect(spamReasons({ name: 'Ana', message: 'Best seo services and backlinks' }).length).toBe(2);
    expect(spamReasons({ name: 'Ana', message: 'http://a.co http://b.co http://c.co' })).toContain('3 links');
    expect(spamReasons({ name: 'Ana', message: '<a href="x">click here</a>' })).toContain('Contains HTML or link markup');
    expect(spamReasons({ name: 'www.buy.com', message: 'Hello there friend' })).toContain('Link in the name');
  });
});
