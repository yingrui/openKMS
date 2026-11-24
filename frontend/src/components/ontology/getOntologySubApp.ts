export type OntologySubApp =
  | 'ontology-manager'
  | 'object-explorer'
  | 'function-editor'
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
  return null;
}

export function isOntologySuitePath(pathname: string): boolean {
  return getOntologySubApp(pathname) !== null;
}

export function isObjectExplorerExplorePath(pathname: string): boolean {
  return pathname === '/object-explorer/explore' || pathname === '/object-explorer';
}

/** Static routes under `/function-editor` that are list views, not a function's editor. */
const FUNCTION_EDITOR_LIST_SEGMENTS = new Set(['logic']);

/**
 * A single segment after `/function-editor/` is a function id — except the static list routes. `/function-editor/logic`
 * used to match here, which dropped the rail and gave the list the full-bleed editor layout.
 */
export function isFunctionEditorWorkspacePath(pathname: string): boolean {
  const match = /^\/function-editor\/([^/]+)$/.exec(pathname);
  return match !== null && !FUNCTION_EDITOR_LIST_SEGMENTS.has(match[1]);
}
