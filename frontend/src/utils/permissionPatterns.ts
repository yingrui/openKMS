/** Mirrors backend ``permission_pattern_engine.frontend_path_matches_pattern`` / ``pathname_allowed_by_patterns``. */

export type PermissionCatalogEntry = {
  key: string;
  label: string;
  description?: string;
  frontend_route_patterns: string[];
  backend_api_patterns: string[];
};

export function normalizePathname(pathname: string): string {
  let p = pathname.split('?', 1)[0].trim();
  p = p.replace(/\/+$/, '') || '/';
  if (p !== '/' && !p.startsWith('/')) {
    p = `/${p}`;
  }
  return p;
}

export function frontendPathMatchesPattern(pathname: string, pattern: string): boolean {
  const p = normalizePathname(pathname);
  let pat = pattern.trim();
  pat = pat.replace(/\/+$/, '') || '/';
  if (pat !== '/' && !pat.startsWith('/')) {
    pat = `/${pat}`;
  }
  if (pat.endsWith('/*')) {
    const base = pat.slice(0, -2).replace(/\/+$/, '') || '/';
    if (base === '/') {
      return true;
    }
    const baseNorm = normalizePathname(base);
    if (p === baseNorm) {
      return true;
    }
    return p.startsWith(`${baseNorm}/`);
  }
  return p === pat;
}

export function pathnameAllowedByPatterns(pathname: string, patterns: string[]): boolean {
  for (const pat of patterns) {
    if (pat && frontendPathMatchesPattern(pathname, pat)) {
      return true;
    }
  }
  return false;
}

/** Routes under MainLayout that any signed-in user may open (no catalog pattern needed). */
export function isSpaPublicPath(pathname: string): boolean {
  const p = normalizePathname(pathname);
  return p === '/' || p === '/profile';
}

export function buildFrontendPatternUnion(
  catalog: PermissionCatalogEntry[],
  permissionKeys: string[],
): string[] {
  const keys = new Set(permissionKeys);
  const out: string[] = [];
  for (const row of catalog) {
    if (!keys.has(row.key)) continue;
    const fe = Array.isArray(row.frontend_route_patterns) ? row.frontend_route_patterns : [];
    for (const s of fe) {
      if (typeof s === 'string' && s.trim()) {
        out.push(s.trim());
      }
    }
  }
  return out;
}
