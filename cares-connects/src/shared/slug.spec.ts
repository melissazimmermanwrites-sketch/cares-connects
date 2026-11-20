import { describe, expect, it } from 'vitest';
import { resourceIdFromParam, resourceLink, resourceParam } from './slug';

describe('resourceParam', () => {
  it('puts the id in front of the name', () => {
    expect(resourceParam({ id: 12, name: 'Food & Shelter (Roseville)' })).toBe('12-food-and-shelter-roseville');
  });

  it('keeps listings with the same name distinct', () => {
    expect(resourceParam({ id: 1, name: 'Same Name' })).not.toBe(resourceParam({ id: 2, name: 'Same Name' }));
  });

  it('falls back to the id when the name has nothing to slug', () => {
    expect(resourceParam({ id: 7, name: '—' })).toBe('7');
  });
});

describe('resourceLink', () => {
  it('builds router commands', () => {
    expect(resourceLink({ id: 3, name: 'Abc' })).toEqual(['/resource', '3-abc']);
  });
});

describe('resourceIdFromParam', () => {
  it('reads current and older links', () => {
    expect(resourceIdFromParam('12-placer-food-bank')).toBe(12);
    expect(resourceIdFromParam('12')).toBe(12);
  });

  it('rejects anything that does not start with a whole id', () => {
    expect(resourceIdFromParam('abc')).toBeNaN();
    expect(resourceIdFromParam('12abc')).toBeNaN();
    expect(resourceIdFromParam('')).toBeNaN();
  });
});
