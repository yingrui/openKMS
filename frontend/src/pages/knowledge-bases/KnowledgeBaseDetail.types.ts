import { FileStack, BookOpen, Database, HelpCircle, Layers, Search as SearchIcon, Settings } from 'lucide-react';
import type { GroundingReport, SearchResult } from '../../data/knowledgeBasesApi';
import type { AssistantStreamPart } from '../../components/wiki/wikiCopilotStreamParts';

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

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  streamParts?: AssistantStreamPart[];
  replyKey?: string;
  /** What the agent said about its own evidence: traceable/total, and any unsourced-number warning the KB asked for. */
  grounding?: GroundingReport | null;
  warnings?: string[];
  verified?: boolean;
}

export type KbQaFeedbackVote = 'up' | 'down';
