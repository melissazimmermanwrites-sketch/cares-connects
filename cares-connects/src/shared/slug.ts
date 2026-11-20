export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * URL segment for a listing's page, e.g. "12-placer-food-bank". The id stays in front because
 * some listings share a name, and so a page's address still works after its listing is renamed.
 */
export function resourceParam(resource: { id: number; name: string }): string {
  const slug = slugify(resource.name);
  return slug ? `${resource.id}-${slug}` : String(resource.id);
}

/** routerLink commands for a listing's page. */
export function resourceLink(resource: { id: number; name: string }): [string, string] {
  return ['/resource', resourceParam(resource)];
}

/** The listing id from a URL segment, whether it's the current "12-name" form or an older "12" link. */
export function resourceIdFromParam(param: string): number {
  const match = /^(\d+)(?:-.*)?$/.exec(param);
  return match ? Number(match[1]) : NaN;
}
