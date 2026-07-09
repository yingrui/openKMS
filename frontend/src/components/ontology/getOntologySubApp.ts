export type OntologySubApp = 'ontology-manager' | 'object-explorer' | 'function-editor' | null;

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
