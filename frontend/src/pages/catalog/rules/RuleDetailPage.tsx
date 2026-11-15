/**
 * One rule: read it, run it, edit it — on a page, not in a dialog.
 *
 * A rule is a handful of metadata plus a condition, and the condition needs room: a summary of what is
 * stored, a form view, and a JSON view for the shapes the form cannot express. That is a page's worth
 * of work ("both views at once serves neither" was the same conclusion the quality-rule page reached),
 * so the page has two modes — read and edit — and the header carries the mode's actions.
 *
 * `/rules/new` is the same page in edit mode, so creating and editing cannot drift apart.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Pencil, Play } from 'lucide-react';
import { toast } from 'sonner';
import { FormField, StatusChip } from '../../../styles/design-system';
import {
  createRule,
  deleteRule,
  evaluateRule,
  fetchRule,
  fetchRuleEvents,
  updateRule,
  type RuleOut,
  type RulesEvaluateResponse,
} from '../../../data/rulesApi';
import { transitionEvent, type EventOut } from '../../../data/eventsApi';
import { fetchMetrics, type MetricResponse } from '../../../data/metricsApi';
import { fetchDatasets, type DatasetResponse } from '../../../data/datasetsApi';
import { fetchModelFields, type SemanticModelFieldResponse } from '../../../data/semanticModelFieldsApi';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { EntityViewPanel } from '../../shared/EntityViewShell';
import { RuleReadPanels } from './RuleReadPanels';
import { RunRulesDialog, type RunParams } from './RunRulesDialog';
import { conditionLabel, conditionScopeNote } from './rulesLabels';
import { ConditionRows } from './ConditionRows';
import { conditionFromRows, newRow, rowsFromCondition, type ConditionRow } from './conditionRowsModel';
import { RuleBasicsForm } from './RuleBasicsForm';
import { RelationEditor } from './RelationEditor';
import { relationPayload } from './relationDraft';
import '../../../styles/settings-page.scss';
import '../../ontology/ontology-admin.scss';
import '../../../styles/rules.scss';

import type { RelationMemberDraft as RelationMember } from './relationDraft';

type FormState = {
  /** A threshold check, or an identity between metrics — exactly one is sent. */
  mode: 'condition' | 'relation';
  relationTarget: string;
  relationMembers: RelationMember[];
  toleranceKind: 'abs' | 'rel';
  toleranceValue: string;
  name: string;
  ruleId: string;
  metricId: string;
  datasetId: string;
  aggFn: 'count' | 'sum' | 'avg' | 'min' | 'max';
  aggColumn: string;
  op: string;
  threshold: string;
  severity: 'P0' | 'P1' | 'P2';
  conclusion: string;
  suggestion: string;
  status: 'active' | 'paused';
  groupField: string;
  periodField: string;
};

const EMPTY_FORM: FormState = {
  mode: 'condition',
  relationTarget: '',
  relationMembers: [{ metricId: '', weight: '1' }],
  toleranceKind: 'abs',
  toleranceValue: '0',
  name: '',
  ruleId: '',
  metricId: '',
  datasetId: '',
  aggFn: 'count',
  aggColumn: '',
  op: '>',
  threshold: '0',
  severity: 'P1',
  conclusion: '',
  suggestion: '',
  status: 'active',
  groupField: '',
  periodField: '',
};

