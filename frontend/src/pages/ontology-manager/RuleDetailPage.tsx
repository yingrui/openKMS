/**
 * One rule, in full — and the place a rule is created.
 *
 * The list page answers "what runs and did it hold"; this page answers "what exactly does it assert,
 * what did it last compute, and which events did it raise". Editing is a dialog here (a rule is a
 * handful of fields), but the rule itself is a page, like every other ontology object.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BellRing, Loader2, Pencil, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, EmptyState, FormField, StatusChip } from '../../styles/design-system';
import {
  createRule,
  deleteRule,
  evaluateRule,
  fetchRule,
  fetchRuleEvents,
  updateRule,
  type RuleCondition,
  type RuleOut,
  type RuleOperand,
} from '../../data/rulesApi';
import { transitionEvent, type EventOut } from '../../data/eventsApi';
import { fetchMetrics, type MetricResponse } from '../../data/metricsApi';
import { RulesEventsTable } from './RulesEventsTable';
import { RunRulesDialog, type RunParams } from './RunRulesDialog';
import { conditionLabel, isSimpleCondition, valueRows } from './rulesLabels';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { EntityViewPanel } from '../shared/EntityViewShell';
import '../../styles/settings-page.scss';
import '../ontology/ontology-admin.scss';
import '../../styles/rules.scss';

type FormState = {
  name: string;
  subjectKind: 'metric' | 'dataset';
  metricId: string;
  datasetId: string;
  aggFn: 'count' | 'sum' | 'avg' | 'min' | 'max';
  aggColumn: string;
  op: string;
  threshold: string;
  severity: 'P0' | 'P1' | 'P2';
  conclusion: string;
  suggestion: string;
  aboutObjectType: string;
};

const OPS = ['<', '<=', '>', '>=', '==', '!='];
const EMPTY_FORM: FormState = {
  name: '',
  subjectKind: 'metric',
  metricId: '',
  datasetId: '',
  aggFn: 'count',
  aggColumn: '',
  op: '>',
  threshold: '0',
  severity: 'P1',
  conclusion: '',
  suggestion: '',
  aboutObjectType: '',
};

function buildCondition(form: FormState): RuleCondition {
  const left: RuleOperand =
    form.subjectKind === 'metric'
      ? { metric: form.metricId }
      : {
          dataset_agg: {
            dataset_id: form.datasetId,
            fn: form.aggFn,
            column: form.aggFn === 'count' ? null : form.aggColumn,
          },
        };
  return { left, op: form.op, right: { value: Number(form.threshold) } };
}

function formFromRule(rule: RuleOut, metrics: MetricResponse[], datasets: DatasetResponse[]): FormState {
  const condition = rule.condition;
  const single = condition && 'left' in condition ? condition : null;
  const left = single?.left;
  return {
    name: rule.name ?? '',
    subjectKind: rule.subject?.kind ?? 'metric',
    metricId: left && 'metric' in left ? left.metric : (metrics[0]?.id ?? ''),
    datasetId: left && 'dataset_agg' in left ? left.dataset_agg.dataset_id : (datasets[0]?.id ?? ''),
    aggFn: left && 'dataset_agg' in left ? left.dataset_agg.fn : 'count',
    aggColumn: left && 'dataset_agg' in left ? (left.dataset_agg.column ?? '') : '',
    op: single?.op ?? '>',
    threshold: String(single?.right.value ?? 0),
    severity: (rule.severity as FormState['severity']) ?? 'P1',
    conclusion: rule.conclusion ?? '',
    suggestion: rule.suggestion ?? '',
    aboutObjectType: rule.about_object_type ?? '',
  };
}

function severityTone(severity: string | null): 'warn' | 'accent' | 'neutral' {
  if (severity === 'P0') return 'warn';
  if (severity === 'P1') return 'accent';
  return 'neutral';
}

export function RuleDetailPage() {
  const { t } = useTranslation('ontology');
  const { ruleId } = useParams<{ ruleId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isNew = ruleId === 'new';

  const [rule, setRule] = useState<RuleOut | null>(null);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [editorOpen, setEditorOpen] = useState(isNew);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  /** The condition as stored/sent — the form builder is a view over this, not a parallel copy. */
  const [conditionJson, setConditionJson] = useState('');
  const [conditionMode, setConditionMode] = useState<'form' | 'json'>('form');
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const [current, eventPage, metricPage, datasetPage] = await Promise.all([
        fetchRule(ruleId ?? ''),
        fetchRuleEvents(ruleId ?? '', { limit: 50 }).catch(() => ({ items: [] as EventOut[], total: 0 })),
        fetchMetrics().catch(() => ({ items: [] as MetricResponse[], total: 0 })),
        fetchDatasets({ limit: 200 }).catch(() => ({ items: [] as DatasetResponse[], total: 0 })),
      ]);
      setRule(current);
      setEvents(eventPage.items);
      setMetrics(metricPage.items);
      setDatasets(datasetPage.items);
      setForm(formFromRule(current, metricPage.items, datasetPage.items));
      setConditionJson(JSON.stringify(current.condition ?? {}, null, 2));
      setConditionMode(isSimpleCondition(current.condition) ? 'form' : 'json');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [isNew, ruleId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isNew) return;
    // The editor for a new rule needs the pickers even though there is no rule to fetch.
    void Promise.all([
      fetchMetrics().catch(() => ({ items: [] as MetricResponse[], total: 0 })),
      fetchDatasets({ limit: 200 }).catch(() => ({ items: [] as DatasetResponse[], total: 0 })),
    ]).then(([metricPage, datasetPage]) => {
      setMetrics(metricPage.items);
      setDatasets(datasetPage.items);
      const next: FormState = {
        ...EMPTY_FORM,
        metricId: metricPage.items[0]?.id ?? '',
        datasetId: datasetPage.items[0]?.id ?? '',
      };
      setForm(next);
      setConditionJson(JSON.stringify(buildCondition(next), null, 2));
      setConditionMode('form');
    });
  }, [isNew]);

  const updateForm = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    // A simple form edit rewrites the condition; switching to JSON afterwards edits the same object.
    setConditionJson(JSON.stringify(buildCondition(next), null, 2));
    setConditionError(null);
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    let condition: RuleCondition;
    try {
      condition = JSON.parse(conditionJson) as RuleCondition;
    } catch {
      setConditionError(t('rules.conditionJsonInvalid'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        subject: {
          kind: form.subjectKind,
          ref: form.subjectKind === 'metric' ? form.metricId : form.datasetId,
        },
        condition,
        severity: form.severity,
        conclusion: form.conclusion.trim(),
        suggestion: form.suggestion.trim(),
        about_object_type: form.aboutObjectType.trim() || null,
      };
      if (isNew) {
        const created = await createRule(payload);
        toast.success(t('rules.toastCreated'));
        navigate(`/ontology-manager/rules/${created.object_id}`, { replace: true });
      } else if (rule) {
        const updated = await updateRule(rule.object_id, payload);
        setRule(updated);
        setEditorOpen(false);
        toast.success(t('rules.toastUpdated'));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const run = async (params: RunParams) => {
    if (!rule) return;
    setRunning(true);
    try {
      const result = await evaluateRule(rule.object_id, params);
      toast.success(t(`rules.status.${result.status}`));
      await load();
      setRunOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastRunFailed'));
    } finally {
      setRunning(false);
    }
  };

  const remove = async () => {
    if (!rule) return;
    if (
      !(await confirm({
        title: t('rules.deleteTitle'),
        message: t('rules.deleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await deleteRule(rule.object_id);
      toast.success(t('rules.toastDeleted'));
      navigate('/ontology-manager/rules');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastSaveFailed'));
    }
  };

  const moveEvent = async (event: EventOut, status: 'acknowledged' | 'resolved' | 'dismissed') => {
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

  const metricName = useMemo(() => {
    const byId = new Map(metrics.map((metric) => [metric.id, metric.name]));
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [metrics]);
  const datasetName = useMemo(() => {
    const byId = new Map(
      datasets.map((dataset) => [dataset.id, dataset.display_name || dataset.table_name || dataset.id.slice(0, 8)]),
    );
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [datasets]);
  const conditionText = conditionLabel(rule?.condition ?? null, { metricName, datasetName });
  const isSimpleConditionForForm = useMemo(() => {
    try {
      return isSimpleCondition(JSON.parse(conditionJson || 'null') as RuleCondition);
    } catch {
      return false;
    }
  }, [conditionJson]);

  if (loading) {
    return (
      <div className="ontology-admin">
        <p className="page-subtitle">
          <Loader2 size={16} className="animate-spin" aria-hidden /> {t('shared.loading')}
        </p>
      </div>
    );
  }

  if (!isNew && !rule) {
    return (
      <div className="ontology-admin">
        <p className="page-subtitle">{t('rules.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <Link to="/ontology-manager/rules" className="rules-back">
            <ArrowLeft size={16} aria-hidden />
            {t('rules.backToList')}
          </Link>
          <h1>{isNew ? t('rules.dialogCreate') : (rule?.name ?? '—')}</h1>
          {rule ? (
            <p className="page-subtitle">
              <StatusChip tone={severityTone(rule.severity)}>{rule.severity ?? '—'}</StatusChip>{' '}
              {rule.subject?.kind === 'dataset' ? t('rules.subjectDataset') : t('rules.subjectMetric')}
              {rule.owner ? ` · ${rule.owner}` : ''} · v{rule.version ?? 1}
            </p>
          ) : null}
        </div>
        {rule ? (
          <div className="page-header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditorOpen(true)}>
              <Pencil size={16} aria-hidden />
              {t('shared.edit')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setRunOpen(true)}
              disabled={running}
            >
              {running ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />}
              {t('rules.run')}
            </button>
          </div>
        ) : null}
      </div>

      {rule ? (
        <div className="account-stack">
          <EntityViewPanel title={t('rules.panelDefinition')} description={t('rules.panelDefinitionHint')}>
            <dl className="rules-facts">
              <dt>{t('rules.colCondition')}</dt>
              <dd className="rules-condition">{conditionText}</dd>
              <dt>{t('rules.fieldConclusion')}</dt>
              <dd>{rule.conclusion || '—'}</dd>
              <dt>{t('rules.fieldSuggestion')}</dt>
              <dd>{rule.suggestion || t('rules.noSuggestion')}</dd>
              <dt>{t('rules.fieldAbout')}</dt>
              <dd>{rule.about_object_type || '—'}</dd>
              <dt>{t('rules.fieldStatus')}</dt>
              <dd>{rule.status === 'paused' ? t('rules.paused') : t('rules.active')}</dd>
            </dl>
            <div className="rules-danger-row">
              <button type="button" className="btn btn-secondary" onClick={() => void remove()}>
                <Trash2 size={16} aria-hidden />
                {t('rules.deleteRule')}
              </button>
            </div>
          </EntityViewPanel>

          <EntityViewPanel title={t('rules.panelLastRun')}>
            {rule.last_status ? (
              <dl className="rules-facts">
                <dt>{t('rules.fieldStatus')}</dt>
                <dd>
                  <StatusChip tone={rule.last_status === 'fail' ? 'warn' : rule.last_status === 'pass' ? 'ok' : 'neutral'}>
                    {t(`rules.status.${rule.last_status}`)}
                  </StatusChip>
                  <span className="rules-status-meaning">{t('rules.statusMeaning')}</span>
                </dd>
                <dt>{t('rules.colLastRun')}</dt>
                <dd>{rule.last_run_at ? new Date(rule.last_run_at).toLocaleString() : '—'}</dd>
                <dt>{t('rules.fieldValues')}</dt>
                <dd>
                  {valueRows(rule.last_values, { metricName }).length === 0 ? (
                    '—'
                  ) : (
                    <ul className="rules-values">
                      {valueRows(rule.last_values, { metricName }).map((row) => (
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
                onTransition={(event, status) => void moveEvent(event, status)}
              />
            )}
          </EntityViewPanel>
        </div>
      ) : null}

      <RunRulesDialog
        open={runOpen}
        busy={running}
        onClose={() => setRunOpen(false)}
        onRun={(params) => void run(params)}
      />

      <Dialog
        open={editorOpen}
        onClose={() => (isNew ? navigate('/ontology-manager/rules') : setEditorOpen(false))}
        title={isNew ? t('rules.dialogCreate') : t('rules.dialogEdit')}
        closeAriaLabel={t('shared.close')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => (isNew ? navigate('/ontology-manager/rules') : setEditorOpen(false))}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submit()}
              disabled={saving || !form.name.trim()}
            >
              {saving ? t('rules.saving') : isNew ? t('shared.create') : t('shared.save')}
            </button>
          </>
        }
      >
        <FormField label={t('rules.fieldName')}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            placeholder={t('rules.fieldNamePlaceholder')}
          />
        </FormField>
        <FormField label={t('rules.fieldSubject')}>
          <select
            value={form.subjectKind}
            onChange={(e) => updateForm({ subjectKind: e.target.value as FormState['subjectKind'] })}
          >
            <option value="metric">{t('rules.subjectMetric')}</option>
            <option value="dataset">{t('rules.subjectDataset')}</option>
          </select>
        </FormField>
        {form.subjectKind === 'metric' ? (
          <FormField label={t('rules.fieldMetric')}>
            <select value={form.metricId} onChange={(e) => updateForm({ metricId: e.target.value })}>
              {metrics.map((metric) => (
                <option key={metric.id} value={metric.id}>
                  {metric.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <>
            <FormField label={t('rules.fieldDataset')}>
              <select value={form.datasetId} onChange={(e) => updateForm({ datasetId: e.target.value })}>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.display_name || dataset.table_name || dataset.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t('rules.fieldAggregate')}>
              <select
                value={form.aggFn}
                onChange={(e) => updateForm({ aggFn: e.target.value as FormState['aggFn'] })}
              >
                {['count', 'sum', 'avg', 'min', 'max'].map((fn) => (
                  <option key={fn} value={fn}>
                    {fn}
                  </option>
                ))}
              </select>
            </FormField>
            {form.aggFn === 'count' ? null : (
              <FormField label={t('rules.fieldColumn')}>
                <input
                  type="text"
                  value={form.aggColumn}
                  onChange={(e) => updateForm({ aggColumn: e.target.value })}
                  placeholder={t('rules.fieldColumnPlaceholder')}
                />
              </FormField>
            )}
          </>
        )}
        <div className="rules-condition-block">
          <span className="account-field-label">{t('rules.currentCondition')}</span>
          <code className="rules-condition-current">{conditionText}</code>
          <div className="rules-mode-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={conditionMode === 'form'}
              className={`btn btn-sm ${conditionMode === 'form' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                // Switching views must not rewrite anything: the JSON stays authoritative until a
                // form field is actually edited (the warning above says what an edit would do).
                setConditionMode('form');
                setConditionError(null);
              }}
            >
              {t('rules.conditionModeForm')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={conditionMode === 'json'}
              className={`btn btn-sm ${conditionMode === 'json' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setConditionMode('json')}
            >
              {t('rules.conditionModeJson')}
            </button>
          </div>
          {conditionMode === 'form' ? (
            <>
              {!isSimpleConditionForForm ? (
                <p className="rules-condition-warning">{t('rules.conditionFormCannotRepresent')}</p>
              ) : null}
              <FormField label={t('rules.fieldComparison')}>
                <div className="rules-comparison">
                  <select className="ds-control" value={form.op} onChange={(e) => updateForm({ op: e.target.value })}>
                    {OPS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="ds-control"
                    value={form.threshold}
                    onChange={(e) => updateForm({ threshold: e.target.value })}
                  />
                </div>
              </FormField>
            </>
          ) : (
            <FormField label={t('rules.conditionJson')} hint={t('rules.conditionJsonHint')}>
              <textarea
                rows={8}
                className="ds-control"
                value={conditionJson}
                onChange={(e) => {
                  setConditionJson(e.target.value);
                  setConditionError(null);
                }}
              />
            </FormField>
          )}
          {conditionError ? <p className="rules-condition-warning">{conditionError}</p> : null}
        </div>


        <FormField label={t('rules.fieldSeverity')}>
          <select
            value={form.severity}
            onChange={(e) => updateForm({ severity: e.target.value as FormState['severity'] })}
          >
            {['P0', 'P1', 'P2'].map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('rules.fieldConclusion')} hint={t('rules.fieldConclusionHint')}>
          <input type="text" value={form.conclusion} onChange={(e) => updateForm({ conclusion: e.target.value })} />
        </FormField>
        <FormField label={t('rules.fieldSuggestion')} hint={t('rules.fieldSuggestionHint')}>
          <input
            type="text"
            value={form.suggestion}
            onChange={(e) => updateForm({ suggestion: e.target.value })}
          />
        </FormField>
        <FormField label={t('rules.fieldAbout')} hint={t('rules.fieldAboutHint')}>
          <input
            type="text"
            value={form.aboutObjectType}
            onChange={(e) => updateForm({ aboutObjectType: e.target.value })}
            placeholder={t('rules.fieldAboutPlaceholder')}
          />
        </FormField>
      </Dialog>
    </div>
  );
}
