import type { GroundingReport, SearchResult } from '../../../data/knowledgeBasesApi';
import type { AssistantStreamPart } from '../../../components/wiki/wikiCopilotStreamParts';

/**
 * One line of the conversation, as the chat renders it.
 *
 * It lives with the chat because that is where it is read: a turn in flight carries `streamParts`, and a
 * stored turn carries what the agent said about its own evidence (`grounding` / `warnings`).
 */
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  streamParts?: AssistantStreamPart[];
  replyKey?: string;
  grounding?: GroundingReport | null;
  warnings?: string[];
  verified?: boolean;
}

export type KbQaFeedbackVote = 'up' | 'down';
