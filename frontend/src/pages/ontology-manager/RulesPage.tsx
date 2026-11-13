/**
 * Rules — the ontology-layer app that authors conditions and runs them.
 *
 * A **Rule** is a condition plus a one-line conclusion; running it either produces an **Event**
 * (an ontology object, with `event_start_time` / `event_end_time` and an `intent`) or closes the one
 * it produced earlier. Events are not listed here: they *are* objects, so Object Explorer shows
 * them, the graph links them to the business object they are about, and agents can read them.
 *
 * This page is deliberately thin: list, create/edit a single comparison, run everything. Conditions
 * that need `all`/`any` or nested operands are expressible through the API — the form covers the
 * common case instead of growing into a query builder.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, FormField, StatusChip } from '../../styles/design-system';
import {
  createRule,
  evaluateRule,
  evaluateRules,
  fetchRules,
  updateRule,
  type RuleCondition,
  type RuleOperand,
  type RuleOut,
} from '../../data/rulesApi';
import { fetchMetrics, type MetricResponse } from '../../data/metricsApi';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import '../ontology/ontology-admin.scss';

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

const OPS = ['<', '<=', '>', '>=', '==', '!='];

/** The single comparison the form builds. `subjectType` only affects the left operand. */
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

/** Human-readable one-liner for the table: `分货满足率 > 1`. */
function describeCondition(rule: RuleOut, metricName: (id: string) => string): string {
  const condition = rule.condition;
  if (!condition) return '—';
  const single = 'left' in condition ? condition : null;
  if (!single) return '多条件';
  const left = single.left;
  if ('metric' in left) return `${metricName(left.metric)} ${single.op} ${single.right.value}`;
  if ('dataset_agg' in left) {
    const agg = left.dataset_agg;
    return `${agg.fn}(${agg.column ?? '*'}) ${single.op} ${single.right.value}`;
  }
  const kind = 'diff' in left ? '差值' : '比率';
  return `${kind} ${single.op} ${single.right.value}`;
}

function intentTone(severity: string | null): 'warn' | 'neutral' | 'ok' | 'accent' {
  if (severity === 'P0') return 'warn';
  if (severity === 'P1') return 'accent';
  if (severity === 'P2') return 'neutral';
  return 'ok';
}

