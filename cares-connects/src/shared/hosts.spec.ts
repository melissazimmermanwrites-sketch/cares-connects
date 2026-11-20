import { describe, expect, it } from 'vitest';
import { isDevelopmentHost } from './hosts';

describe('isDevelopmentHost', () => {
  it('matches Netlify development and preview addresses', () => {
    expect(isDevelopmentHost('caresconnects.netlify.app')).toBe(true);
    expect(isDevelopmentHost('deploy-preview-12--caresconnects.netlify.app')).toBe(true);
    expect(isDevelopmentHost('CaresConnects.Netlify.App:443')).toBe(true);
  });
  it('leaves the real site and lookalikes alone', () => {
    for (const host of ['caresconnects.org', 'www.caresconnects.org', 'netlify.app.caresconnects.org', 'localhost', '', null, undefined]) {
      expect(isDevelopmentHost(host), String(host)).toBe(false);
    }
  });
});
