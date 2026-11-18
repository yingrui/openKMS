import { FileStack, BookOpen, Database, HelpCircle, Layers, Search as SearchIcon, Settings } from 'lucide-react';

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

export const TAB_ICONS: Record<TabId, typeof FileStack> = {
  documents: FileStack,
  wiki_spaces: BookOpen,
  data_scope: Database,
  faqs: HelpCircle,
  chunks: Layers,
  search: SearchIcon,
  settings: Settings,
};

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

