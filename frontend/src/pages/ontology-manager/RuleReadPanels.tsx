/**
 * The read view of one rule: what it asserts, what it last computed, and what it raised.
 *
 * Split out of the page so the page keeps the state and the two modes, and this file keeps the
 * presentation — the same reason the editor panels are separate.
 */

import { useTranslation } from 'react-i18next';
import { BellRing, Trash2 } from 'lucide-react';
import { EmptyState, StatusChip } from '../../styles/design-system';
import { EntityViewPanel } from '../shared/EntityViewShell';
import type { EventOut } from '../../data/eventsApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { MetricResponse } from '../../data/metricsApi';
import type { RuleOut } from '../../data/rulesApi';
import type { GroupNode } from './conditionModel';
import { ConditionTree } from './ConditionTree';
import { RulesEventsTable } from './RulesEventsTable';
import { valueRows, type LabelLookups } from './rulesLabels';

export function RuleReadPanels({
  rule,
  readTree,
  conditionText,
  scopeNote,
  events,
  busyEventId,
  onTransition,
  onDelete,
  lookups,
  metrics,
  datasets,
}: {
  rule: RuleOut;
  readTree: GroupNode | null;
  conditionText: string;
  scopeNote: string | null;
  events: EventOut[];
  busyEventId: string | null;
  onTransition: (event: EventOut, status: 'acknowledged' | 'resolved' | 'dismissed') => void;
  onDelete: () => void;
  lookups: LabelLookups & { metricName: (id: string) => string };
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
}) {
  const { t } = useTranslation('ontology');
  return (
    <>
              <EntityViewPanel title={t('rules.panelDefinition')} description={t('rules.panelDefinitionHint')}>
                <dl className="rules-facts">
                  <dt>{t('rules.colCondition')}</dt>
                  <dd>
                    {readTree ? (
                      <ConditionTree
                        value={readTree}
                        onChange={() => undefined}
                        metrics={metrics}
                        datasets={datasets}
                        readOnly
                        scopeNote={scopeNote}
                      />
                    ) : (
                      <code className="rules-condition">{conditionText}</code>
                    )}
                  </dd>
                  <dt>{t('rules.fieldConclusion')}</dt>
                  <dd>{rule?.conclusion || '—'}</dd>
                  <dt>{t('rules.fieldSuggestion')}</dt>
                  <dd>{rule?.suggestion || t('rules.noSuggestion')}</dd>
                  <dt>{t('rules.fieldAbout')}</dt>
                  <dd>{rule?.about_object_type || '—'}</dd>
                  <dt>{t('rules.fieldStatus')}</dt>
                  <dd>{rule?.status === 'paused' ? t('rules.paused') : t('rules.active')}</dd>
                </dl>
                <div className="rules-danger-row">
                  <button type="button" className="btn btn-secondary" onClick={onDelete}>
                    <Trash2 size={16} aria-hidden />
                    {t('rules.deleteRule')}
                  </button>
                </div>
              </EntityViewPanel>

              <EntityViewPanel title={t('rules.panelLastRun')}>
                {rule?.last_status ? (
                  <dl className="rules-facts">
                    <dt>{t('rules.fieldStatus')}</dt>
                    <dd>
                      <StatusChip
                        tone={rule.last_status === 'fail' ? 'warn' : rule.last_status === 'pass' ? 'ok' : 'neutral'}
                      >
                        {t(`rules.status.${rule.last_status}`)}
                      </StatusChip>
                      <span className="rules-status-meaning">{t('rules.statusMeaning')}</span>
                    </dd>
                    <dt>{t('rules.colLastRun')}</dt>
                    <dd>{rule.last_run_at ? new Date(rule.last_run_at).toLocaleString() : '—'}</dd>
                    <dt>{t('rules.fieldValues')}</dt>
                    <dd>
                      {valueRows(rule.last_values, lookups).length === 0 ? (
                        '—'
                      ) : (
                        <ul className="rules-values">
                          {valueRows(rule.last_values, lookups).map((row) => (
                            <li key={row.label}>
                              <span className="rules-values-label">{row.label}</span>
                              <span className="rules-values-value">{row.value}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </dl>
                ) : (
                  <p className="page-subtitle">{t('rules.neverRun')}</p>
                )}
              </EntityViewPanel>

              <EntityViewPanel title={t('rules.panelEvents')} description={t('rules.panelEventsHint')}>
                {events.length === 0 ? (
                  <EmptyState icon={<BellRing size={32} aria-hidden />} title={t('rules.emptyEvents')} />
                ) : (
                  <RulesEventsTable
                    events={events}
                    busyEventId={busyEventId}
                    showPeriod
                    onTransition={onTransition}
                  />
                )}
              </EntityViewPanel>
    </>
  );
}
