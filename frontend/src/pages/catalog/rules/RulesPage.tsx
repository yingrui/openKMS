/**
 * Rules — the ontology-layer app: author conditions, run them, and triage what they produced.
 *
 * Two tabs, because a rule and the events it raises are one workflow: 规则 is authoring and running,
 * 事件 is the inbox that says what to do about it. Events are ontology objects, so the same rows are
 * also visible in Object Explorer and on the business object they are linked to — this page is the
 * place that *connects* them, not a second store.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { BellRing, Loader2, Play, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  EmptyState,
  StatusChip,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../../styles/design-system';
import { conditionLabel } from './rulesLabels';
import { evaluateRule, evaluateRules, fetchRules, updateRule, type RuleOut } from '../../../data/rulesApi';
import { fetchEvents, transitionEvent, type EventOut } from '../../../data/eventsApi';
import { RulesEventsTable } from './RulesEventsTable';
import { RunRulesDialog, type RunParams } from './RunRulesDialog';
import { fetchMetrics, type MetricResponse } from '../../../data/metricsApi';
import { fetchDatasets, type DatasetResponse } from '../../../data/datasetsApi';
import { datasetLabel } from '../datasetLabel';
import { DatasetAppTabs } from '../../../components/ontology/DatasetAppTabs';
import '../../../styles/settings-page.scss';
import '../../ontology/ontology-admin.scss';
import '../../../styles/rules.scss';

function severityTone(severity: string | null): 'warn' | 'accent' | 'neutral' {
  if (severity === 'P0') return 'warn';
  if (severity === 'P1') return 'accent';
  return 'neutral';
}

function statusTone(status: string | null): 'ok' | 'warn' | 'neutral' | 'accent' {
  if (status === 'fail' || status === 'open') return 'warn';
  if (status === 'pass' || status === 'resolved') return 'ok';
  if (status === 'acknowledged') return 'accent';
  return 'neutral';
}

export function RulesPage() {
  const { t } = useTranslation('ontology');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'events' ? 'events' : 'rules';

  const [rules, setRules] = useState<RuleOut[]>([]);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [eventTotal, setEventTotal] = useState(0);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'open' | ''>('open');
  const [severityFilter, setSeverityFilter] = useState<'P0' | 'P1' | 'P2' | ''>('');
  // Read as primitives so the loader's dependency list is complete without a memoised object.
  const subjectType = (searchParams.get('subject_type') as 'metric' | 'dataset' | null) ?? undefined;
  const subjectId = searchParams.get('subject_id') ?? undefined;

  const metricName = useMemo(() => {
    const byId = new Map(metrics.map((metric) => [metric.id, metric.name]));
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [metrics]);

  // Dataset operands print their name, not their id: a rule's condition text is read by people.
  const datasetName = useMemo(() => {
    const byId = new Map(datasets.map((dataset) => [dataset.id, datasetLabel(dataset)]));
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [datasets]);

  const setTab = (next: 'rules' | 'events') => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('tab', next);
        return params;
      },
      { replace: true },
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ruleList, metricPage, datasetPage, eventPage] = await Promise.all([
        fetchRules({ subject_type: subjectType, subject_id: subjectId }),
        fetchMetrics().catch(() => ({ items: [] as MetricResponse[], total: 0 })),
        fetchDatasets({ limit: 200 }).catch(() => ({ items: [] as DatasetResponse[], total: 0 })),
        fetchEvents({
          subject_type: subjectType,
          subject_id: subjectId,
          status: statusFilter || undefined,
          severity: severityFilter || undefined,
          limit: 100,
        }).catch(() => ({ items: [] as EventOut[], total: 0 })),
      ]);
      setRules(ruleList);
      setMetrics(metricPage.items);
      setDatasets(datasetPage.items);
      setEvents(eventPage.items);
      setEventTotal(eventPage.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t, statusFilter, severityFilter, subjectType, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAll = async (params: RunParams) => {
    setRunning(true);
    try {
      const result = await evaluateRules(params);
      toast.success(t('rules.toastRanAll', { count: result.results.length, failed: result.failed }));
      await load();
      setRunOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastRunFailed'));
    } finally {
      setRunning(false);
    }
  };

  const runOne = async (rule: RuleOut) => {
    setRunningId(rule.object_id);
    try {
      const result = await evaluateRule(rule.object_id, {});
      const first = result.results[0];
      toast.success(
        result.results.length > 1
          ? t('rules.toastRanAll', { count: result.results.length, failed: result.failed })
          : t(`rules.status.${first?.status ?? 'pass'}`),
      );
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastRunFailed'));
    } finally {
      setRunningId(null);
    }
  };

  const togglePause = async (rule: RuleOut) => {
    try {
      await updateRule(rule.object_id, { status: rule.status === 'paused' ? 'active' : 'paused' });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastSaveFailed'));
    }
  };

  const moveEvent = async (event: EventOut, status: 'acknowledged' | 'dismissed' | 'resolved') => {
    setBusyEventId(event.id);
    try {
      await transitionEvent(event.id, { status });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastEventFailed'));
    } finally {
      setBusyEventId(null);
    }
  };

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <h1>{t('rules.title')}</h1>
          <p className="page-subtitle">{t('rules.subtitle')}</p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setRunOpen(true)}
            disabled={running || rules.length === 0}
          >
            {running ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />}
            <span>{running ? t('rules.running') : t('rules.runAll')}</span>
          </button>
          <Link to="/data-rules/new" className="btn btn-primary">
            <Plus size={16} aria-hidden />
            {t('rules.create')}
          </Link>
        </div>
      </div>

      <DatasetAppTabs />

      <div className="rules-panel">
        <div className="settings-page-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'rules'}
            className={`settings-page-tab ${tab === 'rules' ? 'active' : ''}`}
            onClick={() => setTab('rules')}
          >
            {t('rules.tabRules')}
            <span className="rules-tab-count">{rules.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'events'}
            className={`settings-page-tab ${tab === 'events' ? 'active' : ''}`}
            onClick={() => setTab('events')}
          >
            {t('rules.tabEvents')}
            <span className="rules-tab-count">{eventTotal}</span>
          </button>
        </div>

        <div className="settings-page-form">
          {loading ? (
            <div className="console-loading">
              <Loader2 size={32} className="console-loading-spinner" aria-hidden />
              <p>{t('shared.loading')}</p>
            </div>
          ) : tab === 'rules' ? (
            <>
              {rules.length === 0 ? (
                <EmptyState
                  icon={<BellRing size={32} aria-hidden />}
                  title={t('rules.empty')}
                  action={
                    <Link to="/data-rules/new" className="btn btn-primary">
                      {t('rules.create')}
                    </Link>
                  }
                />
              ) : (
                <div className="ds-table-wrap ds-table-wrap--flush">
                  <table className="console-table">
                    <thead>
                      <tr>
                        <th>{t('rules.colName')}</th>
                        <th>{t('rules.colSubject')}</th>
                        <th>{t('rules.colCondition')}</th>
                        <th>{t('rules.colSeverity')}</th>
                        <th>{t('rules.colLastRun')}</th>
                        <TableRowActionCell as="th">{t('shared.actions')}</TableRowActionCell>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule) => (
                        <tr key={rule.object_id}>
                          <td>
                            <Link to={`/data-rules/${rule.object_id}`} className="rules-name-btn">
                              {rule.name ?? '—'}
                            </Link>
                            {rule.status === 'paused' ? (
                              <span className="rules-paused">{t('rules.paused')}</span>
                            ) : null}
                          </td>
                          <td>{metricName((rule.subject?.ref as string) ?? '')}</td>
                          <td className="rules-condition">
                            {conditionLabel(rule.condition, {
                              metricName,
                              datasetName,
                              and: t('rules.joinAnd'),
                              or: t('rules.joinOr'),
                              scopePrefix: t('rules.scopePrefix'),
                              scopeAtRunTime: t('rules.groupedBy'),
                            }, rule.group_by)}
                          </td>
                          <td>
                            <StatusChip tone={severityTone(rule.severity)}>{rule.severity ?? '—'}</StatusChip>
                          </td>
                          <td>
                            {rule.last_status ? (
                              <>
                                <StatusChip tone={statusTone(rule.last_status)}>
                                  {t(`rules.status.${rule.last_status}`)}
                                </StatusChip>
                                {/* The period matters as much as the verdict: "passed" for which one? */}
                                <span className="rules-last-run">
                                  {rule.last_period_start || '—'}
                                  {rule.last_run_at ? ` · ${new Date(rule.last_run_at).toLocaleString()}` : ''}
                                </span>
                                {rule.last_reason ? (
                                  <span className="rules-last-run" title={rule.last_reason}>
                                    {rule.last_reason}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              t('rules.neverRun')
                            )}
                          </td>
                          <TableRowActionCell>
                            <TableRowActions>
                              <TableRowActionButton
                                title={t('rules.run')}
                                aria-label={t('rules.run')}
                                icon={<Play size={16} aria-hidden />}
                                loading={runningId === rule.object_id}
                                disabled={rule.status === 'paused'}
                                onClick={() => void runOne(rule)}
                              />
                              <TableRowActionButton
                                title={rule.status === 'paused' ? t('rules.resume') : t('rules.pause')}
                                aria-label={rule.status === 'paused' ? t('rules.resume') : t('rules.pause')}
                                icon={<BellRing size={16} aria-hidden />}
                                onClick={() => void togglePause(rule)}
                              />
                            </TableRowActions>
                          </TableRowActionCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="console-datasets-toolbar">
                <label className="console-datasets-filter">
                  {t('rules.filterStatus')}
                  <select
                    className="ds-control"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'open' | '')}
                  >
                    <option value="open">{t('rules.statusFilterOpen')}</option>
                    <option value="">{t('rules.statusFilterAll')}</option>
                  </select>
                </label>
                <label className="console-datasets-filter">
                  {t('rules.colSeverity')}
                  <select
                    className="ds-control"
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value as 'P0' | 'P1' | 'P2' | '')}
                  >
                    <option value="">{t('rules.statusFilterAll')}</option>
                    {['P0', 'P1', 'P2'].map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {events.length === 0 ? (
                <EmptyState icon={<BellRing size={32} aria-hidden />} title={t('rules.emptyEvents')} />
              ) : (
                <RulesEventsTable
                  events={events}
                  busyEventId={busyEventId}
                  onTransition={(event, status) => void moveEvent(event, status)}
                  grouped
                  ruleNames={Object.fromEntries(rules.map((rule) => [rule.rule_id, rule.name]))}
                />
              )}

              <p className="rules-hint">{t('rules.eventsHint')}</p>
            </>
          )}
        </div>
      </div>

      <RunRulesDialog
        open={runOpen}
        busy={running}
        onClose={() => setRunOpen(false)}
        onRun={(params) => void runAll(params)}

      />
    </div>
  );
}
