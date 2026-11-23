import type { AgentMessageItem } from '../../../data/agentApi';
import { KB_QA_SOURCES_V1, type SearchResult } from '../../../data/knowledgeBasesApi';
import { assistantHistoryStreamParts } from '../../../components/wiki/wikiCopilotStreamParts';
import type { ChatFeedbackVote, ChatMessage } from './types';

/** The votes already cast in this thread, keyed the way the thumbs look them up (`replyKey`/`id`). */
function kbAgentFeedbackFromItems(items: AgentMessageItem[]): Record<string, ChatFeedbackVote> {
  const out: Record<string, ChatFeedbackVote> = {};
  for (const m of items) {
    if (m.feedback === 'up' || m.feedback === 'down') out[m.id] = m.feedback;
  }
  return out;
}

function kbAgentItemsToChatMessages(items: AgentMessageItem[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of items) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (m.role === 'user') {
      out.push({ id: m.id, role: 'user', content: m.content });
      continue;
    }
    const tc = m.tool_calls as Record<string, unknown> | undefined;
    const rawSources = tc?.[KB_QA_SOURCES_V1];
    const sources = Array.isArray(rawSources) ? (rawSources as SearchResult[]) : undefined;
    out.push({
      id: m.id,
      role: 'assistant',
      content: m.content,
      sources,
      streamParts: assistantHistoryStreamParts(m.content, m.tool_calls),
      replyKey: m.id,
    });
  }
  return out;
}

function chatLineId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `line_${Date.now()}`;
}

function chatFeedbackKey(msg: ChatMessage, index: number): string {
  return msg.replyKey ?? msg.id ?? `idx-${index}`;
}

function chatSourceKind(sourceType: string | null | undefined): string {
  const k = (sourceType || 'chunk').toLowerCase();
  if (
    k === 'ontology' ||
    k === 'web' ||
    k === 'document_section' ||
    k === 'faq' ||
    k === 'chunk' ||
    k === 'metric' ||
    k === 'semantic_model'
  ) {
    return k;
  }
  return 'chunk';
}

function isDataEvidenceSource(s: SearchResult): boolean {
  const k = chatSourceKind(s.source_type);
  return k === 'metric' || k === 'semantic_model';
}

function splitQaSources(sources: SearchResult[]): {
  evidence: SearchResult[];
  references: SearchResult[];
} {
  const evidence: SearchResult[] = [];
  const references: SearchResult[] = [];
  for (const s of sources) {
    if (isDataEvidenceSource(s)) evidence.push(s);
    else references.push(s);
  }
  return { evidence, references };
}

function chatSourceCardModifierClass(sourceType: string | null | undefined): string {
  const k = chatSourceKind(sourceType);
  if (k === 'ontology') return 'agent-chat-source-card--ontology';
  if (k === 'web') return 'agent-chat-source-card--web';
  if (k === 'document_section') return 'agent-chat-source-card--section';
  if (k === 'faq') return 'agent-chat-source-card--faq';
  if (k === 'metric' || k === 'semantic_model') return 'agent-chat-source-card--metric';
  return 'agent-chat-source-card--chunk';
}

function chatTruncatePreview(text: string, maxLen: number): string {
  const n = text.replace(/\s+/g, ' ').trim();
  if (!n) return '';
  if (n.length <= maxLen) return n;
  return `${n.slice(0, Math.max(0, maxLen - 1))}…`;
}

function chatSourceChipModifierClass(sourceType: string | null | undefined): string {
  const k = chatSourceKind(sourceType);
  if (k === 'ontology') return 'agent-chat-source-chip--ontology';
  if (k === 'document_section') return 'agent-chat-source-chip--section';
  if (k === 'faq') return 'agent-chat-source-chip--faq';
  if (k === 'metric' || k === 'semantic_model') return 'agent-chat-source-chip--metric';
  return 'agent-chat-source-chip--chunk';
}

function chipTitle(s: SearchResult, maxLen = 26): string {
  const raw =
    (s.source_name && s.source_name.trim()) ||
    (s.wiki_page_id ? String(s.wiki_page_id) : '') ||
    (s.document_id ? String(s.document_id) : '') ||
    (s.id ? String(s.id) : '');
  const x = raw.replace(/\s+/g, ' ').trim();
  if (!x) return '…';
  if (x.length <= maxLen) return x;
  return `${x.slice(0, Math.max(0, maxLen - 1))}…`;
}

function chatExpandedPreviewMaxLen(sourceType: string | null | undefined): number {
  const k = chatSourceKind(sourceType);
  if (k === 'ontology' || k === 'metric' || k === 'semantic_model') return 12_000;
  if (k === 'document_section') return 4_000;
  return 1_200;
}

export {
  kbAgentItemsToChatMessages,
  chatLineId,
  chatFeedbackKey,
  kbAgentFeedbackFromItems,
  chatSourceKind,
  isDataEvidenceSource,
  splitQaSources,
  chatSourceCardModifierClass,
  chatTruncatePreview,
  chatSourceChipModifierClass,
  chipTitle,
  chatExpandedPreviewMaxLen,
};

/** Does this source carry the retrieval trace the Q&A panel reads? */
export function kbHasRetrievalProvenance(s: SearchResult): boolean {
  if (s.chunk_index != null && s.chunk_index !== undefined) return true;
  if (s.retrieval_mode) return true;
  const d = s.retrieval_debug;
  if (d && typeof d === 'object' && Object.keys(d).length > 0) return true;
  return false;
}
