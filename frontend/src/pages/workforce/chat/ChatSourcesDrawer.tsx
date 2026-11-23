import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { SearchResult } from '../../../data/knowledgeBasesApi';
import { ChatEvidenceCard } from './ChatDataEvidence';
import { ChatRetrievalProvenancePanel } from './ChatRetrievalProvenancePanel';
import {
  chatExpandedPreviewMaxLen,
  chatSourceKind,
  chatShowRetrievalScore,
  chatSourceCardModifierClass,
  chatTruncatePreview,
} from './chatUtils';

export type ChatSourcesPanelPayload = {
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
  const kind = chatSourceKind(s.source_type);
  const mod = chatSourceCardModifierClass(s.source_type);
  const kindLabel = t(`chat.sourceKind.${kind}`, {
    defaultValue: s.source_type || kind,
  });
  const detailPreview = chatTruncatePreview(
    s.content || '',
    chatExpandedPreviewMaxLen(s.source_type)
  );
  const showScore = chatShowRetrievalScore(s.source_type, s.score);
  return (
    <div className={`agent-chat-source-card agent-chat-source-card--static agent-chat-sources-drawer__ref ${mod}`}>
      <span className="agent-chat-sources-drawer__index" aria-hidden>
        {index}
      </span>
      <div className="agent-chat-source-card__head">
        <span className="agent-chat-source-card__kind">{kindLabel}</span>
        {s.usage ? (
          /* Whether the answer drew on this source, or the query merely ran. Every source is kept either way. */
          <span
            className={`agent-chat-source-card__usage agent-chat-source-card__usage--${s.usage}`}
            title={t(`chat.sourceUsage.${s.usage}Hint`)}
          >
            {t(`chat.sourceUsage.${s.usage}`)}
            {s.usage === 'used' && s.traceable_numbers ? ` · ${s.traceable_numbers}` : ''}
          </span>
        ) : null}
        {showScore ? (
          <span className="agent-chat-source-card__score">
            {t('chat.sourceScore', { pct: (s.score * 100).toFixed(0) })}
          </span>
        ) : null}
      </div>
      <div className="agent-chat-source-card__title">
        {s.url ? (
          /* External citation: the link is the evidence, so it opens in a new tab and does not navigate the app. */
          <a
            className="agent-chat-source-card__link"
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {s.source_name || s.url}
          </a>
        ) : s.wiki_page_id && s.wiki_space_id ? (
          <Link className="agent-chat-source-card__link" to={`/wikis/${s.wiki_space_id}/pages/${s.wiki_page_id}`}>
            {s.source_name || s.wiki_page_id}
          </Link>
        ) : s.document_id ? (
          <Link className="agent-chat-source-card__link" to={`/documents/view/${s.document_id}`}>
            {s.source_name || s.document_id}
          </Link>
        ) : (
          <span className="agent-chat-source-card__title-text">
            {s.source_name || t('detail.faqSourceFallback')}
          </span>
        )}
      </div>
      {detailPreview ? <p className="agent-chat-source-card__preview">{detailPreview}</p> : null}
      <ChatRetrievalProvenancePanel s={s} />
    </div>
  );
}

export function ChatSourcesDrawer({
  panel,
  onClose,
  t,
}: {
  panel: ChatSourcesPanelPayload | null;
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
      id="agent-chat-sources-drawer"
      className="agent-chat-sources-drawer"
      role="complementary"
      aria-label={t('chat.sourcesDrawerAria')}
    >
      <header className="agent-chat-sources-drawer__head">
        <div className="agent-chat-sources-drawer__title">
          <h2>{t('chat.sourcesDrawerTitle')}</h2>
          <span className="agent-chat-sources-drawer__count">
            {t('chat.sourcesDrawerCount', { count: total })}
          </span>
        </div>
        <button
          type="button"
          className="agent-chat-sources-drawer__close"
          onClick={onClose}
          aria-label={t('chat.sourcesDrawerClose')}
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="agent-chat-sources-drawer__body">
        {evidence.length > 0 ? (
          <section className="agent-chat-sources-drawer__section" aria-label={t('chat.dataEvidenceAria')}>
            <h3 className="agent-chat-sources-drawer__section-title">{t('chat.dataEvidenceHeading')}</h3>
            <div className="agent-chat-sources-drawer__cards">
              {evidence.map((s, i) => (
                <ChatEvidenceCard key={`ev-${s.id}-${i}`} s={s} t={t} />
              ))}
            </div>
          </section>
        ) : null}
        {references.length > 0 ? (
          <section className="agent-chat-sources-drawer__section" aria-label={t('chat.sourcesAria')}>
            <h3 className="agent-chat-sources-drawer__section-title">{t('chat.sourcesHeading')}</h3>
            <div className="agent-chat-sources-drawer__cards">
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

export function ChatSourcesPill({
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
    summary = t('chat.sourcesPillMixed', {
      evidence: evidenceCount,
      references: referenceCount,
    });
  } else if (evidenceCount > 0) {
    summary = t('chat.sourcesPillEvidence', { count: evidenceCount });
  } else {
    summary = t('chat.sourcesPillReferences', { count: referenceCount });
  }
  return (
    <button
      type="button"
      className={`agent-chat-sources-pill${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-controls="agent-chat-sources-drawer"
      onClick={onClick}
    >
      <span className="agent-chat-sources-pill__label">{t('chat.sourcesPillLabel')}</span>
      <span className="agent-chat-sources-pill__summary">{summary}</span>
    </button>
  );
}
