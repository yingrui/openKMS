import { useTranslation } from 'react-i18next';
import './RetrievalProvenancePanel.scss';

/**
 * How to read one result's retrieval trace — printed once, above the results.
 *
 * Each result carries the same three stages, so the sentences that explain them belong here rather than repeated under
 * ten hits. Collapsed by default: a reader who wants the numbers should not have to scroll past a lecture to see them.
 */
export function RetrievalLegend() {
  const { t } = useTranslation('knowledgeBase');

  return (
    <details className="retrieval-legend">
      <summary>{t('detail.retrieval.glossaryTitle')}</summary>
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
  );
}
