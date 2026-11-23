/**
 * The Q&A surface: the conversation with an agent, and the pieces it is built from.
 *
 * It lives here — under Workforce — because that is what it is: asking a workforce agent, with the
 * knowledge source it answers from chosen underneath. The knowledge base no longer owns a chat; it owns
 * the corpus, the retrieval settings, and the thread store the conversation reads.
 *
 * The screen itself is still mounted by the knowledge-base route while the page is split out; every piece
 * below already belongs to this package, so the remaining move is the page and its styles, not the parts.
 */
export { ChatEvidenceCard } from './ChatDataEvidence';
export { ChatFilesPanel } from './ChatFilesPanel';
export { ChatFilesRail } from './ChatFilesRail';
export { ChatSessionSidebar } from './ChatSessionSidebar';
export {
  ChatSourcesDrawer,
  ChatSourcesPill,
  type ChatSourcesPanelPayload,
} from './ChatSourcesDrawer';
export { playgroundHrefFromDataQuery } from './chatPlaygroundHref';
export * from './chatUtils';
export type { ChatMessage, ChatFeedbackVote } from './types';
