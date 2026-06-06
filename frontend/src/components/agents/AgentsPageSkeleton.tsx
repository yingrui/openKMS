import { useTranslation } from 'react-i18next';
import './AgentsPageSkeleton.scss';

function Sk({ className }: { className?: string }) {
  return <div className={['agents-sk', className].filter(Boolean).join(' ')} aria-hidden />;
}

function LoadingLabel() {
  const { t } = useTranslation('agents');
  return <span className="sr-only">{t('loading')}</span>;
}

export function AgentsWorkspaceSkeleton() {
  return (
    <div className="agents-workspace agents-page-skeleton" aria-busy="true" aria-live="polite">
      <LoadingLabel />
      <div className="agents-workspace-body">
        <aside className="agents-loading-sessions">
          <Sk className="agents-sk--back" />
          <div className="agents-loading-project-block">
            <div className="agents-loading-project-line">
              <Sk className="agents-sk--project" />
              <Sk className="agents-sk--settings-icon" />
            </div>
            <Sk className="agents-sk--project-sub" />
          </div>
          <Sk className="agents-sk--btn" />
          <div className="agents-loading-session-rows">
            {Array.from({ length: 5 }, (_, i) => (
              <Sk key={i} className={`agents-sk--session${i === 0 ? ' agents-sk--session-active' : ''}`} />
            ))}
          </div>
        </aside>
        <main className="agents-loading-chat">
          <Sk className="agents-sk--chat-head" />
          <div className="agents-loading-chat-body">
            <Sk className="agents-sk--bubble agents-sk--bubble-user" />
            <Sk className="agents-sk--bubble agents-sk--bubble-assistant" />
            <Sk className="agents-sk--bubble agents-sk--bubble-assistant agents-sk--bubble-short" />
          </div>
          <Sk className="agents-sk--composer" />
        </main>
        <aside className="agents-loading-files">
          <div className="agents-loading-files-head">
            <Sk className="agents-sk--files-title" />
            <Sk className="agents-sk--icon-btn" />
          </div>
          {Array.from({ length: 7 }, (_, i) => (
            <Sk key={i} className={`agents-sk--file-row${i % 3 === 0 ? ' agents-sk--file-row-indent' : ''}`} />
          ))}
        </aside>
      </div>
    </div>
  );
}

export function AgentsListSkeleton() {
  return (
    <div className="agents-list page agents-page-skeleton" aria-busy="true" aria-live="polite">
      <LoadingLabel />
      <div className="agents-loading-list-head">
        <Sk className="agents-sk--list-title" />
        <div className="agents-loading-list-actions">
          <Sk className="agents-sk--list-btn" />
          <Sk className="agents-sk--list-btn agents-sk--list-btn-primary" />
        </div>
      </div>
      <div className="agents-loading-list-grid">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="agents-loading-card">
            <div className="agents-loading-card-top">
              <Sk className="agents-sk--card-icon" />
              <Sk className="agents-sk--card-actions" />
            </div>
            <Sk className="agents-sk--card-name" />
            <Sk className="agents-sk--card-desc" />
            <Sk className="agents-sk--card-meta" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentsSettingsSkeleton() {
  return (
    <div className="project-settings agents-page-skeleton" aria-busy="true" aria-live="polite">
      <LoadingLabel />
      <Sk className="agents-sk--settings-back" />
      <Sk className="agents-sk--settings-title" />
      <Sk className="agents-sk--settings-sub" />
      <div className="agents-loading-settings-tabs">
        <Sk className="agents-sk--tab" />
        <Sk className="agents-sk--tab" />
      </div>
      <div className="agents-loading-settings-form">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="agents-loading-settings-field">
            <Sk className="agents-sk--field-label" />
            <Sk className="agents-sk--field-input" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentsFileSkeleton() {
  return (
    <div className="agents-file-skeleton" aria-busy="true" aria-live="polite">
      <LoadingLabel />
      {Array.from({ length: 14 }, (_, i) => (
        <Sk
          key={i}
          className={`agents-sk--code-line${i === 13 ? ' agents-sk--code-line-short' : ''}`}
        />
      ))}
    </div>
  );
}
