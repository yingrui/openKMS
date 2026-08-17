export type OntologySubApp =
  | 'ontology-manager'
  | 'object-explorer'
  | 'function-editor'
  | 'app-builder'
  | null;

export function getOntologySubApp(pathname: string): OntologySubApp {
  if (
    pathname === '/ontology-manager' ||
    pathname.startsWith('/ontology-manager/') ||
    pathname === '/ontology' ||
    pathname.startsWith('/ontology/')
  ) {
    return 'ontology-manager';
  }
  if (
    pathname === '/object-explorer' ||
    pathname.startsWith('/object-explorer/') ||
    pathname.startsWith('/objects') ||
    pathname.startsWith('/links')
  ) {
    return 'object-explorer';
  }
  if (pathname === '/function-editor' || pathname.startsWith('/function-editor/')) {
    return 'function-editor';
  }
  if (pathname === '/app-builder' || pathname.startsWith('/app-builder/')) {
    return 'app-builder';
  }
  return null;
}

export function isOntologySuitePath(pathname: string): boolean {
  return getOntologySubApp(pathname) !== null;
}

export function isObjectExplorerExplorePath(pathname: string): boolean {
  return pathname === '/object-explorer/explore' || pathname === '/object-explorer';
}

export function isFunctionEditorWorkspacePath(pathname: string): boolean {
  return /^\/function-editor\/[^/]+$/.test(pathname);
}

/** Full-bleed design canvas (hide App Builder nav rail). */
export function isAppBuilderDesignPath(pathname: string): boolean {
  return /^\/app-builder\/[^/]+\/design$/.test(pathname);
}
