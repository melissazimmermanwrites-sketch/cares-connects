import { describe, expect, it } from 'vitest';
import { shouldNoindex } from './robots';

describe('shouldNoindex', () => {
  it('hides every Netlify address, at any path', () => {
    expect(shouldNoindex('caresconnects.netlify.app', '/')).toBe(true);
    expect(shouldNoindex('caresconnects.netlify.app', '/find')).toBe(true);
    expect(shouldNoindex('deploy-preview-7--caresconnects.netlify.app', '/')).toBe(true);
    expect(shouldNoindex('develop--caresconnects.netlify.app', '/')).toBe(true);
  });

  it('ignores case and port in the host', () => {
    expect(shouldNoindex('CaresConnects.Netlify.App', '/')).toBe(true);
    expect(shouldNoindex('caresconnects.netlify.app:443', '/')).toBe(true);
  });

  it('keeps the real site public', () => {
    expect(shouldNoindex('caresconnects.org', '/')).toBe(false);
    expect(shouldNoindex('www.caresconnects.org', '/find')).toBe(false);
    expect(shouldNoindex('cares-connects.example.workers.dev', '/')).toBe(false);
    expect(shouldNoindex(undefined, '/')).toBe(false);
  });

  it('is not fooled by hosts that only look like Netlify', () => {
    expect(shouldNoindex('netlify.app.caresconnects.org', '/')).toBe(false);
    expect(shouldNoindex('caresconnectsnetlify.app', '/')).toBe(false);
  });

  it('still hides admin and API paths everywhere', () => {
    expect(shouldNoindex('caresconnects.org', '/admin')).toBe(true);
    expect(shouldNoindex('caresconnects.org', '/admin/login')).toBe(true);
    expect(shouldNoindex('caresconnects.org', '/api/resources')).toBe(true);
  });

  it('still honours NOINDEX=true for other test deploys', () => {
    expect(shouldNoindex('caresconnects.org', '/', 'true')).toBe(true);
    expect(shouldNoindex('caresconnects.org', '/', 'false')).toBe(false);
  });
});
