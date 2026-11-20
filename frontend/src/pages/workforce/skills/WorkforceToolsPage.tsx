import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { WorkforceAreaNav } from '../../../components/workforce/WorkforceAreaNav';
import { fetchToolCatalog, type ToolCapability } from '../../../data/workforceToolsApi';
import { ListPage } from '../../../styles/design-system';
import { useAsyncData } from '../../../hooks/useAsyncData';
import './workforceSkills.scss';

/**
 * What the runtime can do, read-only.
 *
 * Tools are code: their names, parameters and descriptions are the function-calling contract, so there is nothing to
 * create or edit here — the screen shows what the model is given, including the command allowlist behind code
 * execution. Enabling a tool is a decision about one agent, and lives on that agent's Tools tab.
 */
export function WorkforceToolsPage() {
  const { t } = useTranslation('workforce');
  const catalog = useAsyncData(() => fetchToolCatalog(), []);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ListPage
      title={t('toolsCatalogTitle')}
      subtitle={t('toolsCatalogLead')}
      tabs={<WorkforceAreaNav />}
    >

      {catalog.error ? <p className="ds-field__hint">{t('toolsCatalogFailed')}</p> : null}
      {catalog.loading ? <p className="ds-resource-list-loading">{t('loading')}</p> : null}

      {catalog.data ? (
        <>
          <div className="ds-resource-list-grid">
            {catalog.data.capabilities.map((capability) => (
              <CapabilityCard
                key={capability.id}
                capability={capability}
                expanded={open === capability.id}
                onToggle={() =>
                  setOpen((current) => (current === capability.id ? null : capability.id))
                }
              />
            ))}
          </div>

          <section className="workforce-tools-policy">
            <h2>
              <Terminal size={18} aria-hidden /> {catalog.data.environment.name}
            </h2>
            <p className="page-subtitle">{t('toolsCatalogEnvLead')}</p>
            <dl className="workforce-tools-policy__tools">
              {catalog.data.environment.tools.map((tool) => (
                <div key={tool.name}>
                  <dt>
                    <span className="workforce-tools-policy__label">{tool.label ?? tool.name}</span>
                    {tool.label ? <code>{tool.name}</code> : null}
                  </dt>
                  <dd>{tool.description}</dd>
                </div>
              ))}
            </dl>
            <details className="workforce-tools-policy__allow">
              <summary>
                {t('toolsCatalogAllowSummary', {
                  count: catalog.data.environment.policy.builtin_allow.length,
                  timeout: catalog.data.environment.policy.timeout_seconds,
                })}
              </summary>
              <p className="ds-field__hint">{t('toolsCatalogAllowHint')}</p>
              <ul>
                {catalog.data.environment.policy.builtin_allow.map((command) => (
                  <li key={command}>
                    <code>{command}</code>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </>
      ) : null}
    </ListPage>
  );
}

function CapabilityCard({
  capability,
  expanded,
  onToggle,
}: {
  capability: ToolCapability;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('workforce');

  return (
    <article className="ds-resource-list-card workforce-tools-card">
      <button type="button" className="workforce-tools-card__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="workforce-tools-card__name">
          {capability.name}
          {capability.core ? <span className="workforce-skill-chip">{t('toolsCoreTag')}</span> : null}
        </span>
        {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
      </button>
      <p className="ds-resource-list-desc">{t('toolsCount', { count: capability.tools.length })}</p>
      <div className="ds-resource-list-meta">
        {capability.tools.map((tool) => (
          <code key={tool.name}>{tool.name}</code>
        ))}
      </div>
      {expanded ? (
        <div className="workforce-tools-card__definitions">
          {capability.tools.map((tool) => (
            <div key={tool.name}>
              <code>{tool.name}</code>
              <p>{tool.description}</p>
            </div>
          ))}
          <p className="ds-field__hint">{t('toolsDefinitionNote')}</p>
        </div>
      ) : null}
    </article>
  );
}
