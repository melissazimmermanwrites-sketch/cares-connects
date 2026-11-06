/**
 * Decides which responses tell search engines to stay away. Every *.netlify.app address is a
 * development or preview copy, so it's hidden however that deploy is configured, while the real
 * domain is unaffected even when it's served from Netlify too. Reads the Host header rather than
 * X-Forwarded-Host, which a visitor could set.
 */
export function shouldNoindex(host: string | undefined, path: string, noindexEnv?: string): boolean {
  const name = (host ?? '').split(':')[0].toLowerCase();
  return (
    noindexEnv === 'true' ||
    name.endsWith('.netlify.app') ||
    path.startsWith('/admin') ||
    path.startsWith('/api')
  );
}
