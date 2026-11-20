/**
 * Every *.netlify.app address is the development site or a preview, so search engines are told
 * to skip it. The real domain is unaffected even if it's ever served from Netlify too.
 */
export function isDevelopmentHost(host: string | null | undefined): boolean {
  const name = (host ?? '').split(':')[0].toLowerCase().replace(/\.$/, '');
  return name.endsWith('.netlify.app');
}
