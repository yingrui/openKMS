import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { SearchResult } from '../../data/knowledgeBasesApi';
import { KbQaEvidenceCard } from './KbQaDataEvidence';
import { KbRetrievalProvenancePanel } from './KbRetrievalProvenancePanel';
import {
  kbQaExpandedDetailPreviewMaxLen,
  kbQaNormalizeSourceKind,
  kbQaShowRetrievalScore,
  kbQaSourceCardModifierClass,
  kbQaTruncatePreview,
} from './KnowledgeBaseDetail.qaUtils';

export type KbQaSourcesPanelPayload = {
  replyKey: string;
  evidence: SearchResult[];
  references: SearchResult[];
};

function ReferenceCard({
  s,
  index,
  t,
}: {
  s: SearchResult;
  index: number;
  t: TFunction;
}) {
  const kind = kbQaNormalizeSourceKind(s.source_type);
  const mod = kbQaSourceCardModifierClass(s.source_type);
  const kindLabel = t(`detail.qaSourceKind.${kind}`, {
    defaultValue: s.source_type || kind,
  });
  const detailPreview = kbQaTruncatePreview(
    s.content || '',
    kbQaExpandedDetailPreviewMaxLen(s.source_type)
  );
  const showScore = kbQaShowRetrievalScore(s.source_type, s.score);
  return (
    <div className={`kb-qa-source-card kb-qa-source-card--static kb-qa-sources-drawer__ref ${mod}`}>
      <span className="kb-qa-sources-drawer__index" aria-hidden>
        {index}
      </span>
      <div className="kb-qa-source-card__head">
        <span className="kb-qa-source-card__kind">{kindLabel}</span>
        {s.usage ? (
          /* Whether the answer drew on this source, or the query merely ran. Every source is kept either way. */
          <span
            className={`kb-qa-source-card__usage kb-qa-source-card__usage--${s.usage}`}
            title={t(`detail.qaSourceUsage.${s.usage}Hint`)}
          >
            {t(`detail.qaSourceUsage.${s.usage}`)}
            {s.usage === 'used' && s.traceable_numbers ? ` · ${s.traceable_numbers}` : ''}
          </span>
        ) : null}
        {showScore ? (
          <span className="kb-qa-source-card__score">
            {t('detail.qaSourceScore', { pct: (s.score * 100).toFixed(0) })}
          </span>
        ) : null}
      </div>
      <div className="kb-qa-source-card__title">
        {s.wiki_page_id && s.wiki_space_id ? (
          <Link className="kb-qa-source-card__link" to={`/wikis/${s.wiki_space_id}/pages/${s.wiki_page_id}`}>
            {s.source_name || s.wiki_page_id}
          </Link>
        ) : s.document_id ? (
          <Link className="kb-qa-source-card__link" to={`/documents/view/${s.document_id}`}>
            {s.source_name || s.document_id}
          </Link>
        ) : (
          <span className="kb-qa-source-card__title-text">
            {s.source_name || t('detail.faqSourceFallback')}
          </span>
        )}
      </div>
      {detailPreview ? <p className="kb-qa-source-card__preview">{detailPreview}</p> : null}
      <KbRetrievalProvenancePanel s={s} t={t} />
    </div>
  );
}

export function KbQaSourcesDrawer({
  panel,
  onClose,
  t,
}: {
  panel: KbQaSourcesPanelPayload | null;
  onClose: () => void;
  t: TFunction;
}) {
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, onClose]);

  if (!panel) return null;
  const { evidence, references } = panel;
  const total = evidence.length + references.length;

  return (
    <aside
      id="kb-qa-sources-drawer"
      className="kb-qa-sources-drawer"
      role="complementary"
      aria-label={t('detail.qaSourcesDrawerAria')}
    >
      <header className="kb-qa-sources-drawer__head">
        <div className="kb-qa-sources-drawer__title">
          <h2>{t('detail.qaSourcesDrawerTitle')}</h2>
          <span className="kb-qa-sources-drawer__count">
            {t('detail.qaSourcesDrawerCount', { count: total })}
          </span>
        </div>
        <button
          type="button"
          className="kb-qa-sources-drawer__close"
          onClick={onClose}
          aria-label={t('detail.qaSourcesDrawerClose')}
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="kb-qa-sources-drawer__body">
        {evidence.length > 0 ? (
          <section className="kb-qa-sources-drawer__section" aria-label={t('detail.qaDataEvidenceAria')}>
            <h3 className="kb-qa-sources-drawer__section-title">{t('detail.qaDataEvidenceHeading')}</h3>
            <div className="kb-qa-sources-drawer__cards">
              {evidence.map((s, i) => (
                <KbQaEvidenceCard key={`ev-${s.id}-${i}`} s={s} t={t} />
              ))}
            </div>
          </section>
        ) : null}
        {references.length > 0 ? (
          <section className="kb-qa-sources-drawer__section" aria-label={t('detail.qaSourcesAria')}>
            <h3 className="kb-qa-sources-drawer__section-title">{t('detail.qaSourcesHeading')}</h3>
            <div className="kb-qa-sources-drawer__cards">
              {references.map((s, i) => (
                <ReferenceCard key={`ref-${s.id}-${i}`} s={s} index={i + 1} t={t} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

export function KbQaSourcesPill({
  evidenceCount,
  referenceCount,
  open,
  onClick,
  t,
}: {
  evidenceCount: number;
  referenceCount: number;
  open: boolean;
  onClick: () => void;
  t: TFunction;
}) {
  const total = evidenceCount + referenceCount;
  if (total === 0) return null;
  let summary: string;
  if (evidenceCount > 0 && referenceCount > 0) {
    summary = t('detail.qaSourcesPillMixed', {
      evidence: evidenceCount,
      references: referenceCount,
    });
  } else if (evidenceCount > 0) {
    summary = t('detail.qaSourcesPillEvidence', { count: evidenceCount });
  } else {
    summary = t('detail.qaSourcesPillReferences', { count: referenceCount });
  }
  return (
    <button
      type="button"
      className={`kb-qa-sources-pill${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-controls="kb-qa-sources-drawer"
      onClick={onClick}
    >
      <span className="kb-qa-sources-pill__label">{t('detail.qaSourcesPillLabel')}</span>
      <span className="kb-qa-sources-pill__summary">{summary}</span>
    </button>
  );
}
