export type TabId = 'documents' | 'wiki_spaces' | 'data_scope' | 'faqs' | 'chunks' | 'search' | 'settings';
export type SettingsSubTabId = 'general' | 'agent' | 'sharing';

export const TAB_ORDER: TabId[] = [
  'documents',
  'wiki_spaces',
  'data_scope',
  'faqs',
  'chunks',
  'search',
  'settings',
];

/**
 * Each tab is a route, so a reader can link a section and the browser's back button means what it says.
 * `documents` is the index (`/knowledge-bases/:id`), the rest hang off it.
 */
export const TAB_PATHS: Record<TabId, string> = {
  documents: '',
  wiki_spaces: 'wiki-spaces',
  data_scope: 'data-scope',
  faqs: 'faqs',
  chunks: 'chunks',
  search: 'search',
  settings: 'settings',
};

/** Pathname → tab. `/knowledge-bases/:id` with no section is the documents list. */
export function tabFromPathname(pathname: string): TabId {
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  const match = TAB_ORDER.find(
    (tab) => TAB_PATHS[tab] !== '' && TAB_PATHS[tab] === last,
  );
  return match ?? 'documents';
}

export interface KbSearchSnapshot {
  query: string;
  searchType: string;
  topK: number;
  forceDense: boolean;
  orderedIds: string[];
  scores: Record<string, number>;
}

export interface KbSearchRetrievalDiff {
  added: string[];
  removed: string[];
  moved: { id: string; from: number; to: number }[];
}

