import { describe, expect, it } from 'vitest';
import { describeTarget, planMigrations, type MigrationFile } from './migration-plan';

const file = (tag: string, when: number): MigrationFile => ({ tag, when, hash: `hash-${tag}` });
const a = file('a', 100);
const b = file('b', 200);
const c = file('c', 300);
const applied = (...files: MigrationFile[]) => files.map((f) => ({ hash: f.hash, createdAt: f.when }));
const tags = (files: MigrationFile[]) => files.map((f) => f.tag);

describe('planMigrations', () => {
  it('has everything pending on an empty database', () => {
    const plan = planMigrations([a, b], []);
    expect(tags(plan.pending)).toEqual(['a', 'b']);
    expect(plan.stranded).toEqual([]);
  });

  it('has only newer migrations pending', () => {
    const plan = planMigrations([a, b, c], applied(a));
    expect(tags(plan.applied)).toEqual(['a']);
    expect(tags(plan.pending)).toEqual(['b', 'c']);
  });

  it('is clean once everything is applied', () => {
    const plan = planMigrations([a, b], applied(a, b));
    expect(plan.pending).toEqual([]);
    expect(plan.stranded).toEqual([]);
    expect(plan.unknown).toEqual([]);
  });

  it('catches a migration merged after a newer one was already applied', () => {
    const plan = planMigrations([a, b, c], applied(a, c));
    expect(tags(plan.stranded)).toEqual(['b']);
    expect(plan.pending).toEqual([]);
  });

  it('reports an applied migration whose file was edited', () => {
    const edited = { ...a, hash: 'hash-edited' };
    const plan = planMigrations([edited, b], applied(a, b));
    expect(tags(plan.stranded)).toEqual(['a']);
    expect(plan.unknown).toEqual([{ hash: 'hash-a', createdAt: 100 }]);
  });
});

describe('describeTarget', () => {
  it('never includes credentials', () => {
    expect(describeTarget('libsql://db-org.turso.io?authToken=secret')).toBe('libsql://db-org.turso.io');
    expect(describeTarget('https://user:secret@db.example.org/x')).toBe('https://db.example.org');
    expect(describeTarget('file:data/cares.db')).toBe('file:data/cares.db');
    expect(describeTarget('not a url')).not.toContain('not');
  });
});
