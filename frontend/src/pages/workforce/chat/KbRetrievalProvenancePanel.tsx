import type { SearchResult } from '../../data/knowledgeBasesApi';
import { kbHasRetrievalProvenance } from './KnowledgeBaseDetail.searchUtils';

interface KbRetrievalProvenanceProps {
  s: SearchResult;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function KbRetrievalProvenancePanel({ s, t }: KbRetrievalProvenanceProps) {
  if (!kbHasRetrievalProvenance(s)) return null;
  const dbg = s.retrieval_debug;
  const num = (v: unknown): string | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return v;
    return null;
  };
  const stages = dbg?.pipeline_stages;
  const stageLine =
    Array.isArray(stages) && stages.length
      ? (stages as unknown[])
          .map((x) => (typeof x === 'string' ? t(`detail.retrieval.stage.${x}`, { defaultValue: String(x) }) : ''))
          .filter(Boolean)
          .join(' → ')
      : null;
  const modeLabel = s.retrieval_mode
    ? t(`detail.retrieval.mode.${s.retrieval_mode}`, { defaultValue: s.retrieval_mode })
    : null;
  const rows: { label: string; value: string }[] = [];
  if (s.chunk_index != null && s.chunk_index !== undefined) {
    rows.push({ label: t('detail.retrieval.chunkIndex'), value: String(s.chunk_index) });
  }
  if (modeLabel) rows.push({ label: t('detail.retrieval.modeLabel'), value: modeLabel });
  if (stageLine) rows.push({ label: t('detail.retrieval.pipelineLabel'), value: stageLine });
  const dr = dbg?.dense_rank;
  if (dr != null && num(dr) != null) rows.push({ label: t('detail.retrieval.denseRank'), value: num(dr)! });
  const ds = dbg?.dense_similarity;
  if (ds != null && num(ds) != null) rows.push({ label: t('detail.retrieval.denseSimilarity'), value: num(ds)! });
  const br = dbg?.bm25_rank;
  if (br != null && num(br) != null) rows.push({ label: t('detail.retrieval.bm25Rank'), value: num(br)! });
  const bs = dbg?.bm25_score;
  if (bs != null && num(bs) != null) rows.push({ label: t('detail.retrieval.bm25Score'), value: num(bs)! });
  const rf = dbg?.rrf_score;
  if (rf != null && num(rf) != null) rows.push({ label: t('detail.retrieval.rrfScore'), value: num(rf)! });
  const rr = dbg?.rerank_score;
  if (rr != null && num(rr) != null) rows.push({ label: t('detail.retrieval.rerankScore'), value: num(rr)! });
  if (!rows.length && !stageLine && !modeLabel) return null;
  return (
    <div className="kb-retrieval-panel">
      <div className="kb-retrieval-panel__title">{t('detail.retrieval.panelTitle')}</div>
      <dl className="kb-retrieval-panel__dl">
        {rows.map((row) => (
          <div key={row.label} className="kb-retrieval-panel__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
