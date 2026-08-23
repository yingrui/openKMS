/** App Builder route detection (Suite sub-app + full-bleed design canvas). */

export function isAppBuilderPath(pathname: string): boolean {
  return pathname === '/app-builder' || pathname.startsWith('/app-builder/');
}

/** Full-bleed design canvas (hide App Builder nav rail). */
export function isAppBuilderDesignPath(pathname: string): boolean {
  return /^\/app-builder\/[^/]+\/design$/.test(pathname);
}
