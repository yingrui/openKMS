import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { WorkforceAreaNav } from '../../../components/workforce/WorkforceAreaNav';
import { ToolParameters } from '../ToolParameters';
import {
  fetchToolCatalog,
  type ToolCapability,
  type ToolGroup,
} from '../../../data/workforceToolsApi';
import { ListPage } from '../../../styles/design-system';
import { useAsyncData } from '../../../hooks/useAsyncData';
import './workforceSkills.scss';

/**
 * What the runtime can do, read-only.
 *
 * Organised by group — what a capability *touches* — rather than as a flat grid, because a catalogue grows: a new
 * capability joins a group and the page is unchanged. Each row answers the four questions in order: what it is for,
 * which tools it brings, what it needs first, and (for the one that has limits) what those limits are. Enabling a
 * capability is a decision about one agent and stays on that agent's Tools tab.
 */
export function WorkforceToolsPage() {
  const { t, i18n } = useTranslation('workforce');
  const catalog = useAsyncData(() => fetchToolCatalog(), []);
  const [open, setOpen] = useState<string | null>(null);
  const isZh = i18n.language.startsWith('zh');

  const groups = catalog.data?.groups ?? [];
  const capabilities = catalog.data?.capabilities ?? [];
  const toolCount = capabilities.reduce((total, capability) => total + capability.tools.length, 0);

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
          <p className="workforce-tools-summary">
            {t('toolsCatalogCounts', { capabilities: capabilities.length, tools: toolCount })}
          </p>

          {groups.map((group) => {
            const members = capabilities.filter((capability) => capability.group === group.id);
            if (members.length === 0) return null;
            return (
              <section key={group.id} className="workforce-tools-group">
                <h2>{isZh ? (group.name_zh ?? group.name) : group.name}</h2>
                <ul>
                  {members.map((capability) => (
                    <ToolRow
                      key={capability.id}
                      capability={capability}
                      expanded={open === capability.id}
                      onToggle={() =>
                        setOpen((current) => (current === capability.id ? null : capability.id))
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      ) : null}
    </ListPage>
  );
}

function ToolRow({
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
    <li className={`workforce-tool-line${expanded ? ' is-open' : ''}`}>
      <button
        type="button"
        className="workforce-tool-line__head"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="workforce-tool-line__name">
          {capability.name}
          {capability.core ? (
            <span className="workforce-skill-chip">{t('toolsCoreTag')}</span>
          ) : null}
        </span>
        <span className="workforce-tool-line__summary">{capability.summary}</span>
        <span className="workforce-tool-line__meta">
          {capability.requires.length > 0 ? (
            <span className="workforce-tool-line__requires">
              {t('toolsRequires', {
                what: capability.requires
                  .map((requirement) => t(`toolsRequires_${requirement}`))
                  .join('、'),
              })}
            </span>
          ) : null}
          <span>{t('toolsCount', { count: capability.tools.length })}</span>
          {capability.policy ? <span>{t('toolsHasPolicy')}</span> : null}
        </span>
        {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
      </button>

      {expanded ? (
        <div className="workforce-tool-line__detail">
          <dl>
            {capability.tools.map((tool) => (
              <div key={tool.name} id={`tool-${tool.id.replace(/\./g, '-')}`}>
                <dt>
                  <span className="workforce-tool-line__tool-name">{tool.name}</span>
                </dt>
                <dd>{tool.description}</dd>
                <dd>
                  <details className="workforce-tool-params-disclosure">
                    <summary>{t('toolsParameters', { count: Object.keys(tool.parameters?.properties ?? {}).length })}</summary>
                    <ToolParameters parameters={tool.parameters} />
                  </details>
                </dd>
              </div>
            ))}
          </dl>

          {capability.policy ? (
            <div className="workforce-tool-line__policy">
              <p className="ds-field__hint">
                {t('toolsPolicyLine', {
                  cwd: capability.policy.cwd,
                  writable: capability.policy.writable,
                  timeout: capability.policy.timeout_seconds,
                })}
              </p>
              <details>
                <summary>
                  {t('toolsCatalogAllowSummary', {
                    count: capability.policy.allowlist.builtin_allow.length,
                    timeout: capability.policy.timeout_seconds,
                  })}
                </summary>
                <p className="ds-field__hint">{t('toolsCatalogAllowHint')}</p>
                <ul>
                  {capability.policy.allowlist.builtin_allow.map((command) => (
                    <li key={command}>
                      <code>{command}</code>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}

          <p className="ds-field__hint">{t('toolsDefinitionNote')}</p>
        </div>
      ) : null}
    </li>
  );
}

export type { ToolGroup };
