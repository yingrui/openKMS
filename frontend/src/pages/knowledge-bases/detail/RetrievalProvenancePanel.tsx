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
  const num = (v: unknown): string | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return v;
    return null;
  };
  /* Ranks are stored 0-based; a reader counts from one. */
  const asRank = (v: unknown): string | null => {
    const n = num(v);
    return n === null ? null : String(Number(n) + 1);
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

  /** One stage of the pipeline and the numbers it produced. The words that explain them are printed once, above the list. */
  const groups: { key: string; values: { label: string; value: string }[] }[] = [];

  const recallValues: { label: string; value: string }[] = [];
  if (denseRank !== null) recallValues.push({ label: t('detail.retrieval.denseRank'), value: `#${denseRank}` });
  const denseSimilarity = num(dbg?.dense_similarity);
  if (denseSimilarity !== null) {
    recallValues.push({ label: t('detail.retrieval.denseSimilarity'), value: denseSimilarity });
  }
  if (keywordRank !== null) recallValues.push({ label: t('detail.retrieval.bm25Rank'), value: `#${keywordRank}` });
  const keywordScore = num(dbg?.bm25_score);
  if (keywordScore !== null) {
    recallValues.push({ label: t('detail.retrieval.bm25Score'), value: keywordScore });
  }
  if (recallValues.length) {
    groups.push({ key: 'recall', values: recallValues });
  }

  const fusionValues: { label: string; value: string }[] = [];
  const rrf = num(dbg?.rrf_score);
  if (rrf !== null) fusionValues.push({ label: t('detail.retrieval.rrfScore'), value: rrf });
  if (fusionValues.length) {
    groups.push({ key: 'fusion', values: fusionValues });
  }

  const rerankValues: { label: string; value: string }[] = [];
  const rerankScore = num(dbg?.rerank_score);
  if (rerankScore !== null) {
    rerankValues.push({ label: t('detail.retrieval.rerankScore'), value: rerankScore });
  }
  if (rerankValues.length) {
    groups.push({ key: 'rerank', values: rerankValues });
  }

  const facts: { label: string; value: string }[] = [];
  if (rank !== undefined) facts.push({ label: t('detail.retrieval.finalRank'), value: `#${rank}` });
  if (modeLabel) facts.push({ label: t('detail.retrieval.modeLabel'), value: modeLabel });
  if (s.chunk_index != null) {
    facts.push({ label: t('detail.retrieval.chunkIndex'), value: String(s.chunk_index) });
  }

  if (!groups.length && !facts.length) return null;

  return (
    <div className="retrieval-trace">
      <div className="ds-eyebrow">{t('detail.retrieval.panelTitle')}</div>

      {facts.length ? (
        <div className="retrieval-trace__facts">
          {facts.map((fact) => (
            <span key={fact.label}>
              {fact.label} <b>{fact.value}</b>
            </span>
          ))}
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.key} className="retrieval-trace__group">
          <div className="retrieval-trace__stage">{t(`detail.retrieval.stage_${group.key}`)}</div>
          <dl className="retrieval-trace__dl">
            {group.values.map((row) => (
              <div key={row.label} className="retrieval-trace__row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
