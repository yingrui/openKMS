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
export { KbQaEvidenceCard } from './KbQaDataEvidence';
export { KbQaFilesPanel } from './KbQaFilesPanel';
export { KbQaFilesRail } from './KbQaFilesRail';
export { KbQaSessionSidebar } from './KbQaSessionSidebar';
export {
  KbQaSourcesDrawer,
  KbQaSourcesPill,
  type KbQaSourcesPanelPayload,
} from './KbQaSourcesDrawer';
export { KbRetrievalProvenancePanel } from './KbRetrievalProvenancePanel';
export { playgroundHrefFromDataQuery } from './kbQaPlaygroundHref';
export * from './qaUtils';
export type { ChatMessage, KbQaFeedbackVote } from './types';