function formFromRule(rule: RuleOut, metrics: MetricResponse[], datasets: DatasetResponse[]): FormState {
  const condition = rule.condition;
  const single = condition && 'left' in condition ? condition : null;
  const left = single?.left;
  const relation = rule.relation;
  return {
    mode: relation ? 'relation' : 'condition',
    relationTarget: relation?.target?.metric ?? '',
    relationMembers:
      relation && relation.members.length > 0
        ? relation.members.map((member) => ({
            metricId: member.metric,
            weight: String(member.weight ?? 1),
          }))
        : [{ metricId: '', weight: '1' }],
    toleranceKind: relation?.tolerance?.rel ? 'rel' : 'abs',
    toleranceValue: String(
      relation?.tolerance?.rel ?? relation?.tolerance?.abs ?? 0,
    ),
    name: rule.name ?? '',
    ruleId: rule.rule_id ?? '',
    metricId: left && 'metric' in left ? left.metric : (metrics[0]?.id ?? ''),
    datasetId: left && 'dataset_agg' in left ? left.dataset_agg.dataset_id : (datasets[0]?.id ?? ''),
    aggFn: left && 'dataset_agg' in left ? left.dataset_agg.fn : 'count',
    aggColumn: left && 'dataset_agg' in left ? (left.dataset_agg.column ?? '') : '',
    op: single?.op ?? '>',
    threshold: String(single?.right.value ?? 0),
    severity: (rule.severity as FormState['severity']) ?? 'P1',
    conclusion: rule.conclusion ?? '',
    suggestion: rule.suggestion ?? '',
    status: rule.status === 'paused' ? 'paused' : 'active',
    groupField: rule.group_by?.field ?? '',
    periodField: rule.period_field ?? '',
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
  const [editing, setEditing] = useState(isNew);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [conditionRows, setConditionRows] = useState<ConditionRow[]>([]);
  /** The stored condition has a shape this editor cannot draw — editing would silently rewrite it. */
  const [conditionUnrepresentable, setConditionUnrepresentable] = useState(false);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  // A trial's result lives here, not on the rule: 试算 publishes nothing, so there is nothing to reload.
  const [trial, setTrial] = useState<RulesEvaluateResponse | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [paramCandidates, setParamCandidates] = useState<string[]>([]);

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

  /** Fields a group-by can use: the model fields of the metric this rule watches. */
  useEffect(() => {
    let cancelled = false;
    const metric = metrics.find((entry) => entry.id === form.metricId);
    if (!metric) {
      setParamCandidates([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const fields = await fetchModelFields(metric.semantic_model_id);
        if (!cancelled) {
          setParamCandidates(fields.items.map((field: SemanticModelFieldResponse) => field.name));
        }
      } catch {
        if (!cancelled) setParamCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.metricId, metrics]);

  const loadPickers = useCallback(async () => {
    const [metricPage, datasetPage] = await Promise.all([
      fetchMetrics().catch(() => ({ items: [] as MetricResponse[], total: 0 })),
      fetchDatasets({ limit: 200 }).catch(() => ({ items: [] as DatasetResponse[], total: 0 })),
    ]);
    setMetrics(metricPage.items);
    setDatasets(datasetPage.items);
    return { metrics: metricPage.items, datasets: datasetPage.items };
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const [current, eventPage, pickers] = await Promise.all([
        fetchRule(ruleId ?? ''),
        fetchRuleEvents(ruleId ?? '', { limit: 50 }).catch(() => ({ items: [] as EventOut[], total: 0 })),
        loadPickers(),
      ]);
      setRule(current);
      // Creating a rule navigates here with the editor state still "on"; loading a stored rule is
      // always a read view, so entering the page never starts half-edited.
      setEditing(false);
      setEvents(eventPage.items);
      setForm(formFromRule(current, pickers.metrics, pickers.datasets));
      // A stored condition the flat editor cannot show (a nested group) leaves the rows empty and the
      // page says so; nothing is silently rewritten.
      const rows = rowsFromCondition(current.condition);
      setConditionRows(rows ?? []);
      setConditionUnrepresentable(rows === null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [isNew, ruleId, t, loadPickers]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isNew) return;
    void loadPickers().then((pickers) => {
      const next: FormState = {
        ...EMPTY_FORM,
        metricId: pickers.metrics[0]?.id ?? '',
        datasetId: pickers.datasets[0]?.id ?? '',
      };
      setForm(next);
      setConditionRows([
        newRow({ metricId: pickers.metrics[0]?.id ?? '', datasetId: pickers.datasets[0]?.id ?? '' }),
      ]);
    });
  }, [isNew, loadPickers]);

  const save = async () => {
    if (!form.name.trim()) return;
    if (conditionUnrepresentable) {
      setConditionError(t('rules.conditionUnrepresentable'));
      return;
    }
    const condition = conditionFromRows(conditionRows);
    if (!condition) {
      setConditionError(t('rules.conditionIncomplete'));
      return;
    }
    setSaving(true);
    try {
      const relation =
        form.mode === 'relation'
          ? relationPayload({
              target: form.relationTarget,
              members: form.relationMembers,
              toleranceKind: form.toleranceKind,
              toleranceValue: form.toleranceValue,
            })
          : null;
      const payload = {
        name: form.name.trim(),
        rule_id: form.ruleId.trim() || null,
        metric_id: form.metricId,
        ...(relation ? { relation } : { condition }),
        severity: form.severity,
        conclusion: form.conclusion.trim(),
        suggestion: form.suggestion.trim(),
        status: form.status,
        group_by: form.groupField.trim() ? { field: form.groupField.trim() } : null,
        period_field: form.periodField.trim() || null,
      };
      if (isNew) {
        const created = await createRule(payload);
        toast.success(t('rules.toastCreated'));
        navigate(`/data-rules/${created.id}`, { replace: true });
      } else if (rule) {
        const updated = await updateRule(rule.id, payload);
        setRule(updated);
        setForm(formFromRule(updated, metrics, datasets));
        setEditing(false);
        toast.success(t('rules.toastUpdated'));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (isNew) {
      navigate('/data-rules');
      return;
    }
    if (rule) {
      setForm(formFromRule(rule, metrics, datasets));
      const rows = rowsFromCondition(rule.condition);
      setConditionRows(rows ?? []);
      setConditionUnrepresentable(rows === null);
    }
    setConditionError(null);
    setEditing(false);
  };

  const run = async (params: RunParams) => {
    if (!rule) return;
    setRunning(true);
    try {
      const result = await evaluateRule(rule.id, params);
      const first = result.results[0];
      toast.success(
        result.results.length > 1
          ? t('rules.toastRanAll', { count: result.results.length, failed: result.failed })
          : t(`rules.status.${first?.status ?? 'pass'}`),
      );
      await load();
      setRunOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastRunFailed'));
    } finally {
      setRunning(false);
    }
  };

  const trialRun = async (params: RunParams) => {
    if (!rule) return;
    setRunning(true);
    try {
      setTrial(await evaluateRule(rule.id, { ...params, dry_run: true }));
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
      await deleteRule(rule.id);
      toast.success(t('rules.toastDeleted'));
      navigate('/data-rules');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastSaveFailed'));
    }
  };

  const moveEvent = async (event: EventOut, status: 'resolved' | 'dismissed') => {
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

  // The author's own word for what a run picks ("方案") makes the sentence concrete; without one the
  // sentence stays domain-neutral ("one object at a time"). Neither ever says "scenario".
  const groupLabel = rule?.group_by?.label ?? null;
  const joiners = {
    and: t('rules.joinAnd'),
    or: t('rules.joinOr'),
    scopePrefix: t('rules.scopePrefix'),
    scopeAtRunTime: groupLabel
      ? t('rules.groupedByNamed', { name: groupLabel })
      : t('rules.groupedBy'),
  };
  const conditionText =
    conditionLabel(rule?.condition ?? null, { metricName, datasetName, ...joiners }, rule?.group_by) ??
    '';
  const scopeNote = conditionScopeNote(rule?.condition ?? null, { metricName, datasetName, ...joiners }, rule?.group_by);

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
          <Link to="/data-rules" className="rules-back">
            <ArrowLeft size={16} aria-hidden />
            {t('rules.backToList')}
          </Link>
          <h1>{isNew ? t('rules.dialogCreate') : (rule?.name ?? '—')}</h1>
          {rule ? (
            <p className="page-subtitle">
              <StatusChip tone={severityTone(rule.severity)}>{rule.severity ?? '—'}</StatusChip>{' '}
              {rule.rule_id ? ` · ${rule.rule_id}` : ''}
              {rule.owner ? ` · ${rule.owner}` : ''} · v{rule.version ?? 1}
            </p>
          ) : null}
        </div>
        <div className="page-header-actions">
          {editing ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={cancelEdit} disabled={saving}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void save()}
                disabled={saving || !form.name.trim()}
              >
                {saving ? t('rules.saving') : isNew ? t('shared.create') : t('shared.save')}
              </button>
            </>
          ) : rule ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
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
            </>
          ) : null}
        </div>
      </div>

      <div className="account-stack">
        {editing ? (
          <>
            <EntityViewPanel title={t('rules.panelBasics')}>
              <RuleBasicsForm
                value={{
                  name: form.name,
                  ruleId: form.ruleId,
                  severity: form.severity,
                  status: form.status,
                  groupField: form.groupField,
                  periodField: form.periodField,
                }}
                onChange={(next) => setForm({ ...form, ...next })}
                fields={paramCandidates}
              />
            </EntityViewPanel>

            <EntityViewPanel
              title={form.mode === 'relation' ? t('rules.panelRelation') : t('rules.panelCondition')}
              description={
                form.mode === 'relation' ? t('rules.panelRelationHint') : t('rules.panelConditionHint')
              }
            >
              {/* Two kinds of check, one place: a threshold, or an identity between metrics. */}
              <div className="ds-view-toggle rules-mode" role="tablist" aria-label={t('rules.modeAria')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={form.mode === 'condition'}
                  className={`ds-view-toggle__btn ${form.mode === 'condition' ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, mode: 'condition' })}
                >
                  {t('rules.modeCondition')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={form.mode === 'relation'}
                  className={`ds-view-toggle__btn ${form.mode === 'relation' ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, mode: 'relation' })}
                >
                  {t('rules.modeRelation')}
                </button>
              </div>

              {form.mode === 'relation' ? (
                <RelationEditor
                  value={{
                    target: form.relationTarget,
                    members: form.relationMembers,
                    toleranceKind: form.toleranceKind,
                    toleranceValue: form.toleranceValue,
                  }}
                  onChange={(next) =>
                    setForm({
                      ...form,
                      relationTarget: next.target,
                      relationMembers: next.members,
                      toleranceKind: next.toleranceKind,
                      toleranceValue: next.toleranceValue,
                    })
                  }
                  metrics={metrics}
                  metricName={metricName}
                />
              ) : null}

              {form.mode === 'condition' ? (
                <>
                  {/* The logic, in words, as the rows are edited — the editor shows fields, this shows the
                      sentence a reader would have to reconstruct from them. */}
                  <p className="rules-condition-current">
                    {conditionLabel(
                      conditionFromRows(conditionRows),
                      { metricName, datasetName, ...joiners },
                      form.groupField.trim() ? { field: form.groupField.trim() } : null,
                    ) ?? t('rules.conditionIncomplete')}
                  </p>
                  {conditionUnrepresentable ? (
                    <p className="rules-condition-warning">{t('rules.conditionUnrepresentable')}</p>
                  ) : null}
                  <ConditionRows
                  rows={conditionRows}
                  onChange={(next) => {
                    setConditionRows(next);
                    setConditionError(null);
                  }}
                  metrics={metrics}
                    datasets={datasets}
                    error={conditionError}
                  />
                </>
              ) : null}
            </EntityViewPanel>

            <EntityViewPanel title={t('rules.panelMeaning')} description={t('rules.panelMeaningHint')}>
              <div className="rules-form">
                <FormField label={t('rules.fieldConclusion')} hint={t('rules.fieldConclusionHint')}>
                  <input
                    type="text"
                    value={form.conclusion}
                    onChange={(e) => setForm({ ...form, conclusion: e.target.value })}
                  />
                </FormField>
                <FormField label={t('rules.fieldSuggestion')} hint={t('rules.fieldSuggestionHint')}>
                  <textarea
                    rows={3}
                    value={form.suggestion}
                    onChange={(e) => setForm({ ...form, suggestion: e.target.value })}
                  />
                </FormField>
              </div>
            </EntityViewPanel>
          </>
        ) : (
          <RuleReadPanels
            rule={rule!}
            conditionText={conditionText}
            scopeNote={scopeNote}
            events={events}
            busyEventId={busyEventId}
            onTransition={(event, status) => void moveEvent(event, status)}
            onDelete={() => void remove()}
            lookups={{ metricName, datasetName, ...joiners }}
          />
        )}
      </div>

      <RunRulesDialog
        open={runOpen}
        busy={running}
        onClose={() => {
          setRunOpen(false);
          setTrial(null);
        }}
        onRun={(params) => void run(params)}
        onTrial={(params) => void trialRun(params)}
        trial={trial}
        lookups={{ metricName, datasetName, ...joiners }}
      />
    </div>
  );
}
