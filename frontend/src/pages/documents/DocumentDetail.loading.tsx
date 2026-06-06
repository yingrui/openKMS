import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function Sk({ className }: { className?: string }) {
  return <div className={['document-detail-sk', className].filter(Boolean).join(' ')} aria-hidden />;
}

export function DocumentDetailLoading() {
  const { t } = useTranslation('documents');

  return (
    <div className="document-detail-loading-skeleton" aria-busy="true" aria-live="polite">
      <section className="document-detail-info document-detail-loading-info">
        <div className="document-detail-loading-info-head">
          <Sk className="document-detail-sk--icon" />
          <Sk className="document-detail-sk--title" />
        </div>
        <Sk className="document-detail-sk--name" />
        <div className="document-detail-info-stats-grid">
          {[0, 1].map((col) => (
            <div key={col} className="document-detail-info-stats-col">
              {[0, 1, 2].map((row) => (
                <div key={row} className="document-detail-loading-stat">
                  <Sk className="document-detail-sk--label" />
                  <Sk className="document-detail-sk--value" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="document-detail-split document-detail-loading-split">
        <div className="document-detail-panel">
          <div className="document-detail-panel-header document-detail-loading-panel-head">
            <Sk className="document-detail-sk--tab" />
          </div>
          <div className="document-detail-loading-preview">
            <Sk className="document-detail-sk--page" />
          </div>
        </div>
        <div className="document-detail-panel">
          <div className="document-detail-panel-header document-detail-loading-panel-head">
            <Sk className="document-detail-sk--tab document-detail-sk--tab-short" />
            <Sk className="document-detail-sk--tab document-detail-sk--tab-short" />
          </div>
          <div className="document-detail-loading-markdown">
            {Array.from({ length: 8 }, (_, i) => (
              <Sk
                key={i}
                className={`document-detail-sk--line${i === 7 ? ' document-detail-sk--line-short' : ''}`}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="document-detail-loading-status">
        <Loader2 size={18} className="document-detail-loading-spinner" aria-hidden />
        <span>{t('detail.loadingDocument')}</span>
      </p>
    </div>
  );
}
