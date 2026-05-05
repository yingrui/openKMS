import { describe, it, expect } from 'vitest';
import {
  buildFrontendPatternUnion,
  frontendPathMatchesPattern,
  isSpaPublicPath,
  normalizePathname,
  pathnameAllowedByPatterns,
  type PermissionCatalogEntry,
} from './permissionPatterns';

describe('normalizePathname', () => {
  it('strips query and trailing slashes', () => {
    expect(normalizePathname('/docs/view/1?tab=meta')).toBe('/docs/view/1');
    expect(normalizePathname('/console///')).toBe('/console');
  });

  it('ensures leading slash', () => {
    expect(normalizePathname('documents')).toBe('/documents');
  });

  it('root stays root', () => {
    expect(normalizePathname('/')).toBe('/');
  });
});

describe('frontendPathMatchesPattern', () => {
  it('exact match', () => {
    expect(frontendPathMatchesPattern('/documents', '/documents')).toBe(true);
    expect(frontendPathMatchesPattern('/documents/', '/documents')).toBe(true);
  });

  it('wildcard prefix', () => {
    expect(frontendPathMatchesPattern('/documents/channels/x', '/documents/*')).toBe(true);
    expect(frontendPathMatchesPattern('/documents', '/documents/*')).toBe(true);
    expect(frontendPathMatchesPattern('/articles', '/documents/*')).toBe(false);
  });

  it('root wildcard matches all', () => {
    expect(frontendPathMatchesPattern('/anything', '/*')).toBe(true);
  });
});

describe('pathnameAllowedByPatterns', () => {
  it('true if any pattern matches', () => {
    expect(pathnameAllowedByPatterns('/x', ['/a', '/x'])).toBe(true);
  });

  it('false when none match', () => {
    expect(pathnameAllowedByPatterns('/z', ['/a', '/b/*'])).toBe(false);
  });
});

describe('isSpaPublicPath', () => {
  it('allows home and profile', () => {
    expect(isSpaPublicPath('/')).toBe(true);
    expect(isSpaPublicPath('/profile')).toBe(true);
    expect(isSpaPublicPath('/documents')).toBe(false);
  });
});

describe('buildFrontendPatternUnion', () => {
  it('collects patterns only for held keys', () => {
    const catalog: PermissionCatalogEntry[] = [
      {
        key: 'documents:read',
        label: 'Docs',
        frontend_route_patterns: ['/documents', '/documents/*'],
        backend_api_patterns: [],
      },
      {
        key: 'articles:read',
        label: 'Art',
        frontend_route_patterns: ['/articles'],
        backend_api_patterns: [],
      },
    ];
    const union = buildFrontendPatternUnion(catalog, ['documents:read']);
    expect(union).toEqual(['/documents', '/documents/*']);
  });

  it('skips empty or non-string patterns', () => {
    const catalog: PermissionCatalogEntry[] = [
      {
        key: 'k',
        label: 'K',
        frontend_route_patterns: ['  /ok  ', '', '  '],
        backend_api_patterns: [],
      },
    ];
    expect(buildFrontendPatternUnion(catalog, ['k'])).toEqual(['/ok']);
  });
});
