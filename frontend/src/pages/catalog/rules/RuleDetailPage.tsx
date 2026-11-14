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
  type RuleCondition,
  type RuleOut,
  type RulesEvaluateResponse,
} from '../../../data/rulesApi';
import { transitionEvent, type EventOut } from '../../../data/eventsApi';
import { fetchMetrics, type MetricResponse } from '../../../data/metricsApi';
import { fetchDatasetMetadata, fetchDatasets, type DatasetResponse } from '../../../data/datasetsApi';
import { fetchModelFields, type SemanticModelFieldResponse } from '../../../data/semanticModelFieldsApi';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { EntityViewPanel } from '../../shared/EntityViewShell';
import { RuleReadPanels } from './RuleReadPanels';
import { RunRulesDialog, type RunParams } from './RunRulesDialog';
import { conditionLabel, conditionScopeNote } from './rulesLabels';
import { fromTree, toTree, type GroupNode } from './conditionModel';
import { ConditionTree } from './ConditionTree';
import '../../../styles/settings-page.scss';
import '../../ontology/ontology-admin.scss';
import '../../../styles/rules.scss';

type FormState = {
  name: string;
  ruleId: string;
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
  status: 'active' | 'paused';
  groupField: string;
  groupLabel: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  ruleId: '',
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
  status: 'active',
  groupField: '',
  groupLabel: '', 
};

function formFromRule(rule: RuleOut, metrics: MetricResponse[], datasets: DatasetResponse[]): FormState {
  const condition = rule.condition;
  const single = condition && 'left' in condition ? condition : null;
  const left = single?.left;
  return {
    name: rule.name ?? '',
    ruleId: rule.rule_id ?? '',
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
    status: rule.status === 'paused' ? 'paused' : 'active',
    groupField: rule.group_by?.field ?? '',
    groupLabel: rule.group_by?.label ?? '',
  };
}

