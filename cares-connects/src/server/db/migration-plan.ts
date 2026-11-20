export interface MigrationFile {
  tag: string;
  when: number;
  hash: string;
}

export interface AppliedMigration {
  hash: string;
  createdAt: number;
}

export interface MigrationPlan {
  applied: MigrationFile[];
  /** Will run on the next db:migrate. */
  pending: MigrationFile[];
  /**
   * Not applied, and older than the newest applied one. Drizzle only runs migrations newer than the
   * newest applied, so these would be skipped forever with no error. This happens when branches
   * merge in a different order than they were written, or when an applied file gets edited.
   */
  stranded: MigrationFile[];
  /** Recorded in the database with no matching file: edited since applied, or from another branch. */
  unknown: AppliedMigration[];
}

export function planMigrations(files: MigrationFile[], applied: AppliedMigration[]): MigrationPlan {
  const appliedHashes = new Set(applied.map((a) => a.hash));
  const fileHashes = new Set(files.map((f) => f.hash));
  const newest = Math.max(0, ...applied.map((a) => a.createdAt));
  const notApplied = files.filter((f) => !appliedHashes.has(f.hash));
  return {
    applied: files.filter((f) => appliedHashes.has(f.hash)),
    pending: notApplied.filter((f) => f.when > newest),
    stranded: notApplied.filter((f) => f.when <= newest),
    unknown: applied.filter((a) => !fileHashes.has(a.hash)),
  };
}

/** A database address that's safe to print: no credentials or query string. */
export function describeTarget(url: string): string {
  if (url.startsWith('file:')) return url.split('?')[0];
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '(unreadable database address)';
  }
}
