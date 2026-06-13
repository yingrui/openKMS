import { FileStack, BookOpen, HelpCircle, Layers, Search as SearchIcon, Settings } from 'lucide-react';
import type { SearchResult } from '../../data/knowledgeBasesApi';
import type { AssistantStreamPart } from '../../components/wiki/wikiCopilotStreamParts';

export type TabId = 'documents' | 'wiki_spaces' | 'faqs' | 'chunks' | 'search' | 'settings';
export type SettingsSubTabId = 'general' | 'sharing';

export const TAB_ORDER: TabId[] = ['documents', 'wiki_spaces', 'faqs', 'chunks', 'search', 'settings'];

export const TAB_ICONS: Record<TabId, typeof FileStack> = {
  documents: FileStack,
  wiki_spaces: BookOpen,
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
}

export type KbQaFeedbackVote = 'up' | 'down';