function safeParse(text: string): RuleCondition | null {
  try {
    return JSON.parse(text) as RuleCondition;
  } catch {
    return null;
  }
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
  /** The condition as stored/sent — the form builder is a view over this, not a parallel copy. */
  const [conditionJson, setConditionJson] = useState('');
  const [conditionMode, setConditionMode] = useState<'form' | 'json'>('form');
  const [tree, setTree] = useState<GroupNode | null>(null);
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

  /** Fields a run parameter can filter on: the metric's model fields, or the dataset's columns. */
  useEffect(() => {
    let cancelled = false;
    const metric = metrics.find((entry) => entry.id === form.metricId);
    const dataset = datasets.find((entry) => entry.id === form.datasetId);
    void (async () => {
      try {
        if (form.subjectKind === 'metric' && metric) {
          const fields = await fetchModelFields(metric.semantic_model_id);
          if (!cancelled) {
            setParamCandidates(fields.items.map((field: SemanticModelFieldResponse) => field.name));
          }
        } else if (form.subjectKind === 'dataset' && dataset) {
          const columns = await fetchDatasetMetadata(dataset.id);
          if (!cancelled) setParamCandidates(columns.map((column) => column.column_name));
        } else if (!cancelled) {
          setParamCandidates([]);
        }
      } catch {
        if (!cancelled) setParamCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.subjectKind, form.metricId, form.datasetId, metrics, datasets]);

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
      setConditionJson(JSON.stringify(current.condition ?? {}, null, 2));
      const converted = toTree(current.condition);
      if (converted.tree) {
        setTree(converted.tree);
        setConditionMode('form');
      } else {
        setTree(null);
        setConditionMode('json');
      }
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
      const empty: GroupNode = {
        id: 'root',
        kind: 'group',
        mode: 'all',
        children: [
          {
            id: 'first',
            kind: 'cmp',
            operand: { kind: 'metric', metricId: pickers.metrics[0]?.id ?? '' },
            op: '>',
            value: '0',
          },
        ],
      };
      setTree(empty);
      setConditionJson(JSON.stringify(fromTree(empty), null, 2));
    });
  }, [isNew, loadPickers]);

  /** The tree is the form's source of truth; the JSON view edits the same object. */
  const updateTree = (next: GroupNode) => {
    setTree(next);
    setConditionJson(JSON.stringify(fromTree(next), null, 2));
    setConditionError(null);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    let condition: RuleCondition;
    if (conditionMode === 'form') {
      if (!tree) {
        setConditionError(t('rules.conditionFormCannotRepresent'));
        return;
      }
      condition = fromTree(tree);
    } else {
      try {
        condition = JSON.parse(conditionJson) as RuleCondition;
      } catch {
        setConditionError(t('rules.conditionJsonInvalid'));
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        rule_id: form.ruleId.trim() || null,
        subject: {
          kind: form.subjectKind,
          ref: form.subjectKind === 'metric' ? form.metricId : form.datasetId,
        },
        condition,
        severity: form.severity,
        conclusion: form.conclusion.trim(),
        suggestion: form.suggestion.trim(),
        about_object_type: form.aboutObjectType.trim() || null,
        status: form.status,
        group_by: form.groupField.trim()
          ? { field: form.groupField.trim(), label: form.groupLabel.trim() || null }
          : null,
      };
      if (isNew) {
        const created = await createRule(payload);
        toast.success(t('rules.toastCreated'));
        navigate(`/data-rules/${created.object_id}`, { replace: true });
      } else if (rule) {
        const updated = await updateRule(rule.object_id, payload);
        setRule(updated);
        setForm(formFromRule(updated, metrics, datasets));
        setConditionJson(JSON.stringify(updated.condition ?? {}, null, 2));
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
      setConditionJson(JSON.stringify(rule.condition ?? {}, null, 2));
      const converted = toTree(rule.condition);
      if (converted.tree) {
        setTree(converted.tree);
        setConditionMode('form');
      } else {
        setTree(null);
        setConditionMode('json');
      }
    }
    setConditionError(null);
    setEditing(false);
  };

  const run = async (params: RunParams) => {
    if (!rule) return;
    setRunning(true);
    try {
      const result = await evaluateRule(rule.object_id, params);
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
      setTrial(await evaluateRule(rule.object_id, { ...params, dry_run: true }));
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
      navigate('/data-rules');
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
  const readTree = useMemo(() => toTree(rule?.condition ?? null).tree, [rule]);
  const conditionText = conditionLabel(rule?.condition ?? null, { metricName, datasetName, ...joiners }, rule?.group_by);
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
              {rule.subject?.kind === 'dataset' ? t('rules.subjectDataset') : t('rules.subjectMetric')}
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
              <div className="rules-form">
                <FormField label={t('rules.fieldName')}>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={t('rules.fieldNamePlaceholder')}
                  />
                </FormField>
                <FormField label={t('rules.fieldRuleId')} hint={t('rules.fieldRuleIdHint')}>
                  <input
                    type="text"
                    value={form.ruleId}
                    onChange={(e) => setForm({ ...form, ruleId: e.target.value })}
                    placeholder={t('rules.fieldRuleIdPlaceholder')}
                    autoComplete="off"
                  />
                </FormField>
                <FormField label={t('rules.fieldSubject')} hint={t('rules.fieldSubjectHint')}>
                  <select
                    value={form.subjectKind}
                    onChange={(e) => setForm({ ...form, subjectKind: e.target.value as FormState['subjectKind'] })}
                  >
                    <option value="metric">{t('rules.subjectMetric')}</option>
                    <option value="dataset">{t('rules.subjectDataset')}</option>
                  </select>
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
                <FormField label={t('rules.fieldStatus')}>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as FormState['status'] })}
                  >
                    <option value="active">{t('rules.active')}</option>
                    <option value="paused">{t('rules.paused')}</option>
                  </select>
                </FormField>
                <FormField label={t('rules.groupField')} hint={t('rules.groupFieldHint')}>
                  <input
                    type="text"
                    value={form.groupField}
                    onChange={(e) => setForm({ ...form, groupField: e.target.value })}
                    placeholder="scenario_id"
                    list="rule-group-fields"
                  />
                  <datalist id="rule-group-fields">
                    {paramCandidates.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </FormField>
                {form.groupField.trim() ? (
                  <FormField label={t('rules.groupLabel')} hint={t('rules.groupLabelHint')}>
                    <input
                      type="text"
                      value={form.groupLabel}
                      onChange={(e) => setForm({ ...form, groupLabel: e.target.value })}
                      placeholder={t('rules.groupLabelPlaceholder')}
                    />
                  </FormField>
                ) : null}
              </div>
            </EntityViewPanel>

            <EntityViewPanel title={t('rules.panelCondition')} description={t('rules.panelConditionHint')}>
              <p className="rules-condition-current">
                {tree ? conditionLabel(fromTree(tree), { metricName, datasetName, ...joiners }, rule?.group_by) : conditionText}
              </p>
              {tree ? (
                <ConditionTree
                  value={tree}
                  onChange={updateTree}
                  metrics={metrics}
                  datasets={datasets}
                  scopeNote={scopeNote}
                />
              ) : (
                <p className="rules-condition-warning">{t('rules.conditionFormCannotRepresent')}</p>
              )}
              <details className="condition-advanced" open={conditionMode === 'json'}>
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    if (conditionMode === 'json') {
                      // Leaving the JSON view adopts it into the builder — or refuses, because the
                      // builder cannot draw it and saving the stale builder would lose the edit.
                      const converted = toTree(safeParse(conditionJson));
                      if (!converted.tree) {
                        setConditionError(t('rules.conditionFormCannotRepresent'));
                        return;
                      }
                      setTree(converted.tree);
                    }
                    setConditionError(null);
                    setConditionMode(conditionMode === 'json' ? 'form' : 'json');
                  }}
                >
                  {t('rules.conditionAdvanced')}
                </summary>
                {conditionMode === 'json' ? (
                  <>
                    <p className="settings-page-hint">{t('rules.conditionAdvancedHint')}</p>
                    <FormField label={t('rules.conditionJson')} hint={t('rules.conditionJsonHint')}>
                      <textarea
                        rows={16}
                        className="ds-control rules-json-editor"
                        value={conditionJson}
                        onChange={(event) => {
                          setConditionJson(event.target.value);
                          setConditionError(null);
                          const converted = toTree(safeParse(event.target.value));
                          if (converted.tree) setTree(converted.tree);
                        }}
                      />
                    </FormField>
                  </>
                ) : null}
              </details>
              {conditionError ? <p className="rules-condition-warning">{conditionError}</p> : null}
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
                <FormField label={t('rules.fieldAbout')} hint={t('rules.fieldAboutHint')}>
                  <input
                    type="text"
                    value={form.aboutObjectType}
                    onChange={(e) => setForm({ ...form, aboutObjectType: e.target.value })}
                    placeholder={t('rules.fieldAboutPlaceholder')}
                  />
                </FormField>
              </div>
            </EntityViewPanel>
          </>
        ) : (
          <RuleReadPanels
            rule={rule!}
            readTree={readTree}
            conditionText={conditionText}
            scopeNote={scopeNote}
            events={events}
            busyEventId={busyEventId}
            onTransition={(event, status) => void moveEvent(event, status)}
            onDelete={() => void remove()}
            lookups={{ metricName, datasetName, ...joiners }}
            metrics={metrics}
            datasets={datasets}
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
