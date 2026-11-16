/**
 * 概览: the whole definition as a record — what it watches, what must hold, how it runs, what it says when
 * it fires, and how it last came out. Editing is 设置; this page only reads.
 */
import { useTranslation } from 'react-i18next';
import { Link, useOutletContext } from 'react-router-dom';
import { EntityViewPanel } from '../../shared/EntityViewShell';
import { StatusChip, StatusLine } from '../../../styles/design-system';
import { conditionLabel, relationLabel } from './rulesLabels';
import { conditionFromRows } from './conditionRowsModel';
import { statusTone } from './ruleTones';
import type { RuleDetailCtx } from './ruleDetailContext';

export function RuleOverviewTab() {
  const { t } = useTranslation('ontology');
  const { rule, form, metricName, datasetName, joinerWords, conditionRows, periodSpec } =
    useOutletContext<RuleDetailCtx>();
  const identities = rule?.identities ?? [];
  const extras = (rule?.run_params?.arguments ?? []).filter((argument) => argument.role !== 'period');
  const settings = `/data-rules/${rule?.id ?? ''}/settings`;

  return (
    <>
      <EntityViewPanel
        title={t('rules.navOverview')}
        description={t('rules.panelDefinitionHint')}
        actions={
          <Link className="btn btn-secondary" to={settings}>
            {t('rules.editInSettings')}
          </Link>
        }
      >
        <dl className="rules-facts">
          <dt>{t('rules.fieldSubject')}</dt>
          <dd>{metricName(form.metricId)}</dd>
          <dt>{t('rules.groupField')}</dt>
          <dd>{rule?.group_by?.field ?? t('rules.trialNoGroup')}</dd>
          <dt>{t('rules.colLastRun')}</dt>
          <dd>
            {rule?.last_status ? (
              <StatusLine>
                <StatusChip tone={statusTone(rule.last_status)}>
                  {t(`rules.status.${rule.last_status}`)}
                </StatusChip>
                <StatusLine>
                  {rule.last_period_start || '—'}
                  {rule.last_run_at ? ` · ${new Date(rule.last_run_at).toLocaleString()}` : ''}
                </StatusLine>
              </StatusLine>
            ) : (
              t('rules.neverRun')
            )}
          </dd>
        </dl>
      </EntityViewPanel>

      <EntityViewPanel
        title={t('rules.navCheck')}
        description={
          identities.length > 0 ? t('rules.panelRelationHint') : t('rules.panelConditionHint')
        }
      >
        {identities.length > 0 ? (
          <ul className="rules-identities">
            {identities.map((identity, index) => (
              <li key={index}>
                <code className="rules-condition">{relationLabel(identity, metricName)}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rules-condition-current">
            {conditionLabel(
              rule?.condition ?? conditionFromRows(conditionRows),
              { metricName, datasetName, ...joinerWords },
              form.groupField.trim() ? { field: form.groupField.trim() } : null,
            ) ?? t('rules.conditionIncomplete')}
          </p>
        )}
      </EntityViewPanel>

      <EntityViewPanel title={t('rules.navRunParams')} description={t('rules.scopeHint')}>
        <dl className="rules-facts">
          <dt>{t('rules.runValues')}</dt>
          <dd>
            {periodSpec ? (
              <span>
                {periodSpec.field} —{' '}
                {periodSpec.has_interval
                  ? t('rules.runParamsRequired', {
                      formats: periodSpec.format ?? t('rules.runParamsCustomFormat'),
                    })
                  : t('rules.periodNoInterval')}
              </span>
            ) : (
              t('datasets.dash')
            )}
            {extras.map((argument) => (
              <span key={argument.key} className="page-subtitle">
                {' · '}
                {argument.kind === 'key'
                  ? t('rules.runArgKeyRead', { field: argument.field ?? argument.key })
                  : t('rules.runArgFilterRead', { field: argument.field ?? argument.key })}
              </span>
            ))}
          </dd>
        </dl>
      </EntityViewPanel>

      <EntityViewPanel title={t('rules.navAlertCopy')} description={t('rules.panelMeaningHint')}>
        <dl className="rules-facts">
          <dt>{t('rules.fieldConclusion')}</dt>
          <dd>{rule?.conclusion || '—'}</dd>
          <dt>{t('rules.fieldSuggestion')}</dt>
          <dd>{rule?.suggestion || t('rules.noSuggestion')}</dd>
        </dl>
      </EntityViewPanel>
    </>
  );
}