export function RulesPage() {
  const { t } = useTranslation('ontology');
  const [rules, setRules] = useState<RuleOut[]>([]);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RuleOut | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState('');

  const metricName = useMemo(() => {
    const byId = new Map(metrics.map((metric) => [metric.id, metric.name]));
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [metrics]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ruleList, metricPage, datasetPage] = await Promise.all([
        fetchRules(),
        fetchMetrics().catch(() => ({ items: [] as MetricResponse[], total: 0 })),
        fetchDatasets({ limit: 200 }).catch(() => ({ items: [] as DatasetResponse[], total: 0 })),
      ]);
      setRules(ruleList);
      setMetrics(metricPage.items);
      setDatasets(datasetPage.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastLoadFailed'));
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, metricId: metrics[0]?.id ?? '', datasetId: datasets[0]?.id ?? '' });
    setEditorOpen(true);
  };

  const openEdit = (rule: RuleOut) => {
    const condition = rule.condition;
    const single = condition && 'left' in condition ? condition : null;
    const left = single?.left;
    setEditing(rule);
    setForm({
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
    });
    setEditorOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        subject: {
          kind: form.subjectKind,
          ref: form.subjectKind === 'metric' ? form.metricId : form.datasetId,
        },
        condition: buildCondition(form),
        severity: form.severity,
        conclusion: form.conclusion.trim(),
        suggestion: form.suggestion.trim(),
        about_object_type: form.aboutObjectType.trim() || null,
      };
      if (editing) await updateRule(editing.object_id, payload);
      else await createRule(payload);
      toast.success(editing ? t('rules.toastUpdated') : t('rules.toastCreated'));
      setEditorOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const runAll = async () => {
    setRunning(true);
    try {
      const result = await evaluateRules({
        period_start: period,
        period_end: period,
        scope: '',
      });
      toast.success(
        t('rules.toastRanAll', { count: result.results.length, failed: result.failed }),
      );
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastRunFailed'));
    } finally {
      setRunning(false);
    }
  };

  const runOne = async (rule: RuleOut) => {
    setRunningId(rule.object_id);
    try {
      const result = await evaluateRule(rule.object_id, {
        period_start: period,
        period_end: period,
      });
      toast.success(t(`rules.status.${result.status}`));
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('rules.title')}</h1>
          <p className="page-subtitle">{t('rules.subtitle')}</p>
        </div>
        <div className="page-header-actions">
          <label className="rules-period">
            <span>{t('rules.period')}</span>
            <input
              type="text"
              className="ds-control"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder={t('rules.periodPlaceholder')}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void runAll()}
            disabled={running || rules.length === 0}
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            <span>{running ? t('rules.running') : t('rules.runAll')}</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            <span>{t('rules.create')}</span>
          </button>
        </div>
      </div>

      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" />
            <p>{t('shared.loading')}</p>
          </div>
        ) : rules.length === 0 ? (
          <p className="page-subtitle">{t('rules.empty')}</p>
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('rules.colName')}</th>
                  <th>{t('rules.colSubject')}</th>
                  <th>{t('rules.colCondition')}</th>
                  <th>{t('rules.colSeverity')}</th>
                  <th>{t('rules.colLastRun')}</th>
                  <th>{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.object_id}>
                    <td>
                      <button type="button" className="rules-name-btn" onClick={() => openEdit(rule)}>
                        {rule.name ?? '—'}
                      </button>
                      {rule.status === 'paused' ? (
                        <span className="rules-paused">{t('rules.paused')}</span>
                      ) : null}
                    </td>
                    <td>{rule.subject?.kind === 'dataset' ? t('rules.subjectDataset') : t('rules.subjectMetric')}</td>
                    <td className="rules-condition">{describeCondition(rule, metricName)}</td>
                    <td>
                      <StatusChip tone={intentTone(rule.severity)}>{rule.severity ?? '—'}</StatusChip>
                    </td>
                    <td>
                      {rule.last_status ? (
                        <>
                          <StatusChip
                            tone={
                              rule.last_status === 'fail'
                                ? 'warn'
                                : rule.last_status === 'unknown'
                                  ? 'neutral'
                                  : 'ok'
                            }
                          >
                            {t(`rules.status.${rule.last_status}`)}
                          </StatusChip>
                          {rule.last_run_at ? (
                            <span className="rules-last-run">
                              {new Date(rule.last_run_at).toLocaleString()}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        t('rules.neverRun')
                      )}
                    </td>
                    <td>
                      <div className="console-table-btns">
                        <button
                          type="button"
                          title={t('rules.run')}
                          disabled={runningId === rule.object_id || rule.status === 'paused'}
                          onClick={() => void runOne(rule)}
                        >
                          {runningId === rule.object_id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Play size={16} />
                          )}
                        </button>
                        <button type="button" onClick={() => openEdit(rule)}>
                          {t('shared.edit')}
                        </button>
                        <button type="button" onClick={() => void togglePause(rule)}>
                          {rule.status === 'paused' ? t('rules.resume') : t('rules.pause')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="rules-hint">
          <TriangleAlert size={14} aria-hidden />
          {t('rules.eventsHint')}
        </p>
      </div>

      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? t('rules.dialogEdit') : t('rules.dialogCreate')}
        closeAriaLabel={t('shared.close')}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditorOpen(false)}>
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submit()}
              disabled={saving || !form.name.trim()}
            >
              {saving ? t('rules.saving') : editing ? t('shared.save') : t('shared.create')}
            </button>
          </>
        }
      >
        <FormField label={t('rules.fieldName')}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('rules.fieldNamePlaceholder')}
          />
        </FormField>

        <FormField label={t('rules.fieldSubject')}>
          <select
            value={form.subjectKind}
            onChange={(e) => setForm({ ...form, subjectKind: e.target.value as FormState['subjectKind'] })}
          >
            <option value="metric">{t('rules.subjectMetric')}</option>
            <option value="dataset">{t('rules.subjectDataset')}</option>
          </select>
        </FormField>

        {form.subjectKind === 'metric' ? (
          <FormField label={t('rules.fieldMetric')}>
            <select value={form.metricId} onChange={(e) => setForm({ ...form, metricId: e.target.value })}>
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
              <select value={form.datasetId} onChange={(e) => setForm({ ...form, datasetId: e.target.value })}>
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
                onChange={(e) => setForm({ ...form, aggFn: e.target.value as FormState['aggFn'] })}
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
                  onChange={(e) => setForm({ ...form, aggColumn: e.target.value })}
                  placeholder={t('rules.fieldColumnPlaceholder')}
                />
              </FormField>
            )}
          </>
        )}

        <FormField label={t('rules.fieldComparison')}>
          <div className="rules-comparison">
            <select value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value })}>
              {OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })}
            />
          </div>
        </FormField>

        <FormField label={t('rules.fieldSeverity')}>
          <select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value as FormState['severity'] })}
          >
            {['P0', 'P1', 'P2'].map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label={t('rules.fieldConclusion')} hint={t('rules.fieldConclusionHint')}>
          <input
            type="text"
            value={form.conclusion}
            onChange={(e) => setForm({ ...form, conclusion: e.target.value })}
          />
        </FormField>

        <FormField label={t('rules.fieldSuggestion')} hint={t('rules.fieldSuggestionHint')}>
          <input
            type="text"
            value={form.suggestion}
            onChange={(e) => setForm({ ...form, suggestion: e.target.value })}
          />
        </FormField>

        <FormField label={t('rules.fieldAbout')} hint={t('rules.fieldAboutHint')}>
          <input
            type="text"
            value={form.aboutObjectType}
            onChange={(e) => setForm({ ...form, aboutObjectType: e.target.value })}
            placeholder={t('rules.fieldAboutPlaceholder')}
          />
        </FormField>
      </Dialog>
    </>
  );
}
