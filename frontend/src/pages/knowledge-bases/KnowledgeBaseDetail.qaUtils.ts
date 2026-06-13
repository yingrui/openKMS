import type { AgentMessageItem } from '../../data/agentApi';
import { KB_QA_SOURCES_V1, type SearchResult } from '../../data/knowledgeBasesApi';
import { assistantHistoryStreamParts } from '../../components/wiki/wikiCopilotStreamParts';
import type { ChatMessage } from './KnowledgeBaseDetail.types';

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

function kbQaLineId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `line_${Date.now()}`;
}

function kbQaFeedbackKey(msg: ChatMessage, index: number): string {
  return msg.replyKey ?? msg.id ?? `idx-${index}`;
}

function kbQaNormalizeSourceKind(sourceType: string | null | undefined): string {
  const k = (sourceType || 'chunk').toLowerCase();
  if (k === 'ontology' || k === 'document_section' || k === 'faq' || k === 'chunk') return k;
  return 'chunk';
}

function kbQaSourceCardModifierClass(sourceType: string | null | undefined): string {
  const k = kbQaNormalizeSourceKind(sourceType);
  if (k === 'ontology') return 'kb-qa-source-card--ontology';
  if (k === 'document_section') return 'kb-qa-source-card--section';
  if (k === 'faq') return 'kb-qa-source-card--faq';
  return 'kb-qa-source-card--chunk';
}

function kbQaTruncatePreview(text: string, maxLen: number): string {
  const n = text.replace(/\s+/g, ' ').trim();
  if (!n) return '';
  if (n.length <= maxLen) return n;
  return `${n.slice(0, Math.max(0, maxLen - 1))}…`;
}

function kbQaShowRetrievalScore(sourceType: string | null | undefined, score: number): boolean {
  const k = kbQaNormalizeSourceKind(sourceType);
  if (k === 'ontology' || k === 'document_section') return false;
  return score < 0.999;
}

function kbQaSourceChipModifierClass(sourceType: string | null | undefined): string {
  const k = kbQaNormalizeSourceKind(sourceType);
  if (k === 'ontology') return 'kb-qa-source-chip--ontology';
  if (k === 'document_section') return 'kb-qa-source-chip--section';
  if (k === 'faq') return 'kb-qa-source-chip--faq';
  return 'kb-qa-source-chip--chunk';
}

function kbQaChipTitle(s: SearchResult, maxLen = 26): string {
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

function kbQaExpandedDetailPreviewMaxLen(sourceType: string | null | undefined): number {
  const k = kbQaNormalizeSourceKind(sourceType);
  if (k === 'ontology') return 12_000;
  if (k === 'document_section') return 4_000;
  return 1_200;
}

export {
  kbAgentItemsToChatMessages,
  kbQaLineId,
  kbQaFeedbackKey,
  kbQaNormalizeSourceKind,
  kbQaSourceCardModifierClass,
  kbQaTruncatePreview,
  kbQaShowRetrievalScore,
  kbQaSourceChipModifierClass,
  kbQaChipTitle,
  kbQaExpandedDetailPreviewMaxLen,
};
