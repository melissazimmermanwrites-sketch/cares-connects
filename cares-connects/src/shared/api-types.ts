/** Shapes sent over /api. Imported by both the Express server and the Angular app. */

export type VerificationStatus = 'verified' | 'needs_verification';

export interface CountyRef {
  id: number;
  slug: string;
  name: string;
}

export interface CountySummary extends CountyRef {
  /** Live listings that serve this county directly (statewide listings not included). */
  resourceCount: number;
}

/** "Statewide", "Placer County", "Placer & Sacramento", or "Placer, Sacramento + 2 more". */
export function serviceAreaLabel(area: { statewide: boolean; counties: { name: string }[] }): string {
  if (area.statewide) return 'Statewide';
  const names = area.counties.map((c) => c.name);
  if (names.length === 0) return 'California';
  if (names.length === 1) return `${names[0]} County`;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} + ${names.length - 2} more`;
}

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  verified: 'Verified',
  needs_verification: 'Needs verification',
};

export interface CategorySummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  resourceCount: number;
}

export interface CategoryRef {
  id: number;
  slug: string;
  name: string;
}

/** Fields an admin can edit. */
export interface ResourceInput {
  name: string;
  /** Serves all of California. */
  statewide: boolean;
  countyIds: number[];
  /** IRS employer ID, when known (set automatically for listings approved from discovery). */
  ein: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  mission: string | null;
  services: string | null;
  notes: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  verificationStatus: VerificationStatus;
  /** ISO date string; null when never verified. */
  verifiedAt: string | null;
  duplicateGroup: string | null;
  isActive: boolean;
  categoryIds: number[];
  tags: string[];
}

/** What the public site shows. Contact person/email and internal fields are left out. */
export interface PublicResource {
  id: number;
  name: string;
  statewide: boolean;
  counties: CountyRef[];
  website: string | null;
  phone: string | null;
  address: string | null;
  mission: string | null;
  services: string | null;
  notes: string | null;
  verificationStatus: VerificationStatus;
  categories: CategoryRef[];
  tags: string[];
}

export interface AdminResource extends ResourceInput {
  id: number;
  categories: CategoryRef[];
  counties: CountyRef[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  /** Other listings sharing this duplicateGroup. */
  duplicates: { id: number; name: string; categories: string[] }[];
}

export interface AdminResourceRow {
  id: number;
  name: string;
  /** Human label, e.g. "Placer & Sacramento". */
  serviceArea: string;
  phone: string | null;
  website: string | null;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  duplicateGroup: string | null;
  isActive: boolean;
  categories: string[];
  updatedAt: string;
  updatedBy: string | null;
}

/** Listings per page on the public directory (/resources). */
export const DIRECTORY_PAGE_SIZE = 24;

export interface Page<T> {
  items: T[];
  total: number;
}

export interface AdminStats {
  total: number;
  active: number;
  archived: number;
  needsVerification: number;
  possibleDuplicates: number;
}

export interface AdminResourceQuery {
  q?: string;
  /** County id, or "statewide". */
  county?: number | 'statewide' | '';
  category?: number | '';
  status?: VerificationStatus | '';
  duplicates?: boolean;
  archived?: 'active' | 'archived' | 'all';
  sort?: 'name' | 'verificationStatus' | 'verifiedAt' | 'updatedAt';
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CategoryInput {
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface SessionUser {
  id: number;
  email: string;
  name: string;
}

// ---------- IRS discovery ----------

export type DiscoveryStatus = 'new' | 'available' | 'approved' | 'rejected' | 'listed';

export const DISCOVERY_STATUS_LABELS: Record<DiscoveryStatus, string> = {
  new: 'New',
  available: 'Not reviewed',
  approved: 'Added to directory',
  rejected: 'Not a fit',
  listed: 'Already listed',
};

/** A California 501(c)(3) from the IRS file that might belong in the directory. */
export interface DiscoveryRow {
  ein: string;
  /** Title-cased from the IRS's all-caps name. */
  name: string;
  street: string | null;
  city: string | null;
  zip: string | null;
  county: CountyRef | null;
  ntee: string;
  /** "2026-09" (the IRS ruling month), or null. */
  ruling: string | null;
  category: CategoryRef | null;
  status: DiscoveryStatus;
  inIrs: boolean;
  firstSeenAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  resourceId: number | null;
}

export interface DiscoveryQuery {
  q?: string;
  /** "queue" = new only (default); "all" = every status. */
  status?: DiscoveryStatus | 'all' | '';
  county?: number | '';
  category?: number | '';
  page?: number;
  pageSize?: number;
}

export interface DiscoveryRunInfo {
  id: number;
  status: 'running' | 'success' | 'failed';
  triggeredBy: string;
  sourceModified: string | null;
  rowsRead: number;
  rowsMatched: number;
  newCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface DiscoverySummary {
  newCount: number;
  total: number;
  lastRun: DiscoveryRunInfo | null;
}

// ---------- chat ----------

/** /api/locate: what someone typed as their location, resolved to a county. */
export type LocateResult =
  | { kind: 'county'; county: CountyRef; label: string }
  | { kind: 'choices'; choices: { county: CountyRef; label: string }[] }
  | { kind: 'outside' }
  | { kind: 'unknown' };
