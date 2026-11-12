import { describe, expect, it } from 'vitest';
import { resourceLabel } from './auditFormat';

describe('resourceLabel', () => {
  it('turns a path segment into something a person reads', () => {
    expect(resourceLabel('object-types')).toBe('Object types');
    expect(resourceLabel('auth-refresh')).toBe('Auth refresh');
    expect(resourceLabel('datasets')).toBe('Datasets');
  });

  it('keeps an odd segment rather than showing an empty label', () => {
    expect(resourceLabel('---')).toBe('---');
    expect(resourceLabel('')).toBe('');
  });
});
