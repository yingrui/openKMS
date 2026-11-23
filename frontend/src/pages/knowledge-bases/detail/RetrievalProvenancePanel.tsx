import { useTranslation } from 'react-i18next';
import type { SearchResult } from '../../../data/knowledgeBasesApi';
import { kbHasRetrievalProvenance } from '../../workforce/chat/chatUtils';
import './RetrievalProvenancePanel.scss';

interface KbRetrievalProvenanceProps {
  s: SearchResult;
  /** Final position in the result list (1 = first), when the caller knows it. */
  rank?: number;
  /**
   * One line instead of the table: the mode and where the hit ranked in each recall.
   *
   * A conversation needs to say *why this passage is here*; eight rows of scores under every passage pushed the answer
   * off the screen. Ranks survive the compact form because they explain the order; scores are the search screen's job.
   */
  compact?: boolean;
}

/**
 * How one result travelled through retrieval: where each recall put it, how the two were fused, what reranking made of
 * it.
 *
 * The rows are grouped by stage and each group says what its numbers are, because the same list used to read
 * "Dense similarity 0.51 / Keyword score 0.74 / Fusion (RRF) 0.03 / Reranker 1" — four unrelated scales in four
 * unlabelled lines. The glossary explains the pipeline once instead of in every row.
 *
 * It belongs to the corpus's **search** screen, where the point is judging retrieval: a conversation shows sources for
 * citation, so it renders the compact form.
 */
export function RetrievalProvenancePanel({ s, rank, compact = false }: KbRetrievalProvenanceProps) {
  const { t } = useTranslation('knowledgeBase');
  if (!kbHasRetrievalProvenance(s)) return null;

  const dbg = s.retrieval_debug;
  const asNumber = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  /** Similarities and relevance: three decimals. The fourth never decides which passage is more relevant. */
  const num = (v: unknown): string | null => {
    const n = asNumber(v);
    return n === null ? null : String(Math.round(n * 1000) / 1000);
  };
  /** The fusion score lives around 0.03, where the digits that differ are the fourth and fifth. */
  const numPrecise = (v: unknown): string | null => (asNumber(v) === null ? null : String(asNumber(v)));
  /* Ranks are stored 0-based; a reader counts from one. */
  const asRank = (v: unknown): string | null => {
    const n = asNumber(v);
    return n === null ? null : String(n + 1);
  };

  const modeLabel = s.retrieval_mode
    ? t(`detail.retrieval.mode.${s.retrieval_mode}`, { defaultValue: s.retrieval_mode })
    : null;
  const shortMode = s.retrieval_mode
    ? t(`detail.retrieval.modeShort.${s.retrieval_mode}`, { defaultValue: modeLabel ?? s.retrieval_mode })
    : null;
  const denseRank = asRank(dbg?.dense_rank);
  const keywordRank = asRank(dbg?.bm25_rank);

  if (compact) {
    const parts = [shortMode];
    if (denseRank !== null) parts.push(t('detail.retrieval.compactDense', { rank: denseRank }));
    if (keywordRank !== null) parts.push(t('detail.retrieval.compactKeyword', { rank: keywordRank }));
    const line = parts.filter(Boolean).join(' · ');
    if (!line) return null;
    return <p className="retrieval-trace retrieval-trace--compact">{line}</p>;
  }

  /**
   * One line per stage, numbers inline: `dense #2 (0.55) · keyword #5 (1.21)`.
   *
   * Eight rows of label/value made the trace taller than the passage it describes, which left the content column half
   * empty beside it. The labels are what the "?" explains; the numbers are what this panel is for.
   */
  const lines: { key: string; value: string }[] = [];

  const recallParts: string[] = [];
  if (denseRank !== null) {
    const sim = num(dbg?.dense_similarity);
    recallParts.push(`dense #${denseRank}${sim !== null ? ` (${sim})` : ''}`);
  }
  if (keywordRank !== null) {
    const score = num(dbg?.bm25_score);
    recallParts.push(`keyword #${keywordRank}${score !== null ? ` (${score})` : ''}`);
  }
  if (recallParts.length) lines.push({ key: 'recall', value: recallParts.join(' · ') });

  const rrf = numPrecise(dbg?.rrf_score);
  if (rrf !== null) lines.push({ key: 'fusion', value: rrf });

  const rerankScore = num(dbg?.rerank_score);
  if (rerankScore !== null) lines.push({ key: 'rerank', value: rerankScore });

  const facts: { label: string; value: string }[] = [];
  if (rank !== undefined) facts.push({ label: t('detail.retrieval.finalRank'), value: `#${rank}` });
  if (modeLabel) facts.push({ label: t('detail.retrieval.modeLabel'), value: modeLabel });
  if (s.chunk_index != null) {
    facts.push({ label: t('detail.retrieval.chunkIndex'), value: String(s.chunk_index) });
  }

  if (!lines.length && !facts.length) return null;

  return (
    <div className="retrieval-trace">
      <div className="retrieval-trace__head">
        <span className="ds-eyebrow">{t('detail.retrieval.panelTitle')}</span>
        <details className="retrieval-trace__help">
          <summary aria-label={t('detail.retrieval.glossaryTitle')} title={t('detail.retrieval.glossaryTitle')}>
            ?
          </summary>
          <dl>
            <dt>{t('detail.retrieval.stage_recall')}</dt>
            <dd>{t('detail.retrieval.recallNote')}</dd>
            <dt>{t('detail.retrieval.stage_fusion')}</dt>
            <dd>{t('detail.retrieval.fusionNote')}</dd>
            <dt>{t('detail.retrieval.stage_rerank')}</dt>
            <dd>{t('detail.retrieval.rerankNote')}</dd>
            <dt>{t('detail.retrieval.chunkIndex')}</dt>
            <dd>{t('detail.retrieval.glossaryChunk')}</dd>
          </dl>
        </details>
      </div>

      {facts.length ? (
        <div className="retrieval-trace__facts">
          {facts.map((fact) => (
            <span key={fact.label}>
              {fact.label} <b>{fact.value}</b>
            </span>
          ))}
        </div>
      ) : null}

      <dl className="retrieval-trace__dl">
        {lines.map((line) => (
          <div key={line.key} className="retrieval-trace__row">
            <dt>{t(`detail.retrieval.stage_${line.key}`)}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
